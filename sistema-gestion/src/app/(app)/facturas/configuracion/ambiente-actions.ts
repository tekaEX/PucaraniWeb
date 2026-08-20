"use server";

// Cambiar el ambiente contra el que emite la empresa.
//
// Es la acción más peligrosa de la configuración y por eso está sola en su
// archivo: pasar a producción convierte cada factura siguiente en un documento
// tributario real. Anular uno cuesta una nota de crédito, y las notas todavía
// no se emiten desde el sistema.
//
// Tres barreras, y ninguna es decorativa:
//
//   1. Solo admin.
//   2. Hay que escribir la palabra PRODUCCION. Un `confirm()` se aprieta sin
//      leer; escribir una palabra obliga a mirar qué dice el cuadro.
//   3. No se pasa a producción sin credencial, resolución y folios DE
//      PRODUCCIÓN cargados. Sin eso el cambio solo lograría que dejara de
//      poder emitirse, y el error aparecería recién al apretar "Emitir".
//
// Volver a certificación no pide nada: es la dirección segura.

import { revalidatePath } from "next/cache";
import { esAdmin, SIN_PERMISO } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";
import { sReq } from "@/lib/form-helpers";
import { PALABRA_PRODUCCION, type Ambiente } from "@/lib/sii/estado";

export type FormState = { error?: string; ok?: string };

export async function cambiarAmbienteSii(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await esAdmin())) return { error: SIN_PERMISO };

  const destino = sReq(formData.get("ambiente"));
  if (destino !== "certificacion" && destino !== "produccion") {
    return { error: "Ambiente no válido." };
  }
  const ambiente = destino as Ambiente;

  const empresa = await empresaActual();
  if (!empresa) return { error: "No hay empresa configurada." };

  const supabase = await createClient();

  if (ambiente === "produccion") {
    const confirmacion = sReq(formData.get("confirmacion")).toUpperCase();
    if (confirmacion !== PALABRA_PRODUCCION) {
      return {
        error: `Para pasar a producción escribí ${PALABRA_PRODUCCION} en el campo de confirmación. Desde ese momento cada factura es un documento tributario real.`,
      };
    }

    // Comprobar que producción está EQUIPADA antes de activarla. Cambiar el
    // ambiente sin credenciales de producción no rompe nada de inmediato: rompe
    // la próxima emisión, que es el peor momento para enterarse.
    const [{ data: creds }, { data: cafs }] = await Promise.all([
      supabase
        .from("sii_credenciales")
        .select("cert_path, rut_certificado, numero_resolucion, fecha_resolucion")
        .eq("empresa_id", empresa.id)
        .eq("ambiente", "produccion"),
      supabase
        .from("sii_caf")
        .select("folio_siguiente, folio_hasta")
        .eq("empresa_id", empresa.id)
        .eq("ambiente", "produccion"),
    ]);

    const cred = creds?.[0] ?? null;
    const falta = !cred?.cert_path
      ? "el certificado digital de producción"
      : !cred.rut_certificado
        ? "el RUT del titular del certificado de producción"
        : cred.numero_resolucion === null || !cred.fecha_resolucion
          ? "la resolución del SII de producción (en producción NO es 0)"
          : !(cafs ?? []).some((c) => c.folio_siguiente <= c.folio_hasta)
            ? "un CAF de producción con folios disponibles"
            : null;

    if (falta) {
      return {
        error: `Todavía no se puede pasar a producción: falta ${falta}. Cargalo primero, sin cambiar de ambiente — las credenciales de producción se preparan aparte y no pisan las de certificación.`,
      };
    }
  }

  const { error } = await supabase
    .from("empresa")
    .update({ sii_ambiente_activo: ambiente, updated_at: new Date().toISOString() })
    .eq("id", empresa.id);
  if (error) return { error: `No se pudo cambiar el ambiente: ${error.message}` };

  revalidatePath("/facturas/configuracion");
  revalidatePath("/facturas");
  return {
    ok:
      ambiente === "produccion"
        ? "Ambiente cambiado a PRODUCCIÓN. Desde ahora cada factura emitida es un documento tributario real ante el SII."
        : "Ambiente cambiado a certificación. Lo que se emita es de prueba y no tiene efecto tributario.",
  };
}
