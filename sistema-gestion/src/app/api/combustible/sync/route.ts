import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { decrypt } from "@/lib/crypto";
import { extraerPatente, normalizar } from "@/lib/patentes";

// Las llamadas al SII vía SimpleAPI pueden tardar: subimos el límite (techo del
// plan free de Vercel). Necesita runtime Node por `crypto` y `Buffer`.
export const runtime = "nodejs";
export const maxDuration = 60;

// Endpoint real del RCV (compras por día): POST .../compras/{dd}/{mm}/{yyyy}
const SIMPLEAPI_BASE = "https://servicios.simpleapi.cl/api/RCV/compras";

// RUTs de distribuidores de combustible (confirmar los reales del SII).
const RUTS_COMBUSTIBLE = new Set<string>([
  "99500000-0", // Copec (ejemplo)
  // "92580000-7", // Shell / Enex
  // "96856650-3", // Petrobras
]);

export async function POST(req: Request) {
  if (isDemo()) {
    return NextResponse.json(
      {
        error:
          "Modo demostración: conecta Supabase y configura las credenciales SII para sincronizar de verdad.",
      },
      { status: 400 },
    );
  }

  let body: { dia?: number; mes?: number; anio?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ahora = new Date();
  const dia = body.dia ?? ahora.getDate();
  const mes = body.mes ?? ahora.getMonth() + 1;
  const anio = body.anio ?? ahora.getFullYear();
  const dd = String(dia).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  const urlCompras = `${SIMPLEAPI_BASE}/${dd}/${mm}/${anio}`;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Empresa centralizada (única fila). A futuro: derivar de la membresía del usuario.
  const { data: empresa } = await supabase
    .from("empresa")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (!empresa)
    return NextResponse.json({ error: "No hay empresa configurada" }, { status: 400 });
  const empresaId = empresa.id;

  // Credenciales SII de la empresa
  const { data: cred } = await supabase
    .from("sii_credenciales")
    .select("rut, cert_path, cert_password_enc")
    .eq("empresa_id", empresaId)
    .single();
  if (!cred)
    return NextResponse.json(
      { error: "Faltan las credenciales SII (RUT + certificado)." },
      { status: 400 },
    );

  // Certificado desde el bucket privado + clave desencriptada (solo en memoria)
  const { data: certFile, error: certErr } = await supabase.storage
    .from("certificados")
    .download(cred.cert_path);
  if (certErr || !certFile)
    return NextResponse.json({ error: "No se pudo leer el certificado." }, { status: 400 });
  const certBase64 = Buffer.from(await certFile.arrayBuffer()).toString("base64");
  const password = decrypt(cred.cert_password_enc);

  const apiKey = process.env.SIMPLEAPI_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "Falta SIMPLEAPI_KEY en el entorno." }, { status: 500 });

  // ---- Llamada a SimpleAPI: POST compras por día ----
  // TODO: confirmar el BODY exacto del request — cómo se entrega el certificado
  // (¿multipart/form-data con el archivo .pfx + JSON de credenciales, o el .pfx
  // en base64 dentro de un JSON?). Lo de abajo es un placeholder.
  const resp = await fetch(urlCompras, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey, // confirmar si lleva prefijo (ej. "ApiKey ...")
    },
    body: JSON.stringify({
      RutEmpresa: cred.rut,
      Certificado: certBase64,
      Password: password,
    }),
  });
  if (!resp.ok)
    return NextResponse.json({ error: `SimpleAPI respondió ${resp.status}` }, { status: 502 });

  // Estructura real de la respuesta del RCV de SimpleAPI (campos PascalCase).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data: any = await resp.json();
  const documentos: any[] = Array.isArray(data)
    ? data
    : (data.documentos ?? data.compras ?? data.data ?? []);

  // Vehículos de la empresa (para mapear por patente, SI hubiera detalle)
  const { data: vehiculos } = await supabase
    .from("vehiculos")
    .select("id, patente")
    .eq("empresa_id", empresaId);
  const porPatente = new Map(
    (vehiculos ?? []).map((v) => [normalizar(v.patente), v.id]),
  );

  const filas = [];
  for (const d of documentos) {
    if (Number(d.TipoDTE) !== 33) continue;
    const rutProveedor = String(d.RutProveedor ?? "");
    if (RUTS_COMBUSTIBLE.size && !RUTS_COMBUSTIBLE.has(rutProveedor)) continue;

    // IMPORTANTE: el RCV de compras NO incluye el detalle/glosa de las líneas,
    // así que no hay texto desde donde extraer la patente (queda en null). Si
    // más adelante se obtiene el detalle del DTE por otra vía, extraerPatente()
    // ya está listo para usarse.
    const detalle: string | null =
      typeof d.Detalle === "string" ? d.Detalle : null;
    const patente = detalle ? extraerPatente(detalle) : null;

    filas.push({
      empresa_id: empresaId,
      vehiculo_id: patente ? (porPatente.get(patente) ?? null) : null,
      categoria: "combustible",
      origen: "sii",
      descripcion: detalle,
      patente_detectada: patente,
      proveedor_rut: rutProveedor,
      proveedor_razon_social: d.RazonSocial ?? null,
      dte_tipo: 33,
      folio: Number(d.Folio),
      fecha: String(d.FechaEmision ?? "").slice(0, 10),
      litros: null,
      monto_neto: Number(d.MontoNeto ?? 0),
      monto_iva: Number(d.MontoIvaRecuperable ?? 0),
      monto_total: Number(d.MontoTotal ?? 0),
      raw: d,
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (filas.length) {
    const { error } = await supabase
      .from("gastos_vehiculo")
      .upsert(filas, { onConflict: "empresa_id,proveedor_rut,dte_tipo,folio" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    procesadas: filas.length,
    sinAsignar: filas.filter((f) => !f.vehiculo_id).length,
  });
}
