"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, bool, intNull } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

export async function guardarVehiculo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = s(formData.get("id"));
  const patente = sReq(formData.get("patente"));
  if (!patente) return { error: "La patente es obligatoria." };

  const values = {
    patente: patente.toUpperCase(),
    marca: s(formData.get("marca")),
    modelo: s(formData.get("modelo")),
    anio: intNull(formData.get("anio")),
    capacidad: intNull(formData.get("capacidad")),
    km_actual: intNull(formData.get("km_actual")),
    revision_tecnica_venc: s(formData.get("revision_tecnica_venc")),
    soap_venc: s(formData.get("soap_venc")),
    permiso_circulacion_venc: s(formData.get("permiso_circulacion_venc")),
    activo: bool(formData.get("activo")),
    notas: s(formData.get("notas")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("vehiculos").update(values).eq("id", id)
    : await supabase.from("vehiculos").insert(values);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/vehiculos");
  redirect("/vehiculos");
}

// Actualiza solo las fechas de documentos de un vehículo existente.
export async function actualizarDocumentos(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el vehículo." };

  const values = {
    revision_tecnica_venc: s(formData.get("revision_tecnica_venc")),
    soap_venc: s(formData.get("soap_venc")),
    permiso_circulacion_venc: s(formData.get("permiso_circulacion_venc")),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("vehiculos").update(values).eq("id", id);
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/vehiculos");
  revalidatePath("/vehiculos/documentos");
  revalidatePath("/");
  return { ok: true };
}

export async function eliminarVehiculo(formData: FormData) {
  if (isDemo()) redirect("/vehiculos");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("vehiculos").delete().eq("id", id);
  revalidatePath("/vehiculos");
  redirect("/vehiculos");
}
