// IVA y totales. Esta regla estaba escrita cuatro veces —la Server Action que
// guarda, los dos formularios de cotización y el de facturas— y ninguna copia
// tenía prueba. Al unificarla en lib/totales.ts (T006) queda un solo lugar
// donde equivocarse, y este archivo es el que avisa si alguien se equivoca ahí.

import { test } from "node:test";
import assert from "node:assert/strict";

import { IVA, calcularTotales, desglosarTotal } from "@/lib/totales";

const items = (...valores) => valores.map((v) => ({ valor_unitario: v }));

test("la tasa de IVA es 19% y está en un solo lugar", () => {
  assert.equal(IVA, 0.19);
});

test("cotización afecta: subtotal, IVA y total", () => {
  const t = calcularTotales(items(100000, 50000), false);
  assert.deepEqual(t, { subtotal: 150000, iva: 28500, total: 178500 });
});

test("cotización exenta: no lleva IVA y el total es el subtotal", () => {
  const t = calcularTotales(items(100000, 50000), true);
  assert.deepEqual(t, { subtotal: 150000, iva: 0, total: 150000 });
});

test("sin líneas todo es cero (no NaN)", () => {
  assert.deepEqual(calcularTotales([], false), { subtotal: 0, iva: 0, total: 0 });
  assert.deepEqual(calcularTotales([], true), { subtotal: 0, iva: 0, total: 0 });
});

test("se redondea LÍNEA POR LÍNEA, no al final", () => {
  // Tres líneas de 0,5 que se redondean a 1 cada una dan 3, no 2 (que es lo
  // que daría sumar 1,5 y redondear al final). El subtotal tiene que ser
  // exactamente la suma de lo que el usuario ve escrito en cada fila: un peso
  // de diferencia contra la lista impresa no se puede explicar.
  assert.equal(calcularTotales(items(0.5, 0.5, 0.5), true).subtotal, 3);
});

test("el total siempre es subtotal + iva, sin arrastres", () => {
  for (const v of [1, 7, 99, 1234, 999999, 8_500_000]) {
    const t = calcularTotales(items(v), false);
    assert.equal(t.total, t.subtotal + t.iva, `falla con ${v}`);
  }
});

// ---------------------------------------------------------------------------
// El camino inverso: facturas
// ---------------------------------------------------------------------------

test("factura afecta (DTE 33): el total se descompone en neto + IVA", () => {
  const t = desglosarTotal(178500, true);
  assert.deepEqual(t, { subtotal: 150000, iva: 28500, total: 178500 });
});

test("factura exenta (DTE 34): el neto es el total y no hay IVA", () => {
  assert.deepEqual(desglosarTotal(150000, false), {
    subtotal: 150000,
    iva: 0,
    total: 150000,
  });
});

test("el IVA de una factura NO es total * 0,19", () => {
  // La trampa clásica: sobre un total que YA incluye IVA, multiplicar por 0,19
  // da de más. Sobre 119.000 daría 22.610 en vez de 19.000.
  const t = desglosarTotal(119000, true);
  assert.equal(t.subtotal, 100000);
  assert.equal(t.iva, 19000);
  assert.notEqual(t.iva, Math.round(119000 * 0.19));
});

test("neto + iva reconstruye el total exacto, para cualquier monto", () => {
  // El IVA sale como diferencia y no de un segundo redondeo, justamente para
  // que esto se cumpla siempre. Si alguien lo cambia por Math.round(neto*0.19),
  // esta prueba se cae con los montos que caen justo en el medio.
  for (let total = 1; total <= 2000; total++) {
    const t = desglosarTotal(total, true);
    assert.equal(t.subtotal + t.iva, total, `no cuadra con total ${total}`);
  }
});

test("ida y vuelta: descomponer el total de una cotización devuelve su subtotal", () => {
  // Una cotización aceptada se factura por su total. Lo que se guarde como
  // neto en la factura tiene que ser el subtotal de la cotización.
  for (const base of [10000, 33333, 150000, 987654]) {
    const cot = calcularTotales(items(base), false);
    const fac = desglosarTotal(cot.total, true);
    assert.equal(fac.subtotal, cot.subtotal, `no cierra con base ${base}`);
  }
});
