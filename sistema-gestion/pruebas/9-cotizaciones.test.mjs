// Cotizaciones: cómo se leen las líneas del formulario, qué estado se acepta y
// en qué viajes se convierte una cotización aceptada.
//
// Sobre la CORRELATIVIDAD del número: no se prueba acá y no es un olvido. La
// asigna next_cotizacion_numero() dentro de Postgres con un
// `update … returning`, que es atómico: dos usuarios creando al mismo tiempo se
// serializan y el segundo espera. Además hay un `unique (empresa_id, numero)`
// como red. Probar eso de verdad requiere dos transacciones concurrentes contra
// la base, así que vive en npm run test:esquema, no acá.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avisoViajes,
  parsearItems,
  estadoCotizacion,
  viajesDesdeCotizacion,
} from "@/lib/cotizaciones";
import { calcularTotales } from "@/lib/totales";
import { nombreArchivo } from "@/lib/format";

// ---------------------------------------------------------------------------
// Las líneas llegan como JSON en un campo oculto
// ---------------------------------------------------------------------------

test("lee las líneas del formulario", () => {
  const items = parsearItems(
    JSON.stringify([
      { fecha: "2026-05-10", descripcion: "Traslado aeropuerto", valor_unitario: 120000 },
      { fecha: null, descripcion: "Espera", valor_unitario: 15000 },
    ]),
  );
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    fecha: "2026-05-10",
    descripcion: "Traslado aeropuerto",
    valor_unitario: 120000,
  });
  assert.equal(items[1].fecha, null);
});

test("un JSON roto no tira la pantalla: devuelve vacío", () => {
  // El campo viene del navegador, así que puede llegar cortado o manipulado.
  // Sin líneas, la action responde "Agrega al menos una línea", que es mejor
  // que una pantalla de error.
  assert.deepEqual(parsearItems("{no es json"), []);
  assert.deepEqual(parsearItems(""), []);
  assert.deepEqual(parsearItems(null), []);
  assert.deepEqual(parsearItems(undefined), []);
});

test("un JSON válido que no es una lista tampoco rompe", () => {
  assert.deepEqual(parsearItems('{"descripcion":"x"}'), []);
  assert.deepEqual(parsearItems("42"), []);
  assert.deepEqual(parsearItems("null"), []);
});

test("la fila del todo vacía se descarta", () => {
  // El formulario siempre deja una fila al final para seguir escribiendo.
  const items = parsearItems(
    JSON.stringify([
      { fecha: "", descripcion: "", valor_unitario: 0 },
      { fecha: "", descripcion: "Real", valor_unitario: 1000 },
    ]),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].descripcion, "Real");
});

test("la fila a medio llenar se CONSERVA", () => {
  // Descripción sin valor, o valor sin descripción: está a medio escribir, no
  // es basura. Borrarla en silencio le hace perder al usuario lo que tipeó.
  assert.equal(parsearItems(JSON.stringify([{ descripcion: "Sin precio aún", valor_unitario: 0 }])).length, 1);
  assert.equal(parsearItems(JSON.stringify([{ descripcion: "", valor_unitario: 50000 }])).length, 1);
});

test("un valor no numérico vale cero y no rompe el guardado", () => {
  const items = parsearItems(JSON.stringify([{ descripcion: "X", valor_unitario: "abc" }]));
  assert.equal(items[0].valor_unitario, 0);
  assert.ok(!Number.isNaN(items[0].valor_unitario), "cero, nunca NaN");
});

test("se recortan los espacios de la descripción", () => {
  const items = parsearItems(JSON.stringify([{ descripcion: "  Traslado  ", valor_unitario: 1 }]));
  assert.equal(items[0].descripcion, "Traslado");
});

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

test("acepta los cuatro estados reales", () => {
  for (const e of ["borrador", "enviada", "aceptada", "rechazada"]) {
    assert.equal(estadoCotizacion(e), e);
  }
});

test("cualquier otra cosa cae en borrador, que es el estado que no compromete", () => {
  assert.equal(estadoCotizacion("facturada"), "borrador");
  assert.equal(estadoCotizacion("ACEPTADA"), "borrador");
  assert.equal(estadoCotizacion(""), "borrador");
  assert.equal(estadoCotizacion(null), "borrador");
  assert.equal(estadoCotizacion(undefined), "borrador");
});

// ---------------------------------------------------------------------------
// Aceptar una cotización genera los viajes
// ---------------------------------------------------------------------------

const cot = {
  id: "cot-1",
  cliente_id: "cli-1",
  items: [
    { descripcion: "Día 2", fecha: "2026-05-02", valor_unitario: 200000, orden: 1 },
    { descripcion: "Día 1", fecha: "2026-05-01", valor_unitario: 100000, orden: 0 },
    { descripcion: "Sin fecha", fecha: null, valor_unitario: 50000, orden: 2 },
  ],
};

test("cada línea se convierte en un viaje programado", () => {
  const viajes = viajesDesdeCotizacion(cot, "2026-05-20");
  assert.equal(viajes.length, 3);
  assert.ok(viajes.every((v) => v.estado === "programado"));
  assert.ok(viajes.every((v) => v.cotizacion_id === "cot-1" && v.cliente_id === "cli-1"));
});

test("se respeta el ORDEN del documento, no el de la consulta", () => {
  // El viaje 1 tiene que ser la línea 1 de la cotización que vio el cliente.
  const viajes = viajesDesdeCotizacion(cot, "2026-05-20");
  assert.deepEqual(viajes.map((v) => v.descripcion), ["Día 1", "Día 2", "Sin fecha"]);
});

test("una línea sin fecha arranca hoy", () => {
  const viajes = viajesDesdeCotizacion(cot, "2026-05-20");
  assert.equal(viajes[2].fecha_inicio, "2026-05-20");
});

test("el valor del viaje es SIN IVA: sumarlos da el subtotal, no el total", () => {
  // El IVA es del documento, no del servicio. Si los viajes llevaran IVA, al
  // facturarlos se cobraría el impuesto dos veces.
  const viajes = viajesDesdeCotizacion(cot, "2026-05-20");
  const suma = viajes.reduce((a, v) => a + v.valor, 0);
  const totales = calcularTotales(
    cot.items.map((i) => ({ valor_unitario: i.valor_unitario })),
    false,
  );
  assert.equal(suma, totales.subtotal);
  assert.notEqual(suma, totales.total);
});

test("una cotización sin líneas no genera viajes", () => {
  assert.deepEqual(viajesDesdeCotizacion({ ...cot, items: [] }, "2026-05-20"), []);
});

// ---------------------------------------------------------------------------
// El aviso: aceptar tiene que DECIR que registró los viajes
//
// Los viajes se creaban bien, pero en silencio, y el viaje nace `programado`,
// así que tampoco movía ningún contador del panel ("Por facturar" cuenta los
// realizados sin factura). Sin este aviso, aceptar una cotización se veía
// exactamente igual que si la función no existiera.
// ---------------------------------------------------------------------------

test("avisa cuántos viajes quedaron registrados", () => {
  assert.equal(
    avisoViajes({ tipo: "creados", cantidad: 4 }).mensaje,
    "4 viajes registrados con éxito en Viajes",
  );
});

test("con un solo viaje el mensaje va en singular", () => {
  // "1 viajes registrados" es la clase de detalle que delata que el sistema no
  // está mirando lo que hizo.
  assert.equal(
    avisoViajes({ tipo: "creados", cantidad: 1 }).mensaje,
    "Viaje registrado con éxito en Viajes",
  );
});

test("re-aceptar no promete viajes nuevos, pero tampoco calla", () => {
  const r = avisoViajes({ tipo: "ya_estaban" });
  assert.match(r.mensaje, /ya estaban/i);
  assert.equal(r.error, undefined);
});

test("el fallo viaja como error, no como confirmación", () => {
  // El caso real: cotización aceptada sin cliente. Antes la action devolvía
  // este texto y nadie lo leía, así que se perdía.
  const r = avisoViajes({ tipo: "error", mensaje: "sin cliente no se pueden generar" });
  assert.equal(r.error, "sin cliente no se pueden generar");
  assert.equal(r.mensaje, undefined);
});

test("cuando no había nada que hacer no se inventa un aviso", () => {
  // Pasar a "enviada" o "rechazada" no genera viajes: mostrar un cartel verde
  // ahí entrena a la gente a ignorarlo.
  assert.deepEqual(avisoViajes({ tipo: "nada" }), {});
});

// ---------------------------------------------------------------------------
// Exportación: el nombre del archivo (T017)
// ---------------------------------------------------------------------------

test("el nombre de archivo conserva las letras acentuadas en vez de borrarlas", () => {
  // La versión que había en los informes (`replace(/[^\w-]/g,\"\")`) borraba la
  // letra entera: \"Ñuñoa\" quedaba en \"uoa\".
  assert.equal(nombreArchivo("Ñuñoa"), "Nunoa");
  assert.equal(nombreArchivo("Río Añañuca"), "Rio_Ananuca");
});

test("no puede romper la cabecera Content-Disposition", () => {
  // El nombre va dentro de filename=\"…\". Una comilla o un salto de línea ahí
  // no rompen el nombre: rompen la cabecera.
  for (const feo of ['cliente"; drop', "con\nsalto", "con\r\nCRLF", "..\\..\\etc"]) {
    const n = nombreArchivo(feo);
    assert.ok(!/["\r\n\\/]/.test(n), `quedó un carácter peligroso en ${JSON.stringify(n)}`);
  }
});

test("si no queda nada usable, hay un nombre por defecto", () => {
  assert.equal(nombreArchivo("   "), "documento");
  assert.equal(nombreArchivo("¿¡!?"), "documento");
  assert.equal(nombreArchivo("", "servicios"), "servicios");
});

test("no deja guiones bajos repetidos ni en los bordes", () => {
  assert.equal(nombreArchivo("  Informe   de   mayo  "), "Informe_de_mayo");
});
