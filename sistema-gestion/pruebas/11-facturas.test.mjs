// Facturas: las reglas del DOCUMENTO tributario.
//
// El estado de cuenta (por cobrar / vencido / pagado / pendiente de facturar)
// ya está cubierto en 2-cobranza.test.mjs, y los estados derivados también. Lo
// que se prueba acá es lo otro: qué hace falta para que una factura se pueda
// emitir, y que el desglose que se GUARDA lo calcule el servidor.
//
// Las mismas reglas están como CHECK en la tabla (migración 0006). No es
// duplicación: la base garantiza que el dato no se corrompa, esto garantiza que
// el usuario reciba un mensaje en castellano en vez de un error de Postgres.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estadoFactura,
  tipoDte,
  montosFactura,
  validarFactura,
  parsearViajeIds,
  mensajeErrorFactura,
  DTE_AFECTO,
} from "@/lib/facturas";
import { facturaEstadoDerivado, facturaPagada } from "@/types/db";

const base = {
  cliente_id: "cli-1",
  estado: "borrador",
  folio: null,
  fecha_emision: null,
  fecha_pago: null,
};

// ---------------------------------------------------------------------------
// Qué hace falta para emitir (T034)
// ---------------------------------------------------------------------------

test("un borrador se guarda sin folio ni fecha", () => {
  assert.equal(validarFactura(base), null);
});

test("sin cliente no hay factura", () => {
  assert.match(validarFactura({ ...base, cliente_id: null }), /cliente/i);
  assert.match(validarFactura({ ...base, cliente_id: "" }), /cliente/i);
});

test("una factura EMITIDA necesita folio y fecha de emisión", () => {
  // Es un documento que existe ante el SII: sin folio no se puede referenciar,
  // ni cobrar, ni anular.
  const sinNada = { ...base, estado: "emitida" };
  assert.match(validarFactura(sinNada), /folio/i);
  assert.match(validarFactura({ ...sinNada, folio: 501 }), /folio|fecha/i);
  assert.match(validarFactura({ ...sinNada, fecha_emision: "2026-05-10" }), /folio|fecha/i);
  assert.equal(
    validarFactura({ ...sinNada, folio: 501, fecha_emision: "2026-05-10" }),
    null,
  );
});

test("un BORRADOR no puede estar pagado", () => {
  // Todavía no se le mandó a nadie: no hay nada que cobrar.
  assert.match(validarFactura({ ...base, fecha_pago: "2026-05-20" }), /borrador/i);
});

test("una emitida sí puede tener fecha de pago", () => {
  assert.equal(
    validarFactura({
      cliente_id: "cli-1",
      estado: "emitida",
      folio: 501,
      fecha_emision: "2026-05-10",
      fecha_pago: "2026-05-20",
    }),
    null,
  );
});

// ---------------------------------------------------------------------------
// El desglose que se GUARDA lo calcula el servidor
// ---------------------------------------------------------------------------

test("una factura afecta (33) se desglosa en neto + IVA", () => {
  const m = montosFactura(119000, DTE_AFECTO);
  assert.deepEqual(m, { subtotal: 100000, iva: 19000, total: 119000 });
});

test("una factura exenta (34) no lleva IVA", () => {
  // La base lo exige: check (tipo_dte <> 34 or iva = 0).
  const m = montosFactura(119000, 34);
  assert.equal(m.iva, 0);
  assert.equal(m.subtotal, 119000);
});

test("las notas (56 y 61) se tratan como exentas", () => {
  assert.equal(montosFactura(50000, 56).iva, 0);
  assert.equal(montosFactura(50000, 61).iva, 0);
});

test("neto + iva SIEMPRE da el total, que es el check de la tabla", () => {
  // check (total = neto + iva). Si el desglose se tomara del formulario, un
  // campo oculto desactualizado haría fallar el guardado con un error de
  // Postgres en vez de guardar bien.
  for (const total of [1, 999, 119000, 1234567]) {
    for (const dte of [33, 34, 56, 61]) {
      const m = montosFactura(total, dte);
      assert.equal(m.subtotal + m.iva, m.total, `no cuadra: total ${total}, DTE ${dte}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

test("un tipo de documento inventado cae en 34 (exenta), que no compromete IVA", () => {
  assert.equal(tipoDte(33), 33);
  assert.equal(tipoDte(34), 34);
  assert.equal(tipoDte(99), 34);
  assert.equal(tipoDte(null), 34);
  assert.equal(tipoDte(undefined), 34);
});

test("un estado inventado cae en borrador", () => {
  assert.equal(estadoFactura("emitida"), "emitida");
  assert.equal(estadoFactura("anulada"), "anulada");
  assert.equal(estadoFactura("pagada"), "borrador", "'pagada' es derivado, no una columna");
  assert.equal(estadoFactura(null), "borrador");
});

test("los ids de viajes se leen sin romper ante basura", () => {
  assert.deepEqual(parsearViajeIds('["a","b"]'), ["a", "b"]);
  assert.deepEqual(parsearViajeIds('["a","",null,3]'), ["a"]);
  assert.deepEqual(parsearViajeIds("{roto"), []);
  assert.deepEqual(parsearViajeIds(null), []);
});

test("el error de folio repetido se traduce a castellano", () => {
  const crudo = 'duplicate key value violates unique constraint "facturas_folio_unico"';
  assert.match(mensajeErrorFactura(crudo), /Ya existe una factura/);
  // Uno que no conoce pasa tal cual: es mejor mostrar algo que tragárselo.
  assert.equal(mensajeErrorFactura("otra cosa"), "otra cosa");
});

// ---------------------------------------------------------------------------
// El ciclo completo: emitir → cobrar (T030) contra los estados derivados (T031)
// ---------------------------------------------------------------------------

test("el ciclo de una factura, de borrador a pagada", () => {
  const f = { estado: "borrador", fecha_pago: null };
  assert.equal(facturaEstadoDerivado(f), "borrador");
  assert.equal(facturaPagada(f), false);

  // Se emite: ya es un documento y hay que cobrarlo.
  f.estado = "emitida";
  assert.equal(facturaEstadoDerivado(f), "por_cobrar");

  // Entra la plata.
  f.fecha_pago = "2026-05-20";
  assert.equal(facturaPagada(f), true);
  assert.equal(facturaEstadoDerivado(f), "pagada");

  // Anularla gana sobre todo lo anterior: aunque tenga fecha de pago, ese
  // documento ya no existe y no puede seguir contando como plata que entró.
  f.estado = "anulada";
  assert.equal(facturaEstadoDerivado(f), "anulada");
});
