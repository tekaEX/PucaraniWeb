// Genera los datos de prueba para trabajar la emisión de DTE SIN tener todavía
// el certificado digital real ni folios del SII.
//
//   node pruebas/fixtures/generar-fixtures.mjs
//
// Produce dos archivos en pruebas/fixtures/salida/ (ignorada por git):
//
//   certificado-prueba.pfx   firma electrónica autofirmada, clave "prueba123"
//   CAF_33_1_50.xml          autorización de folios 1 al 50 para facturas (33)
//
// Qué se puede hacer con esto y qué no. Verificado contra la API real el
// 2026-08-18:
//
//   SÍ  → generar el DTE timbrado y firmado, armar el sobre de envío y sacar el
//         PDF. La cadena entera de esta app funciona y no consume cuota.
//   NO  → que el SII lo acepte. La firma del CAF (<FRMA>) la pone el SII con su
//         propia llave, y el certificado no está emitido por una autoridad que
//         el SII reconozca. El envío responde "Certificado vencido".
//
// O sea: sirve para tener todo escrito, probado y funcionando antes de gastar
// un peso, y para que el día que llegue el certificado real lo único sin
// estrenar sea el paso de envío.
//
// El .pfx necesita OpenSSL (viene con Git para Windows). El CAF se arma acá
// mismo con node:crypto.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import path from "node:path";

const SALIDA = fileURLToPath(new URL("./salida/", import.meta.url));
export const CLAVE_PFX = "prueba123";
export const RUT_EMPRESA = "76192083-9";
export const RUT_TITULAR = "11111111-1";

function openssl(args) {
  try {
    return execFileSync("openssl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (e.code === "ENOENT") {
      throw new Error(
        "No se encontró OpenSSL. En Windows viene con Git; abrí Git Bash o agregá " +
          "C:\\Program Files\\Git\\usr\\bin al PATH.",
      );
    }
    throw new Error(`OpenSSL falló: ${e.stderr || e.message}`);
  }
}

/**
 * Un .pfx autofirmado en el formato viejo (3DES/SHA1).
 *
 * El formato por defecto de OpenSSL 3 (AES-256 + PBKDF2) no lo lee todo el
 * mundo: SimpleAPI corre sobre .NET y con un .pfx moderno puede fallar al
 * abrirlo, lo que se ve como un error de clave incorrecta y manda a buscar el
 * problema donde no está.
 */
function generarPfx() {
  const key = path.join(SALIDA, "key.pem");
  const cert = path.join(SALIDA, "cert.pem");
  const pfx = path.join(SALIDA, "certificado-prueba.pfx");

  openssl([
    "req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert,
    "-days", "365", "-nodes",
    "-subj", "/C=CL/O=PRUEBA LOCAL NO VALIDA/CN=CERTIFICADO DE PRUEBA",
  ]);
  openssl([
    "pkcs12", "-export", "-out", pfx, "-inkey", key, "-in", cert,
    "-passout", `pass:${CLAVE_PFX}`,
    "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1",
  ]);

  // Los PEM intermedios no hacen falta y son llave privada dando vueltas.
  rmSync(key, { force: true });
  rmSync(cert, { force: true });
  return pfx;
}

/**
 * Un CAF con la estructura real del SII y un par RSA de verdad adentro.
 *
 * La llave importa: SimpleAPI usa la RSASK del CAF para firmar el timbre (TED)
 * del documento. Con un relleno cualquiera el timbrado falla; con una llave
 * real el DTE sale timbrado igual que uno de verdad. Lo único que no se puede
 * falsificar es la <FRMA>, que es la firma del SII sobre el bloque <DA> y que
 * solo el SII puede producir.
 *
 * 512 bits y exponente 3 no son un descuido: son los que usa el SII.
 */
function generarCaf({ tipoDte = 33, desde = 1, hasta = 50 } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 512,
    publicExponent: 3,
  });
  const jwk = publicKey.export({ format: "jwk" });
  const modulo = Buffer.from(jwk.n, "base64url").toString("base64");
  const exponente = Buffer.from(jwk.e, "base64url").toString("base64");
  const sk = privateKey.export({ type: "pkcs1", format: "pem" }).trim();
  const pk = publicKey.export({ type: "spki", format: "pem" }).trim();

  const hoy = new Date().toISOString().slice(0, 10);
  const da =
    `<DA><RE>${RUT_EMPRESA}</RE><RS>TRANSPORTES PUCARANI LIMITADA</RS>` +
    `<TD>${tipoDte}</TD><RNG><D>${desde}</D><H>${hasta}</H></RNG><FA>${hoy}</FA>` +
    `<RSAPK><M>${modulo}</M><E>${exponente}</E></RSAPK><IDK>100</IDK></DA>`;

  // Relleno del largo correcto: la firma real la pone el SII.
  const frma = Buffer.alloc(128, 0x41).toString("base64");

  const xml =
    `<?xml version="1.0"?>\n<AUTORIZACION>\n<CAF version="1.0">\n${da}\n` +
    `<FRMA algoritmo="SHA1withRSA">${frma}</FRMA>\n</CAF>\n` +
    `<RSASK>${sk}\n</RSASK>\n<RSAPUBK>${pk}\n</RSAPUBK>\n</AUTORIZACION>`;

  const destino = path.join(SALIDA, `CAF_${tipoDte}_${desde}_${hasta}.xml`);
  writeFileSync(destino, xml, "utf8");
  return destino;
}

export function generarFixtures() {
  mkdirSync(SALIDA, { recursive: true });
  const pfx = generarPfx();
  const caf = generarCaf();
  return { pfx, caf, clave: CLAVE_PFX, rutTitular: RUT_TITULAR, rutEmpresa: RUT_EMPRESA };
}

// Ejecutado directamente (no importado): generar y contar qué quedó.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const r = generarFixtures();
  console.log("Datos de prueba generados:\n");
  console.log("  certificado :", r.pfx);
  console.log("  clave       :", r.clave);
  console.log("  RUT titular :", r.rutTitular);
  console.log("  CAF         :", r.caf, "(facturas tipo 33, folios 1 al 50)");
  console.log("  RUT empresa :", r.rutEmpresa);
  console.log("\nNo sirven para emitir de verdad: el SII no los reconoce.");
  console.log("Sirven para correr la cadena completa: npm run test:simpleapi");
}
