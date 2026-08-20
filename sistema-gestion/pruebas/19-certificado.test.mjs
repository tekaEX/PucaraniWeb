// Qué archivo se acepta como certificado digital.
//
// El caso que motiva estas pruebas: antes bastaba con que el archivo pesara más
// que cero para que quedara guardado como el certificado de la empresa. Un PDF
// renombrado a .pfx pasaba, y el problema aparecía recién al emitir —con el
// folio ya tomado— disfrazado de error de contraseña.
//
// Se usa el .pfx REAL que genera `npm run fixtures` cuando está disponible: es
// la única forma de comprobar que la validación no rechaza un certificado
// legítimo, que es el error más caro de los dos.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { errorCertificado, MAX_BYTES_CERTIFICADO } from "@/lib/sii/certificado";

const PFX_FIXTURE = fileURLToPath(
  new URL("./fixtures/salida/certificado-prueba.pfx", import.meta.url),
);

/** Un archivo cualquiera con la forma que espera la validación. */
function archivo(bytes, nombre = "certificado.pfx", tipo = "application/x-pkcs12") {
  return { nombre, tipo, bytes: bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes) };
}

test("acepta el .pfx real de los fixtures", { skip: !existsSync(PFX_FIXTURE) }, () => {
  // Si esto falla, la validación está rechazando certificados buenos, que es
  // peor que dejar pasar uno malo: bloquea a quien SÍ tiene sus credenciales.
  const bytes = new Uint8Array(readFileSync(PFX_FIXTURE));
  assert.equal(errorCertificado(archivo(bytes)), null);
});

test("acepta el .pfx aunque el navegador no informe tipo", { skip: !existsSync(PFX_FIXTURE) }, () => {
  // Pasa de verdad: según el sistema operativo el navegador manda
  // application/octet-stream o directamente vacío.
  const bytes = new Uint8Array(readFileSync(PFX_FIXTURE));
  assert.equal(errorCertificado(archivo(bytes, "firma.p12", "")), null);
  assert.equal(errorCertificado(archivo(bytes, "firma.pfx", "application/octet-stream")), null);
});

test("rechaza un archivo vacío", () => {
  const e = errorCertificado(archivo([]));
  assert.match(e, /vac[íi]o/i);
});

test("rechaza un archivo sobredimensionado antes de subirlo", () => {
  const grande = new Uint8Array(MAX_BYTES_CERTIFICADO + 1);
  grande[0] = 0x30;
  const e = errorCertificado(archivo(grande));
  assert.match(e, /m[áa]ximo/i);
});

test("rechaza una extensión que no es .pfx ni .p12", () => {
  const e = errorCertificado(archivo([0x30, 0x82], "certificado.pdf"));
  assert.match(e, /\.pfx/);
});

test("rechaza un archivo sin extensión", () => {
  const e = errorCertificado(archivo([0x30, 0x82], "certificado"));
  assert.match(e, /\.pfx/);
});

test("rechaza un MIME que no corresponde, sin confiar solo en él", () => {
  const e = errorCertificado(archivo([0x30, 0x82], "c.pfx", "image/png"));
  assert.match(e, /image\/png/);
});

test("un PDF renombrado a .pfx NO pasa", () => {
  // El caso concreto que antes quedaba guardado como credencial de la empresa.
  const pdf = new TextEncoder().encode("%PDF-1.7\n% cualquier cosa");
  const e = errorCertificado(archivo(pdf));
  assert.match(e, /PKCS#12/);
});

test("un PEM renombrado a .pfx recibe un mensaje que explica la diferencia", () => {
  // Es el error honesto más común: la gente tiene el .crt/.pem y cree que es
  // el certificado de firma. El mensaje tiene que decir qué archivo buscar.
  const pem = new TextEncoder().encode(
    "-----BEGIN CERTIFICATE-----\nMIIB...\n-----END CERTIFICATE-----\n",
  );
  const e = errorCertificado(archivo(pem));
  assert.match(e, /PEM/);
  assert.match(e, /llave privada/i);
});

test("un DER que no es PKCS#12 tampoco pasa", () => {
  // Arranca con SEQUENCE como cualquier DER, pero no trae el OID pkcs7-data:
  // la comprobación del primer byte sola no alcanzaría.
  const der = new Uint8Array(64);
  der[0] = 0x30;
  der[1] = 0x3e;
  const e = errorCertificado(archivo(der));
  assert.match(e, /renombrado|PKCS#12/);
});

test("el mensaje de error nunca incluye el contenido del archivo", () => {
  // Un certificado trae material criptográfico: si un mensaje de validación lo
  // devolviera, quedaría en el HTML y en cualquier log que capture la respuesta.
  const secreto = "CLAVE-PRIVADA-QUE-NO-DEBE-SALIR";
  const bytes = new TextEncoder().encode(secreto);
  const e = errorCertificado(archivo(bytes));
  assert.ok(e);
  assert.equal(e.includes(secreto), false);
});
