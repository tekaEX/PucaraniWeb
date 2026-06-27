"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, bool, intNull, num } from "@/lib/form-helpers";

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
  revalidatePath("/");
  // Al crear vuelve a la lista; al editar inline se queda en el acordeón.
  if (!id) redirect("/vehiculos");
  return { ok: true };
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

// ---- Gastos por vehículo ----
const GASTO_CATS = ["combustible", "mantencion", "seguros", "otros"];

export async function agregarGasto(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const vehiculo_id = sReq(formData.get("vehiculo_id"));
  if (!vehiculo_id) return { error: "Falta el vehículo." };

  const catRaw = sReq(formData.get("categoria"));
  const categoria = GASTO_CATS.includes(catRaw) ? catRaw : "otros";
  const monto_total = num(formData.get("monto_total"));
  if (!monto_total) return { error: "Ingresa un monto válido." };
  const fecha =
    sReq(formData.get("fecha")) || new Date().toISOString().slice(0, 10);
  const descripcion = s(formData.get("descripcion"));

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("empresa")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (!empresa) return { error: "No hay empresa configurada." };

  const { error } = await supabase.from("gastos_vehiculo").insert({
    empresa_id: empresa.id,
    vehiculo_id,
    categoria,
    descripcion,
    origen: "manual",
    fecha,
    monto_total,
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath(`/vehiculos/${vehiculo_id}`);
  revalidatePath("/vehiculos");
  return { ok: true };
}

export async function eliminarGasto(formData: FormData) {
  if (isDemo()) return;
  const id = sReq(formData.get("id"));
  const vehiculo_id = sReq(formData.get("vehiculo_id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("gastos_vehiculo").delete().eq("id", id);
  revalidatePath(`/vehiculos/${vehiculo_id}`);
  revalidatePath("/vehiculos");
}
