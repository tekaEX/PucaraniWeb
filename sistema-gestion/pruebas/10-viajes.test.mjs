// Viajes: el ciclo programado → realizado → facturable, la utilidad por viaje y
// la lectura de las asignaciones de chofer/vehículo.
//
// El estado de facturación de un viaje NO es una columna: se DERIVA de su
// estado y de si tiene factura. Es lo que pide la Constitución §V, y es lo que
// hace que estas pruebas importen: si alguien agrega un campo "facturado" y lo
// mantiene a mano, la lista de "por facturar" y el KPI del dashboard empiezan a
// discrepar y nadie sabe cuál está bien.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  viajePorFacturar,
  costoTotalViaje,
  utilidadViaje,
  margenViaje,
} from "@/types/db";
import { parsearAsignaciones, estadoViaje } from "@/lib/viajes";

// ---------------------------------------------------------------------------
// El ciclo: programado → realizado → facturable (T023)
// ---------------------------------------------------------------------------

test("un viaje PROGRAMADO no se factura: todavía no ocurrió", () => {
  assert.equal(viajePorFacturar({ estado: "programado", factura_id: null }), false);
});

test("un viaje REALIZADO y sin factura SÍ está por facturar", () => {
  assert.equal(viajePorFacturar({ estado: "realizado", factura_id: null }), true);
});

test("al asignarle factura deja de estar por facturar", () => {
  assert.equal(viajePorFacturar({ estado: "realizado", factura_id: "fac-1" }), false);
});

test("un viaje CANCELADO no se factura aunque no tenga factura", () => {
  // No salió: no hay nada que cobrar.
  assert.equal(viajePorFacturar({ estado: "cancelado", factura_id: null }), false);
});

test("el ciclo completo de un mismo viaje", () => {
  const viaje = { estado: "programado", factura_id: null };
  assert.equal(viajePorFacturar(viaje), false, "recién programado");

  viaje.estado = "realizado";
  assert.equal(viajePorFacturar(viaje), true, "se hizo y nadie lo facturó");

  viaje.factura_id = "fac-99";
  assert.equal(viajePorFacturar(viaje), false, "ya está en una factura");
});

// ---------------------------------------------------------------------------
// Utilidad por viaje (T024)
// ---------------------------------------------------------------------------

const viaje = (valor, costos = {}) => ({
  valor,
  costo_combustible: costos.combustible ?? 0,
  costo_peajes: costos.peajes ?? 0,
  costo_viaticos: costos.viaticos ?? 0,
  costo_otros: costos.otros ?? 0,
});

test("el costo total suma los cuatro conceptos", () => {
  const v = viaje(0, { combustible: 40000, peajes: 8000, viaticos: 15000, otros: 2000 });
  assert.equal(costoTotalViaje(v), 65000);
});

test("utilidad = valor − costos", () => {
  const v = viaje(300000, { combustible: 40000, peajes: 8000, viaticos: 15000, otros: 2000 });
  assert.equal(utilidadViaje(v), 235000);
  assert.equal(margenViaje(v), 78);
});

test("un viaje que costó más de lo que se cobró da utilidad NEGATIVA", () => {
  // Y así tiene que verse. Recortar a cero escondería justo el caso que hay
  // que poder detectar.
  const v = viaje(100000, { combustible: 90000, peajes: 30000 });
  assert.equal(utilidadViaje(v), -20000);
  assert.equal(margenViaje(v), -20);
});

test("sin costos cargados la utilidad es el valor entero", () => {
  // No es que el viaje no haya costado nada: es que todavía no se cargó. La
  // cifra es optimista a propósito y se corrige al cargar los costos.
  assert.equal(utilidadViaje({ valor: 150000 }), 150000);
  assert.equal(costoTotalViaje({}), 0);
});

test("sin valor cargado el margen es null, no 0%", () => {
  // 0% diría que se trabajó a pérdida total; lo que pasa es que no se sabe.
  assert.equal(margenViaje({ valor: 0, costo_peajes: 5000 }), null);
  assert.equal(margenViaje({ costo_peajes: 5000 }), null);
});

test("los campos que llegan como texto desde la base no rompen la cuenta", () => {
  // PostgREST devuelve numeric como string. Sin el Number() de por medio,
  // "40000" + "8000" daría "400008000".
  const v = {
    valor: "300000",
    costo_combustible: "40000",
    costo_peajes: "8000",
    costo_viaticos: 0,
    costo_otros: 0,
  };
  assert.equal(costoTotalViaje(v), 48000);
  assert.equal(utilidadViaje(v), 252000);
});

// ---------------------------------------------------------------------------
// Asignación de chofer y vehículo (T027)
// ---------------------------------------------------------------------------

test("lee las asignaciones del formulario", () => {
  const a = parsearAsignaciones(
    JSON.stringify([
      { chofer_id: "cho-1", vehiculo_id: "ABCD12", fecha: "2026-05-10" },
      { chofer_id: "cho-2", vehiculo_id: "EFGH34", fecha: null },
    ]),
  );
  assert.equal(a.length, 2);
  assert.equal(a[0].vehiculo_id, "ABCD12");
  assert.equal(a[1].fecha, null, "sin fecha = todo el servicio");
});

test("se conserva la asignación con solo uno de los dos", () => {
  // "Este bus, chofer por confirmar" es un estado real de la operación.
  const soloBus = parsearAsignaciones(JSON.stringify([{ vehiculo_id: "ABCD12" }]));
  const soloChofer = parsearAsignaciones(JSON.stringify([{ chofer_id: "cho-1" }]));
  assert.equal(soloBus.length, 1);
  assert.equal(soloBus[0].chofer_id, null);
  assert.equal(soloChofer.length, 1);
  assert.equal(soloChofer[0].vehiculo_id, null);
});

test("se descarta la asignación vacía: no dice nada", () => {
  assert.deepEqual(parsearAsignaciones(JSON.stringify([{ chofer_id: "", vehiculo_id: "" }])), []);
  assert.deepEqual(parsearAsignaciones(JSON.stringify([{}])), []);
});

test("un JSON roto no tira la pantalla", () => {
  assert.deepEqual(parsearAsignaciones("{roto"), []);
  assert.deepEqual(parsearAsignaciones(null), []);
  assert.deepEqual(parsearAsignaciones('"texto"'), []);
});

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

test("los estados válidos pasan; cualquier otra cosa cae en programado", () => {
  assert.equal(estadoViaje("programado"), "programado");
  assert.equal(estadoViaje("realizado"), "realizado");
  assert.equal(estadoViaje("cancelado"), "cancelado");
  // Programado es el que NO afirma que el viaje ocurrió: si el dato llega
  // roto, lo seguro es no dar por hecho que ya se prestó el servicio.
  assert.equal(estadoViaje("facturado"), "programado");
  assert.equal(estadoViaje(null), "programado");
});
