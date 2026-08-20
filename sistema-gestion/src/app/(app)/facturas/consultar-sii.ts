"use server";

// Preguntarle al SII qué pasó con un documento ya enviado.
//
// Es la vuelta del envío, y hasta ahora no existía: `emitirFactura()` guardaba
// el track id y nadie lo miraba nunca. El track id NO es un "aceptada" — es un
// número de seguimiento. El SII procesa el sobre después, y recién entonces
// decide entre aceptado, aceptado con reparos y rechazado. Sin esta consulta,
// un rechazo no aparece en ningún lado del sistema.
//
// A diferencia de emitir, esto es de SOLO LECTURA: no toma folios, no manda
// nada nuevo y se puede repetir todas las veces que haga falta. Lo único que
// escribe en la factura es lo que contestó el SII.

import { revalidatePath } from "next/cache";
import { esAdmin, SIN_PERMISO } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { decrypt } from "@/lib/crypto";
import { consultarEnvio, type Ambiente, type Certificado } from "@/lib/sii/simpleapi";
import { clasificarEstadoSii, type EstadoSii } from "@/lib/sii/estado";

export type ResultadoConsulta = {
  error?: string;
  /** El estado ya traducido, para pintar la pastilla sin recargar. */
  estado?: EstadoSii;
  /** El código crudo del SII, tal como lo devolvió. */
  codigo?: string;
  glosa?: string;
};

export async function consultarEstadoSii(facturaId: string): Promise<ResultadoConsulta> {
  // Consultar necesita el certificado, y `sii_credenciales` es admin por RLS:
  // sin esta guarda un operador recibiría "faltan las credenciales", que es
  // verdad pero no es el motivo.
  if (!(await esAdmin())) return { error: SIN_PERMISO };

  const supabase = await createClient();

  const { data: factura } = await supabase
    .from("facturas")
    .select("id, folio, sii_track_id, sii_ambiente")
    .eq("id", facturaId)
    .single();
  if (!factura) return { error: "No se encontró la factura." };

  const trackId = Number(factura.sii_track_id ?? 0);
  if (!trackId) {
    return {
      error:
        "Esta factura no tiene track id: nunca se envió al SII desde el sistema. Si se emitió a mano, no hay nada que consultar.",
    };
  }

  const empresa = await empresaActual();
  if (!empresa) return { error: "No hay empresa configurada." };

  // El ambiente sale de la FACTURA, no de las credenciales de hoy. Si la
  // empresa ya pasó a producción, una factura vieja de certificación se sigue
  // consultando contra certificación: es donde vive ese track id. Y la
  // credencial que se usa tiene que ser la de ESE ambiente — consultar con el
  // certificado de producción un envío de certificación no devuelve nada útil.
  const ambiente = (factura.sii_ambiente ?? "certificacion") as Ambiente;

  const { data: creds } = await supabase
    .from("sii_credenciales")
    .select("rut, rut_certificado, cert_path, cert_password_enc")
    .eq("empresa_id", empresa.id)
    .eq("ambiente", ambiente);

  const cred = creds?.[0] ?? null;
  if (!cred?.cert_path || !cred.rut_certificado) {
    return {
      error: `Faltan las credenciales de ${ambiente} para consultar este envío.`,
    };
  }

  const { data: certFile, error: errCert } = await supabase.storage
    .from("certificados")
    .download(cred.cert_path);
  if (errCert || !certFile) return { error: "No se pudo leer el certificado digital." };

  let password: string;
  try {
    password = decrypt(cred.cert_password_enc);
  } catch {
    return { error: "No se pudo descifrar la clave del certificado. ¿Cambió ENCRYPTION_KEY?" };
  }

  const certificado: Certificado = {
    rut: cred.rut_certificado,
    password,
    pfx: new Uint8Array(await certFile.arrayBuffer()),
  };

  const rutEmpresa = cred.rut ?? empresa.rut ?? "";

  const r = await consultarEnvio(certificado, rutEmpresa, trackId, ambiente);
  if ("error" in r) return { error: r.error };

  // Se guarda lo CRUDO —código y glosa— y la traducción se hace al leer. Si
  // mañana la tabla de códigos cambia, las facturas viejas se reinterpretan
  // solas en vez de haber quedado congeladas con una clasificación vieja.
  const codigo = r.estado.trim();
  const glosa = r.glosa.trim() || r.xml.trim().slice(0, 500);
  const estado = clasificarEstadoSii(codigo || null, glosa);

  const { error: errUpdate } = await supabase
    .from("facturas")
    .update({
      // Si el SII contestó sin código, no se pisa el que ya había: perder el
      // "enviado" dejaría la factura como si nunca hubiera salido.
      ...(codigo ? { estado_sii: codigo } : {}),
      sii_glosa: glosa || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", facturaId);
  if (errUpdate) {
    return {
      error: `El SII contestó "${codigo || glosa}" pero no se pudo guardar en la factura: ${errUpdate.message}`,
      estado,
      codigo,
      glosa,
    };
  }

  revalidatePath("/facturas");
  revalidatePath(`/facturas/${facturaId}`);
  return { estado, codigo, glosa };
}
