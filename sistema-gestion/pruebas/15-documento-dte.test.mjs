// El documento que se le manda al SII no se puede "probar en producción": una
// factura mal armada se rechaza con el folio ya consumido, y arreglarla es una
// nota de crédito, no un redeploy. Por eso la aritmética y las validaciones
// viven en una función pura y se prueban acá, sin certificado y sin red.
import test from "node:test";
import assert from "node:assert/strict";
import { construirDocumento, MAX_LINEAS } from "@/lib/sii/documento";

const EMISOR = {
  rut: "76192083-9",
  razonSocial: "TRANSPORTES PUCARANI LIMITADA",
  giro: "TRANSPORTE DE PASAJEROS",
  direccion: "AV. SANTA MARIA 1234",
  comuna: "Arica",
  actividadEconomica: [492300],
};

const RECEPTOR = {
  rut: "96790240-3",
  razonSocial: "MINERA EJEMPLO S.A.",
  giro: "MINERIA",
  direccion: "AV. COMANDANTE SAN MARTIN 500",
  comuna: "Arica",
};

function armar({ tipoDte = 33, lineas, neto, iva, total, ...resto } = {}) {
  const ls = lineas ?? [{ descripcion: "Traslado Arica-Tacna", cantidad: 1, valorUnitario: 100000 }];
  const base = ls.reduce((a, l) => a + Math.round(l.cantidad * l.valorUnitario), 0);
  const ivaCalc = tipoDte === 34 ? 0 : Math.round((base * 19) / 100);
  return construirDocumento({
    factura: {
      tipoDte,
      folio: 465,
      fechaEmision: "2026-08-18",
      neto: neto ?? base,
      iva: iva ?? ivaCalc,
      total: total ?? base + ivaCalc,
      ...resto,
    },
    emisor: EMISOR,
    receptor: RECEPTOR,
    lineas: ls,
  });
}

/** Como armar(), pero permite sustituir emisor o receptor completos. */
function armarCon({ emisor = EMISOR, receptor = RECEPTOR } = {}) {
  const lineas = [{ descripcion: "Traslado Arica-Tacna", cantidad: 1, valorUnitario: 100000 }];
  return construirDocumento({
    factura: {
      tipoDte: 33,
      folio: 465,
      fechaEmision: "2026-08-18",
      neto: 100000,
      iva: 19000,
      total: 119000,
    },
    emisor,
    receptor,
    lineas,
  });
}

test("una factura afecta lleva neto, tasa, IVA y total", () => {
  const r = armar({ tipoDte: 33 });
  assert.ok(!("error" in r), r.error);
  const enc = r.documento.Encabezado;
  assert.deepEqual(enc.Totales, {
    MontoNeto: 100000,
    TasaIVA: 19,
    IVA: 19000,
    MontoTotal: 119000,
  });
  assert.equal(enc.IdentificacionDTE.TipoDTE, 33);
  assert.equal(enc.IdentificacionDTE.Folio, 465);
  assert.equal(r.documento.Detalles[0].IndicadorExento, 0);
});

test("una factura exenta lleva MontoExento y NO lleva IVA ni neto", () => {
  // Mandar neto e IVA en cero, pero presentes, es causa típica de rechazo:
  // el SII espera que una exenta simplemente no traiga esos campos.
  const r = armar({ tipoDte: 34 });
  assert.ok(!("error" in r), r.error);
  const totales = r.documento.Encabezado.Totales;
  assert.deepEqual(totales, { MontoExento: 100000, MontoTotal: 100000 });
  assert.ok(!("MontoNeto" in totales));
  assert.ok(!("IVA" in totales));
  assert.ok(!("TasaIVA" in totales));
  assert.equal(r.documento.Detalles[0].IndicadorExento, 1);
});

test("el neto es la suma de los ítems YA redondeados, no el redondeo de la suma", () => {
  // Tres líneas de 3.333,33 dan 9.999,99. Redondeando al final: 10.000.
  // Redondeando cada ítem (que es lo que se imprime): 3.333 × 3 = 9.999.
  // Si el documento dijera 10.000 y las líneas sumaran 9.999, el SII repara.
  const lineas = [
    { descripcion: "Tramo 1", cantidad: 1, valorUnitario: 3333.33 },
    { descripcion: "Tramo 2", cantidad: 1, valorUnitario: 3333.33 },
    { descripcion: "Tramo 3", cantidad: 1, valorUnitario: 3333.33 },
  ];
  const r = armar({ lineas, neto: 9999, iva: 1900, total: 11899 });
  assert.ok(!("error" in r), r.error);
  const suma = r.documento.Detalles.reduce((a, d) => a + d.MontoItem, 0);
  assert.equal(r.documento.Encabezado.Totales.MontoNeto, suma);
  assert.equal(suma, 9999);
});

test("rechaza emitir si los montos de la factura no cuadran con los viajes", () => {
  // Alguien editó el valor de un viaje después de crear la factura. Emitir
  // dejaría un DTE que no coincide con la contabilidad.
  const r = armar({ neto: 90000, iva: 17100, total: 107100 });
  assert.ok("error" in r);
  assert.match(r.error, /no cuadran/i);
  assert.match(r.error, /100000/);
});

test("exige los datos del receptor que el SII no perdona", () => {
  for (const campo of ["rut", "razonSocial", "giro", "direccion", "comuna"]) {
    const r = construirDocumento({
      factura: { tipoDte: 33, folio: 1, fechaEmision: "2026-08-18", neto: 1000, iva: 190, total: 1190 },
      emisor: EMISOR,
      receptor: { ...RECEPTOR, [campo]: "" },
      lineas: [{ descripcion: "Servicio", cantidad: 1, valorUnitario: 1000 }],
    });
    assert.ok("error" in r, `faltando ${campo} debería fallar`);
  }
});

test("una factura sin viajes no se puede emitir", () => {
  const r = armar({ lineas: [], neto: 0, iva: 0, total: 0 });
  assert.ok("error" in r);
  assert.match(r.error, /al menos una línea/i);
});

test("corta en el tope de líneas del SII", () => {
  const lineas = Array.from({ length: MAX_LINEAS + 1 }, (_, i) => ({
    descripcion: `Viaje ${i + 1}`,
    cantidad: 1,
    valorUnitario: 1000,
  }));
  const r = armar({ lineas });
  assert.ok("error" in r);
  assert.match(r.error, new RegExp(String(MAX_LINEAS)));
});

test("sin folio no se arma nada: el folio lo entrega el CAF", () => {
  const r = construirDocumento({
    factura: { tipoDte: 33, folio: 0, fechaEmision: "2026-08-18", neto: 1000, iva: 190, total: 1190 },
    emisor: EMISOR,
    receptor: RECEPTOR,
    lineas: [{ descripcion: "Servicio", cantidad: 1, valorUnitario: 1000 }],
  });
  assert.ok("error" in r);
  assert.match(r.error, /folio/i);
});

test("el nombre del ítem se corta en 80 caracteres", () => {
  const largo = "Traslado de personal ".repeat(10);
  const r = armar({ lineas: [{ descripcion: largo, cantidad: 1, valorUnitario: 100000 }] });
  assert.ok(!("error" in r), r.error);
  assert.equal(r.documento.Detalles[0].Nombre.length, 80);
});

// --- RUT con dígito verificador (casos DOC-17 y DOC-18 del plan de pruebas) --
//
// Antes de esta validación los dos casos de abajo PASABAN: el documento se
// armaba, se tomaba el folio, se timbraba y el SII lo rechazaba. El rechazo
// llegaba con el folio ya consumido, que hay que declarar como no utilizado.

test("rechaza el RUT del emisor con dígito verificador equivocado", () => {
  const r = armarCon({ emisor: { ...EMISOR, rut: "76192083-0" } });
  assert.ok("error" in r);
  assert.match(r.error, /empresa emisora/i);
  assert.match(r.error, /-9/); // dice cuál era el correcto
});

test("rechaza el RUT del cliente con dígito verificador equivocado", () => {
  const r = armarCon({ receptor: { ...RECEPTOR, rut: "96790240-1" } });
  assert.ok("error" in r);
  assert.match(r.error, /MINERA EJEMPLO/); // nombra al cliente a corregir
  assert.match(r.error, /d[íi]gito verificador/i);
});

test("rechaza un RUT de cliente que no tiene ni forma de RUT", () => {
  const r = armarCon({ receptor: { ...RECEPTOR, rut: "sin rut" } });
  assert.ok("error" in r);
  assert.match(r.error, /no tiene forma de RUT/);
});

test("el RUT con puntos se acepta: es como lo escribe la gente", () => {
  const r = armarCon({ receptor: { ...RECEPTOR, rut: "96.790.240-3" } });
  assert.ok(!("error" in r), r.error);
});
