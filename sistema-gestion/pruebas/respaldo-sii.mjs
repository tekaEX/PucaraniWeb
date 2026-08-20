// Respaldo de la metadata del SII y verificación del entorno.
//
//   node --env-file=.env.local pruebas/respaldo-sii.mjs
//
// Dos cosas que conviene hacer juntas, y ninguna escribe nada:
//
//   1. RESPALDO (T002). Guarda en respaldos/ un JSON con la metadata de
//      `sii_credenciales`, `sii_caf`, `sii_folios_no_utilizados` y las facturas
//      con rastro del SII. **No incluye la clave cifrada del certificado**: un
//      respaldo con material de firma es una copia del problema, no una red de
//      seguridad. Lo que se respalda es lo que cuesta reconstruir — qué rangos
//      de folios se cargaron, en qué van, qué track ids se emitieron.
//
//   2. VERIFICACIÓN DEL ENTORNO (T003). Comprueba que estén SIMPLEAPI_KEY y
//      ENCRYPTION_KEY, que la key funcione, que ENCRYPTION_KEY sirva de verdad
//      —cifrando y descifrando, no solo mirando su largo— y que los buckets
//      `certificados` y `adjuntos` NO sean públicos.
//
// Necesita SUPABASE_SERVICE_ROLE_KEY, que se salta RLS: por eso es un script de
// consola y no una pantalla.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

let fallos = 0;
const ok = (t, d) => console.log(`  ✔ ${t}${d ? ` — ${d}` : ""}`);
const mal = (t, d) => {
  fallos++;
  console.log(`  ✘ ${t}${d ? ` — ${d}` : ""}`);
};

if (!url || !key) {
  console.log("\nFaltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n");
  process.exit(1);
}

async function tabla(nombre, columnas) {
  const r = await fetch(`${url}/rest/v1/${nombre}?select=${columnas}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return { error: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` };
  return { filas: await r.json() };
}

console.log("\nRespaldo de la metadata del SII\n");

// ---------------------------------------------------------------------------
// 1. Respaldo
// ---------------------------------------------------------------------------
const respaldo = { generado: new Date().toISOString(), tablas: {} };

const aRespaldar = [
  // Sin cert_password_enc a propósito: es la clave del certificado.
  [
    "sii_credenciales",
    "empresa_id,ambiente,rut,rut_certificado,numero_resolucion,fecha_resolucion,cert_path,estado_validacion,created_at,updated_at",
  ],
  [
    "sii_caf",
    "empresa_id,tipo_dte,ambiente,folio_desde,folio_hasta,folio_siguiente,fecha_autorizacion,xml_path,created_at",
  ],
  [
    "sii_folios_no_utilizados",
    "empresa_id,tipo_dte,ambiente,folio,factura_id,motivo,created_at,declarado_at",
  ],
  ["empresa", "id,nombre,rut,razon_social,comuna,giro,actividad_economica,sii_ambiente_activo"],
];

for (const [nombre, columnas] of aRespaldar) {
  const r = await tabla(nombre, columnas);
  if ("error" in r) {
    // Una tabla que todavía no existe no es un fallo del respaldo: es una
    // migración sin correr, y el respaldo tiene que poder hacerse igual.
    mal(nombre, r.error);
    continue;
  }
  respaldo.tablas[nombre] = r.filas;
  ok(nombre, `${r.filas.length} fila(s)`);
}

const facturas = await tabla(
  "facturas",
  "id,folio,tipo_dte,estado,estado_sii,sii_ambiente,sii_track_id,sii_enviado_at,sii_xml_path,sii_pdf_path,sii_glosa",
);
if ("error" in facturas) {
  mal("facturas", facturas.error);
} else {
  const conSii = facturas.filas.filter((f) => f.estado_sii || f.sii_track_id || f.folio);
  respaldo.tablas.facturas_con_sii = conSii;
  ok("facturas con folio o rastro del SII", `${conSii.length} de ${facturas.filas.length}`);
}

const SALIDA = fileURLToPath(new URL("../respaldos/", import.meta.url));
mkdirSync(SALIDA, { recursive: true });
const archivo = path.join(SALIDA, `sii-${respaldo.generado.slice(0, 19).replace(/[:T]/g, "")}.json`);
writeFileSync(archivo, JSON.stringify(respaldo, null, 2), "utf8");
ok("respaldo escrito", archivo);

// ---------------------------------------------------------------------------
// 2. Entorno
// ---------------------------------------------------------------------------
console.log("\nVerificación del entorno\n");

// ENCRYPTION_KEY: no basta con que exista ni con que mida 64 caracteres. Lo que
// importa es que cifre y descifre — una llave cambiada deja ilegibles las
// claves ya guardadas, y eso se descubre al emitir si no se comprueba acá.
try {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "hex");
  if (k.length !== 32) throw new Error(`mide ${k.length} bytes y tiene que medir 32`);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update("prueba", "utf8"), c.final()]);
  const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(c.getAuthTag());
  const claro = Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  if (claro !== "prueba") throw new Error("el texto descifrado no coincide");
  ok("ENCRYPTION_KEY cifra y descifra");
} catch (e) {
  mal("ENCRYPTION_KEY", e.message);
}

const apiKey = (process.env.SIMPLEAPI_KEY ?? "").trim();
if (!apiKey) {
  mal("SIMPLEAPI_KEY", "no está en el entorno");
} else {
  try {
    const r = await fetch("https://api.simpleapi.cl/api/v1/Suscripcion/status", {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      mal("SIMPLEAPI_KEY", `la API respondió ${r.status}`);
    } else {
      const servicios = await r.json();
      const dte = servicios.find?.((s) => s.servicio === "SimpleAPI");
      ok("SIMPLEAPI_KEY válida", dte ? `emisión ${dte.uso}/${dte.maximo} este mes` : "activa");
      // El tope es mensual y no se acumula: quedarse corto un 28 es dejar de
      // facturar, y conviene enterarse antes.
      if (dte && dte.maximo > 0 && dte.uso / dte.maximo >= 0.8) {
        mal("cuota de emisión", `va en ${dte.uso}/${dte.maximo}: queda poco`);
      }
    }
  } catch (e) {
    mal("SIMPLEAPI_KEY", `no se pudo consultar: ${e.message}`);
  }
}

// Buckets privados. `public: true` en cualquiera de los dos significa que un
// certificado o una factura se pueden descargar sabiendo la URL, sin sesión.
const rb = await fetch(`${url}/storage/v1/bucket`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!rb.ok) {
  mal("buckets", `HTTP ${rb.status}`);
} else {
  const buckets = await rb.json();
  for (const nombre of ["certificados", "adjuntos"]) {
    const b = buckets.find((x) => x.name === nombre);
    if (!b) mal(`bucket ${nombre}`, "no existe");
    else if (b.public) mal(`bucket ${nombre}`, "ES PÚBLICO y tiene que ser privado");
    else ok(`bucket ${nombre}`, "privado");
  }
}

console.log(
  fallos === 0
    ? "\nEntorno listo y metadata respaldada.\n"
    : `\n${fallos} problema(s). Revisá antes de cargar credenciales reales.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
