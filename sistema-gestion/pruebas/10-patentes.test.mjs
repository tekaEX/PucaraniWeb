// La patente ES la clave primaria del vehículo (migración 0008), así que
// guardarla en dos formas distintas parte el historial en dos: los gastos de
// "ABCD-12" no aparecerían junto a los de "ABCD12". Por eso todo lo que entra
// pasa por formatearPatente.
import test from "node:test";
import assert from "node:assert/strict";
import { formatearPatente, extraerPatente, normalizar, PATENTE_PATTERN } from "@/lib/patentes";

test("formato nuevo (4 letras + 2 números) queda canónico", () => {
  for (const entrada of ["ABCD12", "abcd12", "ABCD-12", "abcd 12", "ABCD.12", "  ABCD-12  "]) {
    assert.equal(formatearPatente(entrada.trim()), "ABCD-12", `falló con ${JSON.stringify(entrada)}`);
  }
});

test("formato antiguo (2 letras + 4 números) queda canónico", () => {
  for (const entrada of ["AB1234", "ab1234", "AB-1234", "ab 1234", "AB.1234"]) {
    assert.equal(formatearPatente(entrada), "AB-1234", `falló con ${JSON.stringify(entrada)}`);
  }
});

test("guardar la misma patente escrita de mil formas da SIEMPRE la misma clave", () => {
  // Es la garantía de la que depende que el historial no se parta.
  const formas = ["ghpr34", "GHPR34", "ghpr-34", "GHPR 34", "gHpR.34"];
  const claves = new Set(formas.map(formatearPatente));
  assert.equal(claves.size, 1, `dio ${[...claves].join(", ")}`);
  assert.equal([...claves][0], "GHPR-34");
});

test("lo que no es una patente chilena se rechaza, no se guarda a medias", () => {
  for (const mala of [
    "", "ABC123", "A1234", "ABCDE12", "ABCD123", "1234AB", "ABCD-1", "AB-12345",
    "ABCD-12-X", "12-3456", "ÑBCD12", "AB_1234",
  ]) {
    assert.equal(formatearPatente(mala), null, `aceptó ${JSON.stringify(mala)}`);
  }
});

test("normalizar solo saca separadores y sube a mayúsculas", () => {
  assert.equal(normalizar("ghpr-34"), "GHPR34");
  assert.equal(normalizar("a b.c-d"), "ABCD");
  assert.equal(normalizar(""), "");
});

test("extraerPatente encuentra la patente en el detalle de una factura", () => {
  assert.equal(extraerPatente("Flete Arica-Iquique camión GHPR-34"), "GHPR34");
  assert.equal(extraerPatente("Servicio con AB1234 ida y vuelta"), "AB1234");
  assert.equal(extraerPatente("PATENTE: ABCD.12"), "ABCD12");
});

test("extraerPatente devuelve null cuando no hay ninguna (queda para revisión)", () => {
  for (const texto of ["", "Flete Arica-Iquique", "Servicio de transporte marzo", "Total 1.234.567"]) {
    assert.equal(extraerPatente(texto), null, `inventó una patente en ${JSON.stringify(texto)}`);
  }
});

test("extraerPatente no confunde números largos con patentes", () => {
  // Una guía de despacho o un RUT no son una patente.
  assert.equal(extraerPatente("Guía 123456"), null);
  assert.equal(extraerPatente("RUT 76.123.456-7"), null);
  assert.equal(extraerPatente("ABCD1234"), null, "ocho caracteres no es ninguno de los dos formatos");
});

test("con varias patentes en el texto se toma la primera", () => {
  assert.equal(extraerPatente("De GHPR-34 a ABCD-12"), "GHPR34");
});

test("el pattern del <input> acepta exactamente lo mismo que el servidor", () => {
  // Si el navegador dejara pasar algo que el servidor rechaza, el usuario ve
  // "guardado" y no se guardó; al revés, no puede escribir algo válido.
  const re = new RegExp(`^(?:${PATENTE_PATTERN})$`);
  for (const buena of ["ABCD12", "ABCD-12", "AB1234", "AB-1234", "abcd-12"]) {
    assert.ok(re.test(buena), `el navegador rechaza ${buena}, que el servidor acepta`);
    assert.ok(formatearPatente(buena) != null);
  }
  for (const mala of ["ABC123", "ABCD123", "A1234", "ABCD-1"]) {
    assert.ok(!re.test(mala), `el navegador acepta ${mala}, que el servidor rechaza`);
    assert.equal(formatearPatente(mala), null);
  }
});
