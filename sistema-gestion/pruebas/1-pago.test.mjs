// Prueba intensiva del cálculo de plata: reglaVigente / calcularPagoDia /
// agruparPorDia. Importa el archivo REAL del proyecto (src/lib/encomiendas/pago.ts).
import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorDia,
  calcularPagoDia,
  contarActividad,
  ingresoEstimado,
  reglaVigente,
  valorPedido,
  PAGO_CERO,
} from "@/lib/encomiendas/pago";
import { VALOR_APROXIMADO_PEDIDO } from "@/lib/encomiendas/config";

const R = (o) => ({
  id: o.id ?? "r",
  empresa_id: "e",
  chofer_id: o.chofer_id ?? null,
  tipo_pago: o.tipo_pago ?? "monto_fijo",
  valor_pago: o.valor_pago ?? 0,
  valor_pedido: "valor_pedido" in o ? o.valor_pedido : VALOR_APROXIMADO_PEDIDO,
  monto_dia: o.monto_dia ?? 0,
  meta_entregas_dia: o.meta_entregas_dia ?? null,
  bono_monto: o.bono_monto ?? null,
  vigente_desde: o.vigente_desde ?? "2026-01-01",
  created_at: o.created_at ?? "2026-01-01T00:00:00+00:00",
});

const EV = (o) => ({
  chofer_id: "chofer_id" in o ? o.chofer_id : "c1",
  fecha: o.fecha ?? "2026-08-01",
  tipo: o.tipo ?? "entrega",
  origen: o.origen ?? "app",
});

// ---------------------------------------------------------------- ingresos
test("ingresoEstimado es lineal y siempre entero", () => {
  assert.equal(ingresoEstimado(0, 950), 0);
  assert.equal(ingresoEstimado(1, 950), 950);
  assert.equal(ingresoEstimado(37, 1200), 37 * 1200);
  // ingresos_totales es integer en la base: un valor con decimales no puede
  // filtrarse como tal.
  assert.ok(Number.isInteger(ingresoEstimado(7, 1333.33)));
  assert.ok(Number.isInteger(ingresoEstimado(300, 950)));
});

// ------------------------------------------------------- valor por entrega
test("el valor por entrega sale de la regla vigente (0029)", () => {
  assert.equal(valorPedido(R({ valor_pedido: 1400 })), 1400);
  assert.equal(valorPedido(R({ valor_pedido: "1400" })), 1400, "PostgREST puede mandarlo string");
});

test("sin regla, o con una anterior a la 0029, cae al respaldo", () => {
  assert.equal(valorPedido(null), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(undefined), VALOR_APROXIMADO_PEDIDO);
  // Regla vieja: la columna no existe todavía en esa fila.
  assert.equal(valorPedido(R({ valor_pedido: undefined })), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(R({ valor_pedido: null })), VALOR_APROXIMADO_PEDIDO);
  // Cero no es un valor válido: dejaría todos los ingresos en $0 sin avisar.
  assert.equal(valorPedido(R({ valor_pedido: 0 })), VALOR_APROXIMADO_PEDIDO);
  assert.equal(valorPedido(R({ valor_pedido: "no es un número" })), VALOR_APROXIMADO_PEDIDO);
});

test("cambiar el valor por entrega NO reescribe lo que ya se liquidó", () => {
  // Es el motivo por el que valor_pedido vive en la regla y no en un ajuste
  // global: cada día se valora con la regla que regía ESE día.
  const reglas = [
    R({ id: "vieja", valor_pedido: 950, vigente_desde: "2026-01-01" }),
    R({ id: "nueva", valor_pedido: 1400, vigente_desde: "2026-08-01" }),
  ];
  const enJulio = reglaVigente(reglas, "c1", "2026-07-15");
  const enAgosto = reglaVigente(reglas, "c1", "2026-08-15");
  assert.equal(ingresoEstimado(10, valorPedido(enJulio)), 9500);
  assert.equal(ingresoEstimado(10, valorPedido(enAgosto)), 14000);
});

test("con pago por porcentaje, el valor por entrega mueve el sueldo del conductor", () => {
  // Por eso los dos tienen que quedar congelados juntos en la misma regla.
  const alCincuenta = (valor) =>
    calcularPagoDia({ entregados: 10, omitidos: 0 }, R({ tipo_pago: "porcentaje", valor_pago: 50, valor_pedido: valor })).base;
  assert.equal(alCincuenta(950), Math.round((10 * 950 * 50) / 100));
  assert.equal(alCincuenta(1400), Math.round((10 * 1400 * 50) / 100));
  assert.ok(alCincuenta(1400) > alCincuenta(950));
});

// ------------------------------------------------------------ reglaVigente
test("el override del chofer gana sobre la general aunque sea más antiguo", () => {
  const reglas = [
    R({ id: "gen", chofer_id: null, vigente_desde: "2026-07-01" }),
    R({ id: "ovr", chofer_id: "c1", vigente_desde: "2026-01-01" }),
  ];
  assert.equal(reglaVigente(reglas, "c1", "2026-08-01").id, "ovr");
  assert.equal(reglaVigente(reglas, "c2", "2026-08-01").id, "gen");
});

test("una regla que empieza después de la fecha no aplica", () => {
  const reglas = [R({ id: "futura", vigente_desde: "2026-09-01" })];
  assert.equal(reglaVigente(reglas, "c1", "2026-08-01"), null);
  assert.equal(reglaVigente(reglas, "c1", "2026-09-01").id, "futura");
});

test("un override futuro no tapa la general vigente", () => {
  const reglas = [
    R({ id: "gen", chofer_id: null, vigente_desde: "2026-01-01" }),
    R({ id: "ovrFuturo", chofer_id: "c1", vigente_desde: "2026-12-01" }),
  ];
  assert.equal(reglaVigente(reglas, "c1", "2026-08-01").id, "gen");
});

test("mismo vigente_desde: desempata created_at, y los microsegundos de PostgREST no lo invierten", () => {
  // PostgREST omite los microsegundos cuando son 0: el string más CORTO es el
  // más antiguo, aunque comparado como texto "T14:23:05+00:00" > "T14:23:05.000001+00:00".
  const reglas = [
    R({ id: "vieja", vigente_desde: "2026-08-01", created_at: "2026-08-01T14:23:05+00:00" }),
    R({ id: "nueva", vigente_desde: "2026-08-01", created_at: "2026-08-01T14:23:05.000001+00:00" }),
  ];
  assert.equal(reglaVigente(reglas, "c1", "2026-08-05").id, "nueva");
  assert.equal(reglaVigente([...reglas].reverse(), "c1", "2026-08-05").id, "nueva");
});

test("reglaVigente es determinista: el orden de entrada no cambia el resultado", () => {
  const reglas = [
    R({ id: "a", vigente_desde: "2026-01-01", created_at: "2026-01-01T00:00:00+00:00" }),
    R({ id: "b", vigente_desde: "2026-05-01", created_at: "2026-05-01T00:00:00+00:00" }),
    R({ id: "c", chofer_id: "c1", vigente_desde: "2026-02-01" }),
    R({ id: "d", chofer_id: "c9", vigente_desde: "2026-06-01" }),
  ];
  const esperado = reglaVigente(reglas, "c1", "2026-08-01").id;
  for (let i = 0; i < 200; i++) {
    const mezcla = [...reglas].sort(() => Math.random() - 0.5);
    assert.equal(reglaVigente(mezcla, "c1", "2026-08-01").id, esperado);
  }
});

test("sin choferId (día de conductor eliminado) usa la regla general", () => {
  const reglas = [R({ id: "gen", chofer_id: null }), R({ id: "ovr", chofer_id: "c1" })];
  assert.equal(reglaVigente(reglas, null, "2026-08-01").id, "gen");
});

test("lista vacía de reglas devuelve null (el día queda 'Sin regla')", () => {
  assert.equal(reglaVigente([], "c1", "2026-08-01"), null);
});

// --------------------------------------------------------- calcularPagoDia
test("sin regla el pago es cero", () => {
  assert.deepEqual(calcularPagoDia({ entregados: 50, omitidos: 3 }, null), PAGO_CERO);
});

test("monto fijo por pedido + fijo diario", () => {
  const regla = R({ tipo_pago: "monto_fijo", valor_pago: 300, monto_dia: 15000 });
  assert.deepEqual(calcularPagoDia({ entregados: 20, omitidos: 4 }, regla), {
    base: 6000,
    dia: 15000,
    bono: 0,
    total: 21000,
  });
});

test("porcentaje sobre el ingreso estimado, redondeado", () => {
  const regla = R({ tipo_pago: "porcentaje", valor_pago: 7.5 });
  // 20 entregas × 950 = 19.000 → 7,5 % = 1.425
  assert.equal(calcularPagoDia({ entregados: 20, omitidos: 0 }, regla).base, 1425);
  // 7 × 950 = 6.650 → 7,5 % = 498,75 → 499
  assert.equal(calcularPagoDia({ entregados: 7, omitidos: 0 }, regla).base, 499);
});

test("numeric que llega como string (PostgREST) no rompe la cuenta", () => {
  const regla = R({ tipo_pago: "monto_fijo", valor_pago: "300.00", monto_dia: "15000" });
  const pago = calcularPagoDia({ entregados: 10, omitidos: 0 }, regla);
  assert.deepEqual(pago, { base: 3000, dia: 15000, bono: 0, total: 18000 });
  for (const v of Object.values(pago)) assert.equal(typeof v, "number");
});

test("el bono se paga AL ALCANZAR la meta (>=), no al superarla", () => {
  const regla = R({ meta_entregas_dia: 30, bono_monto: 10000, valor_pago: 0 });
  assert.equal(calcularPagoDia({ entregados: 29, omitidos: 0 }, regla).bono, 0);
  assert.equal(calcularPagoDia({ entregados: 30, omitidos: 0 }, regla).bono, 10000);
  assert.equal(calcularPagoDia({ entregados: 31, omitidos: 0 }, regla).bono, 10000);
});

test("meta sin monto de bono no paga nada (y no da NaN)", () => {
  const regla = R({ meta_entregas_dia: 5, bono_monto: null });
  const pago = calcularPagoDia({ entregados: 10, omitidos: 0 }, regla);
  assert.equal(pago.bono, 0);
  assert.ok(!Number.isNaN(pago.total));
});

test("día sin entregas: solo el fijo diario", () => {
  const regla = R({ valor_pago: 300, monto_dia: 15000, meta_entregas_dia: 1, bono_monto: 5000 });
  assert.deepEqual(calcularPagoDia({ entregados: 0, omitidos: 0 }, regla), {
    base: 0,
    dia: 15000,
    bono: 0,
    total: 15000,
  });
});

test("total siempre = base + dia + bono, con valores al azar", () => {
  for (let i = 0; i < 500; i++) {
    const regla = R({
      tipo_pago: Math.random() < 0.5 ? "porcentaje" : "monto_fijo",
      valor_pago: Math.random() < 0.5 ? Math.random() * 100 : String((Math.random() * 900).toFixed(2)),
      monto_dia: Math.floor(Math.random() * 40000),
      meta_entregas_dia: Math.random() < 0.5 ? Math.ceil(Math.random() * 60) : null,
      bono_monto: Math.floor(Math.random() * 20000),
    });
    const conteo = {
      entregados: Math.floor(Math.random() * 120),
      omitidos: Math.floor(Math.random() * 20),
    };
    const p = calcularPagoDia(conteo, regla);
    assert.equal(p.total, p.base + p.dia + p.bono);
    assert.ok(Number.isInteger(p.base), `base no entera: ${p.base}`);
    assert.ok(p.base >= 0 && p.dia >= 0 && p.bono >= 0, "la base de datos exige >= 0");
    assert.ok(!Number.isNaN(p.total));
  }
});

test("las omisiones nunca cambian el pago", () => {
  const regla = R({ tipo_pago: "monto_fijo", valor_pago: 300, monto_dia: 15000 });
  const a = calcularPagoDia({ entregados: 10, omitidos: 0 }, regla);
  const b = calcularPagoDia({ entregados: 10, omitidos: 50 }, regla);
  assert.deepEqual(a, b);
});

// --------------------------------------------------------- contarActividad
test("las llamadas no suman ni restan al conteo", () => {
  const eventos = [
    EV({ tipo: "entrega" }),
    EV({ tipo: "entrega" }),
    EV({ tipo: "omision" }),
    EV({ tipo: "llamada" }),
    EV({ tipo: "llamada" }),
  ];
  assert.deepEqual(contarActividad(eventos), { entregados: 2, omitidos: 1 });
});

// ----------------------------------------------------------- agruparPorDia
test("agrupa por (conductor, día) y cuenta cada tipo", () => {
  const dias = agruparPorDia([
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "entrega" }),
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "omision" }),
    EV({ chofer_id: "c1", fecha: "2026-08-01", tipo: "llamada" }),
    EV({ chofer_id: "c2", fecha: "2026-08-01", tipo: "entrega" }),
    EV({ chofer_id: "c1", fecha: "2026-08-02", tipo: "entrega" }),
  ]);
  assert.equal(dias.length, 3);
  const d = dias.find((x) => x.fecha === "2026-08-01" && x.choferId === "c1");
  assert.deepEqual(d.conteo, { entregados: 1, omitidos: 1 });
  assert.equal(d.eventos.length, 3);
});

test("ordena por fecha, más nuevo primero", () => {
  const dias = agruparPorDia([
    EV({ fecha: "2026-08-01" }),
    EV({ fecha: "2026-08-31" }),
    EV({ fecha: "2026-08-15" }),
  ]);
  assert.deepEqual(
    dias.map((d) => d.fecha),
    ["2026-08-31", "2026-08-15", "2026-08-01"],
  );
});

test("cuenta los eventos de carga manual aparte", () => {
  const [d] = agruparPorDia([
    EV({ origen: "app" }),
    EV({ origen: "manual" }),
    EV({ origen: "manual" }),
  ]);
  assert.equal(d.manuales, 2);
  assert.equal(d.eventos.length, 3);
  assert.ok(d.manuales < d.eventos.length, "día mixto: la pantalla debe decir 'Manual parcial'");
});

test("un conductor eliminado (chofer_id null) sigue teniendo su día", () => {
  const dias = agruparPorDia([EV({ chofer_id: null }), EV({ chofer_id: null, tipo: "omision" })]);
  assert.equal(dias.length, 1);
  assert.equal(dias[0].choferId, null);
  assert.deepEqual(dias[0].conteo, { entregados: 1, omitidos: 1 });
});

test("lista vacía: ningún día (no hay 'día trabajado' fantasma)", () => {
  assert.deepEqual(agruparPorDia([]), []);
});

test("agruparPorDia conserva TODOS los eventos y no pierde ni duplica conteos", () => {
  const eventos = [];
  const tipos = ["entrega", "omision", "llamada"];
  for (let i = 0; i < 3000; i++) {
    eventos.push(
      EV({
        chofer_id: `c${i % 4}`,
        fecha: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
        tipo: tipos[i % 3],
        origen: i % 5 === 0 ? "manual" : "app",
      }),
    );
  }
  const dias = agruparPorDia(eventos);
  assert.equal(
    dias.reduce((a, d) => a + d.eventos.length, 0),
    eventos.length,
    "se perdieron o duplicaron eventos al agrupar",
  );
  assert.equal(
    dias.reduce((a, d) => a + d.conteo.entregados, 0),
    eventos.filter((e) => e.tipo === "entrega").length,
  );
  assert.equal(
    dias.reduce((a, d) => a + d.manuales, 0),
    eventos.filter((e) => e.origen === "manual").length,
  );
  // Ninguna clave repetida
  const claves = dias.map((d) => `${d.fecha}|${d.choferId}`);
  assert.equal(new Set(claves).size, claves.length);
});

// ---------------------------- coherencia panel ↔ snapshot (la que paga)
test("lo que el panel proyecta al vuelo es idéntico a lo que se congela en encomienda_pagos", () => {
  const reglas = [R({ tipo_pago: "monto_fijo", valor_pago: 300, monto_dia: 15000, meta_entregas_dia: 25, bono_monto: 8000 })];
  for (let entregados = 0; entregados <= 60; entregados++) {
    const conteo = { entregados, omitidos: 2 };
    const regla = reglaVigente(reglas, "c1", "2026-08-10");
    const alVuelo = calcularPagoDia(conteo, regla);
    assert.ok(Number.isInteger(ingresoEstimado(entregados, valorPedido(regla))));
    // filaPago (actions.ts) guarda estos tres y la base genera pago_total.
    const pagoTotalGenerado = alVuelo.base + alVuelo.bono + alVuelo.dia;
    assert.equal(pagoTotalGenerado, alVuelo.total, `difiere en ${entregados} entregas`);
  }
});
