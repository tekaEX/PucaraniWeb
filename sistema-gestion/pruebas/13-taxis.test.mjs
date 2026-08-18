// Tipos de servicio de taxi.
//
// Son los siete del talonario físico y esa lista no es una preferencia de la
// app: los seis primeros son casillas impresas en el papel que el pasajero
// firma, en ese orden, y "Especial" es la línea que se escribe a mano —el único
// tipo cuyo nombre no dice qué fue el servicio, y por eso el único que pide
// descripción—.
//
// Lo que se fija acá es que la lista, el papel y la base no se separen: agregar
// o quitar un tipo obliga a tocar el CHECK de `servicios_taxi.tipo` y el vale.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TAXI_TIPOS,
  TAXI_TIPO_CON_DESCRIPCION,
  taxiPideDescripcion,
  taxiTipoLabel,
} from "@/types/db";

const ESPERADOS = [
  "aeropuerto_arica",
  "arica_aeropuerto",
  "tacna_peru",
  "local",
  "taxi_exclusivo",
  "taxi_compartido",
  "especial",
];

test("son los siete tipos, en el orden del talonario", () => {
  assert.deepEqual(Object.keys(TAXI_TIPOS), ESPERADOS);
});

test("el vale tiene SEIS casillas: 'Especial' se escribe a mano", () => {
  const conCasilla = ESPERADOS.filter((t) => TAXI_TIPOS[t].casilla);
  assert.equal(conCasilla.length, 6);
  assert.ok(!TAXI_TIPOS.especial.casilla, "Especial no tiene casilla en el papel");
  assert.deepEqual(conCasilla, ESPERADOS.slice(0, 6), "las casillas van primero y en orden");
});

test("el texto impreso de cada casilla es el del papel", () => {
  // Si esto cambia, cambia lo que el pasajero lee y firma.
  assert.deepEqual(
    ESPERADOS.map((t) => TAXI_TIPOS[t].vale),
    [
      "AEROPUERTO CIUDAD ARICA",
      "CIUDAD ARICA AEROPUERTO",
      "TACNA-PERÚ",
      "SERVICIO LOCAL",
      "TAXI EXCLUSIVO",
      "TAXI COMPARTIDO",
      "ESPECIAL",
    ],
  );
});

test("cada tipo tiene nombre para mostrar y un monto (o null)", () => {
  for (const [clave, t] of Object.entries(TAXI_TIPOS)) {
    assert.ok(t.label.length > 0, `${clave} sin label`);
    assert.ok(t.vale.length > 0, `${clave} sin texto de vale`);
    assert.ok(t.monto === null || t.monto > 0, `${clave} con monto raro: ${t.monto}`);
  }
});

test("solo los dos traslados al aeropuerto tienen tarifa por defecto", () => {
  // Es la que precarga el formulario; el resto se cobra según el servicio.
  assert.equal(TAXI_TIPOS.aeropuerto_arica.monto, 8000);
  assert.equal(TAXI_TIPOS.arica_aeropuerto.monto, 8000);
  for (const t of ["tacna_peru", "local", "taxi_exclusivo", "taxi_compartido", "especial"]) {
    assert.equal(TAXI_TIPOS[t].monto, null, `${t} no debería traer tarifa fija`);
  }
});

test("solo 'Especial' pide descripción", () => {
  // De eso depende que el formulario muestre el campo, que el servidor lo
  // exija, y que el vale imprima la línea escrita a mano.
  assert.equal(TAXI_TIPO_CON_DESCRIPCION, "especial");
  assert.ok(taxiPideDescripcion("especial"));
  for (const t of ESPERADOS.filter((x) => x !== "especial")) {
    assert.ok(!taxiPideDescripcion(t), `${t} no debería pedir descripción`);
  }
});

test("el tipo que pide descripción es justo el que no tiene casilla", () => {
  // No es casualidad: no tiene casilla porque en el papel se escribe, y se
  // escribe porque su nombre no alcanza para saber qué fue el servicio.
  const sinCasilla = ESPERADOS.filter((t) => !TAXI_TIPOS[t].casilla);
  assert.deepEqual(sinCasilla, [TAXI_TIPO_CON_DESCRIPCION]);
});

test("un tipo que la app no conoce se muestra crudo, no rompe la pantalla", () => {
  // Puede pasar con una fila de un respaldo viejo restaurado. Leer
  // `TAXI_TIPOS[tipo].label` a ciegas tiraba toda la lista de servicios por
  // una sola fila.
  assert.equal(taxiTipoLabel("local"), "Servicio local");
  assert.equal(taxiTipoLabel("aeropuerto"), "aeropuerto", "el alias viejo del respaldo");
  assert.equal(taxiTipoLabel(""), "");
});
