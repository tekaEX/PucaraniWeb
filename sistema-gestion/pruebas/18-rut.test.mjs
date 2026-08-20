// El RUT y su dígito verificador.
//
// Lo que fija este archivo no es "el algoritmo del módulo 11": es que un RUT
// mal tipeado NO llegue al SII. Antes de esta validación el sistema aceptaba
// cualquier cosa en el campo, y el error aparecía como rechazo del SII con el
// folio ya consumido — la forma más cara de enterarse de una letra de más.
import test from "node:test";
import assert from "node:assert/strict";

import {
  digitoVerificador,
  errorRut,
  formatearRut,
  mismoRut,
  normalizarRut,
  rutValido,
} from "@/lib/rut";

test("calcula el dígito verificador de RUT reales", () => {
  assert.equal(digitoVerificador("76192083"), "9");
  assert.equal(digitoVerificador("96790240"), "3");
  assert.equal(digitoVerificador("17096073"), "4");
  assert.equal(digitoVerificador("11111111"), "1");
});

test("los dos casos que la aritmética escribe distinto: 11 es 0 y 10 es K", () => {
  // El RUT del SII, que la app usa como receptor de todos los sobres, termina
  // justamente en K: si el cálculo devolviera "10" no habría envío posible.
  assert.equal(digitoVerificador("60803000"), "K");
  assert.equal(digitoVerificador("76123456"), "0");
});

test("acepta el RUT escrito como lo escribe la gente", () => {
  for (const r of ["76192083-9", "76.192.083-9", "76192083 - 9", "  76.192.083-9  "]) {
    assert.equal(rutValido(r), true, r);
  }
});

test("la K vale en minúscula", () => {
  assert.equal(rutValido("60803000-k"), true);
  assert.equal(rutValido("60803000-K"), true);
});

test("rechaza el dígito verificador equivocado", () => {
  // Este es EL caso: un RUT que parece correcto y no lo es.
  assert.equal(rutValido("76192083-0"), false);
  assert.equal(rutValido("96790240-1"), false);
});

test("rechaza lo que no tiene forma de RUT", () => {
  for (const r of ["", "   ", "sin rut", "1234", "123456789012-3", "76192083", "ABCDE-1"]) {
    assert.equal(rutValido(r), false, JSON.stringify(r));
  }
});

test("normalizar deja la forma canónica y solo si el RUT es válido", () => {
  assert.equal(normalizarRut("76.192.083-9"), "76192083-9");
  assert.equal(normalizarRut("60803000-k"), "60803000-K");
  // Un RUT mal escrito NO se guarda "normalizado": eso escondería el error
  // detrás de un formato prolijo.
  assert.equal(normalizarRut("76192083-0"), null);
  assert.equal(normalizarRut("cualquier cosa"), null);
});

test("formatear pone los puntos para mostrar", () => {
  assert.equal(formatearRut("76192083-9"), "76.192.083-9");
  assert.equal(formatearRut("9876543-1"), "9.876.543-1");
  // Lo que no se puede formatear se devuelve tal cual, no se pierde.
  assert.equal(formatearRut("sin rut"), "sin rut");
});

test("mismoRut compara sin validar: dos RUT mal escritos IGUALES son el mismo", () => {
  // Deliberado. Si comparar exigiera un DV correcto, un RUT inválido en los dos
  // lados se reportaría como "son distintos" y mandaría a buscar el problema
  // donde no está.
  assert.equal(mismoRut("76.192.083-9", "76192083-9"), true);
  assert.equal(mismoRut("60803000-K", "60803000-k"), true);
  assert.equal(mismoRut("76192083-0", "76192083-0"), true);
  assert.equal(mismoRut("76192083-9", "76192084-9"), false);
});

test("errorRut explica QUÉ está mal, no solo que está mal", () => {
  assert.equal(errorRut("76192083-9"), null);

  const vacio = errorRut("", "El RUT del cliente");
  assert.match(vacio, /El RUT del cliente es obligatorio/);

  // El mensaje del DV incorrecto dice cuál era el correcto: quien tipeó mal
  // puede arreglarlo sin ir a buscar el papel.
  const malDv = errorRut("76192083-0");
  assert.match(malDv, /d[íi]gito verificador/i);
  assert.match(malDv, /-9/);

  const sinForma = errorRut("sin rut");
  assert.match(sinForma, /no tiene forma de RUT/);
});

test("la etiqueta viaja al mensaje para saber QUÉ campo corregir", () => {
  const e = errorRut("123", "El RUT del titular del certificado");
  assert.match(e, /El RUT del titular del certificado/);
});
