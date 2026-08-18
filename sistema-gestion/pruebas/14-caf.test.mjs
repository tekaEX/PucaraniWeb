// El CAF define QUÉ FOLIOS se pueden emitir. Si se lee mal el rango, el
// sistema emite un folio que el SII no autorizó y el documento se rechaza —
// con el folio ya consumido. Por eso el rango nunca se tipea: se lee de acá.
import test from "node:test";
import assert from "node:assert/strict";
import { parsearCaf, mismoRut } from "@/lib/caf";

// CAF de ejemplo con la estructura real del SII. Las llaves están recortadas:
// este módulo no las mira, solo lee el bloque <DA>.
function cafDe({ re = "76192083-9", td = 33, d = 465, h = 564, fa = "2026-08-18" } = {}) {
  return `<?xml version="1.0"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${re}</RE>
      <RS>TRANSPORTES PUCARANI LTDA</RS>
      <TD>${td}</TD>
      <RNG><D>${d}</D><H>${h}</H></RNG>
      <FA>${fa}</FA>
      <RSAPK><M>xxxx</M><E>Aw==</E></RSAPK>
      <IDK>100</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">yyyy</FRMA>
  </CAF>
  <RSASK>-----BEGIN RSA PRIVATE KEY-----zzzz-----END RSA PRIVATE KEY-----</RSASK>
  <RSAPUBK>-----BEGIN PUBLIC KEY-----wwww-----END PUBLIC KEY-----</RSAPUBK>
</AUTORIZACION>`;
}

test("lee el rango, el tipo de documento y el RUT de un CAF real", () => {
  const r = parsearCaf(cafDe());
  assert.ok(!("error" in r), r.error);
  assert.deepEqual(r.datos, {
    rutEmisor: "76192083-9",
    razonSocial: "TRANSPORTES PUCARANI LTDA",
    tipoDte: 33,
    folioDesde: 465,
    folioHasta: 564,
    fechaAutorizacion: "2026-08-18",
  });
});

test("el rango sale de <RNG>, no de cualquier <D> suelto del archivo", () => {
  // <IDK> y <RSAPK> traen otras etiquetas cortas; el desde/hasta tiene que
  // salir igual del bloque correcto.
  const r = parsearCaf(cafDe({ d: 1, h: 50 }));
  assert.ok(!("error" in r));
  assert.equal(r.datos.folioDesde, 1);
  assert.equal(r.datos.folioHasta, 50);
});

test("un rango de un solo folio es válido", () => {
  const r = parsearCaf(cafDe({ d: 7, h: 7 }));
  assert.ok(!("error" in r));
  assert.equal(r.datos.folioDesde, 7);
  assert.equal(r.datos.folioHasta, 7);
});

test("rechaza un archivo que no es un CAF", () => {
  const r = parsearCaf("<html><body>no soy un caf</body></html>");
  assert.ok("error" in r);
  assert.match(r.error, /no es un CAF/i);
});

test("rechaza un rango invertido en vez de cargarlo al revés", () => {
  const r = parsearCaf(cafDe({ d: 900, h: 100 }));
  assert.ok("error" in r);
  assert.match(r.error, /invertido/i);
});

test("rechaza un tipo de documento que el sistema no emite", () => {
  // 39 es boleta electrónica: el sistema no la maneja y avisarlo acá es mejor
  // que descubrirlo cuando el SII rechace el envío.
  const r = parsearCaf(cafDe({ td: 39 }));
  assert.ok("error" in r);
  assert.match(r.error, /39/);
});

test("avisa cuando falta el bloque de datos", () => {
  const r = parsearCaf("<AUTORIZACION><CAF version=\"1.0\"></CAF></AUTORIZACION>");
  assert.ok("error" in r);
  assert.match(r.error, /<DA>/);
});

test("avisa cuando la fecha de autorización no tiene el formato esperado", () => {
  const r = parsearCaf(cafDe({ fa: "18-08-2026" }));
  assert.ok("error" in r);
  assert.match(r.error, /fecha/i);
});

test("mismoRut ignora puntos, guion y mayúsculas: el CAF y el formulario los escriben distinto", () => {
  assert.equal(mismoRut("76192083-9", "76.192.083-9"), true);
  assert.equal(mismoRut("76192083-K", "76192083-k"), true);
  assert.equal(mismoRut("76192083-9", "76192084-9"), false);
});
