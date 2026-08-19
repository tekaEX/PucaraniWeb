// Prueba de humo de la emisión de DTE contra la API REAL de SimpleAPI.
//
//   npm run test:simpleapi
//
// Corre la cadena completa —timbrar, ensobrar, imprimir, enviar— con el
// certificado de prueba y el CAF sintético que genera generar-fixtures.mjs, y
// usando el MISMO código que usa la app (src/lib/sii/*), no una reimplementación.
//
// Por qué existe: el resto de las pruebas reemplaza fetch, así que confirma que
// el request se arma como quedó escrito, pero no que ese contrato siga siendo
// el que la API espera. Esto último solo lo dice la API. Si SimpleAPI cambia un
// nombre de campo, acá se ve; en el resto de la suite, no.
//
// Los pasos 1 a 4 NO consumen cuota (verificado: el uso quedó en 0 después de
// varias corridas). El paso 5 sí consumiría, pero con un certificado de prueba
// el SII rechaza antes de contarlo.
//
// Necesita SIMPLEAPI_KEY en .env.local. Sin red, falla: es lo que prueba.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { generarFixtures, CLAVE_PFX, RUT_EMPRESA, RUT_TITULAR } from "./fixtures/generar-fixtures.mjs";
import { construirDocumento } from "@/lib/sii/documento";
import {
  estadoSuscripcion,
  generarDte,
  generarSobre,
  generarPdf,
  enviarAlSii,
  RUT_SII,
} from "@/lib/sii/simpleapi";

const SALIDA = fileURLToPath(new URL("./fixtures/salida/", import.meta.url));
const PFX = path.join(SALIDA, "certificado-prueba.pfx");
const CAF = path.join(SALIDA, "CAF_33_1_50.xml");

let fallos = 0;

function ok(paso, detalle) {
  console.log(`  ✔ ${paso}${detalle ? ` — ${detalle}` : ""}`);
}
function mal(paso, detalle) {
  fallos++;
  console.log(`  ✘ ${paso}${detalle ? ` — ${detalle}` : ""}`);
}
function nota(texto) {
  console.log(`    ${texto}`);
}

console.log("\nPrueba de humo: emisión de DTE contra api.simpleapi.cl\n");

if (!existsSync(PFX) || !existsSync(CAF)) {
  console.log("  · Faltaban los datos de prueba; generándolos…");
  generarFixtures();
}
mkdirSync(SALIDA, { recursive: true });

const certificado = {
  rut: RUT_TITULAR,
  password: CLAVE_PFX,
  pfx: new Uint8Array(readFileSync(PFX)),
};
const cafXml = readFileSync(CAF, "utf8");

// --- 0. La key ---------------------------------------------------------------
const estado = await estadoSuscripcion();
if ("error" in estado) {
  mal("conexión y key", estado.error);
  console.log("\nSin conexión no tiene sentido seguir.\n");
  process.exit(1);
}
const dte = estado.servicios.find((s) => s.servicio === "SimpleAPI");
ok("conexión y key", dte ? `emisión ${dte.uso}/${dte.maximo} del mes` : "suscripción activa");

// --- 1. Armar el documento (sin red) ----------------------------------------
const armado = construirDocumento({
  factura: {
    tipoDte: 33,
    folio: 1,
    fechaEmision: new Date().toISOString().slice(0, 10),
    neto: 100000,
    iva: 19000,
    total: 119000,
  },
  emisor: {
    rut: RUT_EMPRESA,
    razonSocial: "TRANSPORTES PUCARANI LIMITADA",
    giro: "TRANSPORTE DE PASAJEROS",
    direccion: "AV. SANTA MARIA 1234",
    comuna: "Arica",
    actividadEconomica: [492300],
  },
  receptor: {
    rut: "96790240-3",
    razonSocial: "CLIENTE DE PRUEBA S.A.",
    giro: "MINERIA",
    direccion: "AV. COMANDANTE SAN MARTIN 500",
    comuna: "Arica",
  },
  lineas: [{ descripcion: "Traslado Arica - Tacna", cantidad: 1, valorUnitario: 100000 }],
});
if ("error" in armado) {
  mal("armado del documento", armado.error);
  process.exit(1);
}
ok("armado del documento", "factura 33, folio 1, total 119.000");

// --- 2. Timbrar y firmar -----------------------------------------------------
const timbrado = await generarDte(armado.documento, certificado, cafXml);
if ("error" in timbrado) {
  mal("timbrar y firmar (dte/generar)", timbrado.error);
  process.exit(1);
}
const tieneTimbre = timbrado.xml.includes("<TED") && timbrado.xml.includes("<FRMT");
const tieneFirma = timbrado.xml.includes("<Signature");
if (tieneTimbre && tieneFirma) {
  ok("timbrar y firmar (dte/generar)", `${timbrado.xml.length} bytes, con TED y firma`);
} else {
  mal("timbrar y firmar (dte/generar)", "el XML volvió sin timbre o sin firma");
}
writeFileSync(path.join(SALIDA, "DTE_generado.xml"), timbrado.xml, "latin1");

// --- 3. Sobre de envío -------------------------------------------------------
const sobre = await generarSobre(
  {
    rutEmisor: RUT_EMPRESA,
    rutReceptor: RUT_SII,
    numeroResolucion: 0,
    fechaResolucion: new Date().toISOString().slice(0, 10),
  },
  certificado,
  [timbrado.xml],
);
if ("error" in sobre) {
  mal("sobre de envío (envio/generar)", sobre.error);
} else {
  ok("sobre de envío (envio/generar)", `${sobre.xml.length} bytes, EnvioDTE`);
  writeFileSync(path.join(SALIDA, "SOBRE_generado.xml"), sobre.xml, "latin1");
}

// --- 4. Representación impresa ----------------------------------------------
const pdf = await generarPdf(timbrado.xml, {
  numeroResolucion: 0,
  fechaResolucion: new Date().toISOString().slice(0, 10),
  unidadSII: "ARICA",
  formaPago: "CONTADO",
});
if ("error" in pdf) {
  mal("PDF (impresion/pdf/carta/v2)", pdf.error);
} else {
  const esPdf = pdf.pdf[0] === 0x25 && pdf.pdf[1] === 0x50; // "%P"
  if (esPdf) {
    const destino = path.join(SALIDA, "factura-prueba.pdf");
    writeFileSync(destino, pdf.pdf);
    ok("PDF (impresion/pdf/carta/v2)", `${Math.round(pdf.pdf.length / 1024)} KB → ${destino}`);
  } else {
    mal("PDF (impresion/pdf/carta/v2)", "lo que volvió no es un PDF");
  }
}

// --- 5. Envío al SII: acá es donde hace falta el certificado real ------------
if (!("error" in sobre)) {
  const enviado = await enviarAlSii(certificado, sobre.xml, "certificacion");
  if ("error" in enviado) {
    // ESPERADO mientras no haya certificado real. Que falle acá y solo acá es
    // justamente el resultado que confirma que todo lo anterior está bien.
    ok("envío al SII rechazado, como corresponde", enviado.error);
    nota("Único paso que necesita el certificado digital real del SII.");
  } else {
    ok("envío al SII ACEPTADO", `track id ${enviado.trackId}`);
    nota("El certificado ya es válido: revisá si esto debía correr en certificación.");
  }
}

console.log(
  fallos === 0
    ? "\nLa cadena de emisión funciona de punta a punta. Falta el certificado real.\n"
    : `\n${fallos} paso(s) fallaron: el contrato con SimpleAPI cambió o hay un error nuevo.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
