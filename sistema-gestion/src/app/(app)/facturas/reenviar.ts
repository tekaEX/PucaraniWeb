"use server";

// Reintentar el ENVÍO de un documento que ya está timbrado.
//
// Es la salida de un callejón que hasta ahora no tenía ninguna. Cuando
// `emitirFactura()` llega hasta el final y el envío al SII falla —se cayó la
// red, SimpleAPI devolvió 500, se agotó la cuota—, la factura queda así:
//
//   · folio consumido y guardado
//   · el DTE ya timbrado y firmado, en el bucket `adjuntos`
//   · estado_sii = 'error', estado = 'borrador'
//
// El mensaje decía «se puede reintentar solo el envío», pero no existía el
// código que lo hiciera, y volver a apretar "Emitir" rebotaba con «esta factura
// ya tiene el folio N asignado». O sea: folio quemado, documento válido en
// Storage, y ninguna forma de mandarlo desde la aplicación.
//
// LA REGLA DE ESTA ACCIÓN, y es la única que importa: **nunca llama a
// tomar_folio()**. Reintentar tiene que costar cero folios. El documento que se
// manda es exactamente el mismo XML que ya se timbró, no uno nuevo — timbrar de
// nuevo con otro folio dejaría dos documentos con el mismo contenido y solo uno
// declarado.

import { revalidatePath } from "next/cache";
import { esAdmin, SIN_PERMISO } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { enviarAlSii, generarSobre, RUT_SII } from "@/lib/sii/simpleapi";
import type { Ambiente } from "@/lib/sii/estado";
import { cargarCredencial } from "./credenciales";

export type ResultadoReenvio = {
  error?: string;
  ok?: boolean;
  folio?: number;
  trackId?: number;
};

export async function reenviarFactura(facturaId: string): Promise<ResultadoReenvio> {
  if (!(await esAdmin())) return { error: SIN_PERMISO };

  const supabase = await createClient();

  const { data: factura } = await supabase
    .from("facturas")
    .select("id, folio, tipo_dte, estado, estado_sii, sii_ambiente, sii_xml_path")
    .eq("id", facturaId)
    .single();
  if (!factura) return { error: "No se encontró la factura." };

  // Las cuatro condiciones que definen "quedó a medio camino". Cualquier otra
  // combinación no se reintenta: una factura ya emitida se consulta, y una sin
  // folio se emite.
  if (!factura.folio) {
    return { error: "Esta factura no tiene folio: todavía no se intentó emitirla." };
  }
  if (!factura.sii_xml_path) {
    return {
      error:
        "No hay un documento timbrado guardado para reenviar. Esta factura se cargó a mano o falló antes de timbrarse.",
    };
  }
  if (factura.estado !== "borrador") {
    return {
      error: `Esta factura está en estado "${factura.estado}": el reenvío es solo para las que quedaron a medio emitir.`,
    };
  }

  const empresa = await empresaActual();
  if (!empresa) return { error: "No hay empresa configurada." };

  // El ambiente sale de la FACTURA: el documento se timbró contra ese y su
  // folio pertenece a ese CAF. Mandarlo al otro ambiente sería otro documento.
  const ambiente = (factura.sii_ambiente ?? "certificacion") as Ambiente;

  // --- Cerrojo -------------------------------------------------------------
  //
  // Mismo criterio que en emitir: el UPDATE cambia `estado_sii`, así que si dos
  // pestañas reintentan a la vez, la segunda re-evalúa el WHERE contra la fila
  // ya modificada y no calza. Acá la condición de entrada es estar en 'error',
  // que es justo el estado del que se sale reintentando.
  const { data: cerrojo, error: errCerrojo } = await supabase
    .from("facturas")
    .update({ estado_sii: "emitiendo", updated_at: new Date().toISOString() })
    .eq("id", facturaId)
    .eq("estado", "borrador")
    .eq("estado_sii", "error")
    .select("id");
  if (errCerrojo) return { error: `No se pudo iniciar el reenvío: ${errCerrojo.message}` };
  if (!cerrojo || cerrojo.length === 0) {
    return {
      error:
        "Esta factura no está en estado de error, o ya se está reenviando desde otra pantalla. Recargá la lista.",
    };
  }

  /** Devuelve la factura a 'error' con el motivo. Nunca la deja trabada. */
  const fallar = async (mensaje: string): Promise<ResultadoReenvio> => {
    await supabase
      .from("facturas")
      .update({ estado_sii: "error", sii_glosa: mensaje, updated_at: new Date().toISOString() })
      .eq("id", facturaId);
    revalidatePath("/facturas");
    return { error: mensaje, folio: Number(factura.folio) };
  };

  // --- El documento ya timbrado, tal cual quedó ----------------------------
  const { data: archivo, error: errXml } = await supabase.storage
    .from("adjuntos")
    .download(factura.sii_xml_path);
  if (errXml || !archivo) {
    return fallar("No se pudo leer el documento timbrado guardado. Revisá el archivo en Storage.");
  }
  const dteXml = await archivo.text();

  const credencial = await cargarCredencial(empresa.id, ambiente, empresa.rut);
  if ("error" in credencial) return fallar(credencial.error);

  if (credencial.numeroResolucion === null || !credencial.fechaResolucion) {
    return fallar(
      "Faltan el número y la fecha de la resolución del SII: van en la carátula de todo envío.",
    );
  }

  // El sobre se arma de nuevo —es solo la envoltura— pero el DTE de adentro es
  // el mismo que ya se timbró con el folio que ya se consumió.
  const sobre = await generarSobre(
    {
      rutEmisor: credencial.rutEmpresa,
      rutReceptor: RUT_SII,
      numeroResolucion: credencial.numeroResolucion,
      fechaResolucion: credencial.fechaResolucion,
    },
    credencial.certificado,
    [dteXml],
  );
  if ("error" in sobre) return fallar(sobre.error);

  const enviado = await enviarAlSii(credencial.certificado, sobre.xml, ambiente);
  if ("error" in enviado) {
    return fallar(`${enviado.error} El documento sigue timbrado: se puede volver a reintentar.`);
  }

  const { error: errUpdate } = await supabase
    .from("facturas")
    .update({
      estado: "emitida",
      sii_track_id: String(enviado.trackId),
      sii_enviado_at: new Date().toISOString(),
      estado_sii: enviado.estado || "enviado",
      sii_glosa: enviado.glosa || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", facturaId);
  if (errUpdate) {
    return {
      error: `El SII recibió el documento (track id ${enviado.trackId}) pero no se pudo actualizar la factura: ${errUpdate.message}`,
      folio: Number(factura.folio),
      trackId: enviado.trackId,
    };
  }

  revalidatePath("/facturas");
  revalidatePath(`/facturas/${facturaId}`);
  return { ok: true, folio: Number(factura.folio), trackId: enviado.trackId };
}
