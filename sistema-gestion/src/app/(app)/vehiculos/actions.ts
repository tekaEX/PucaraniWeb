"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/format";
import { s, sReq, bool, intNull, num } from "@/lib/form-helpers";
import { formatearPatente, PATENTE_HINT } from "@/lib/patentes";

export type FormState = { error?: string; ok?: boolean };

export async function guardarVehiculo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // La patente ES el identificador: se guarda solo en formato canónico.
  const patenteOriginal = s(formData.get("patente_original"));
  const patenteRaw = sReq(formData.get("patente"));
  if (!patenteRaw) return { error: "La patente es obligatoria." };
  const patente = formatearPatente(patenteRaw);
  if (!patente) return { error: `Patente inválida. ${PATENTE_HINT}.` };

  const values = {
    patente,
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
  const { error } = patenteOriginal
    ? await supabase.from("vehiculos").update(values).eq("patente", patenteOriginal)
    : await supabase.from("vehiculos").insert(values);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/vehiculos");
  revalidatePath("/");
  // Al crear vuelve a la lista; al editar inline se queda en el acordeón.
  if (!patenteOriginal) redirect("/vehiculos");
  return { ok: true };
}

// Borrado total: elimina el vehículo y su historial de asignaciones queda
// sin vehículo (o desaparece si esa fila era solo de este vehículo — ver
// migración 0014). El dueño lo pide para casos donde el vehículo debe dejar
// de existir en el sistema, no solo dejar de usarse (para eso, desactivarVehiculo).
export async function eliminarVehiculo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const patente = sReq(formData.get("patente"));
  if (!patente) return { error: "Falta la patente." };
  const supabase = await createClient();
  const { error } = await supabase.from("vehiculos").delete().eq("patente", patente);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/vehiculos");
  revalidatePath("/");
  redirect("/vehiculos");
}

// El vehículo deja de usarse, pero se conserva junto con su historial.
export async function desactivarVehiculo(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const patente = sReq(formData.get("patente"));
  if (!patente) return { error: "Falta la patente." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehiculos")
    .update({ activo: false })
    .eq("patente", patente);
  if (error) return { error: `No se pudo desactivar: ${error.message}` };
  revalidatePath("/vehiculos");
  revalidatePath("/");
  return { ok: true };
}

// Antes de eliminar, se consulta al vuelo si el vehículo tiene historial
// (viajes o gastos) para decidir qué advertencia mostrar en el diálogo.
export async function tieneHistorialVehiculo(patente: string): Promise<boolean> {
  const supabase = await createClient();
  const [asig, gastos] = await Promise.all([
    supabase
      .from("viaje_asignaciones")
      .select("id", { count: "exact", head: true })
      .eq("vehiculo_id", patente),
    supabase
      .from("gastos_vehiculo")
      .select("id", { count: "exact", head: true })
      .eq("vehiculo_id", patente),
  ]);
  return (asig.count ?? 0) > 0 || (gastos.count ?? 0) > 0;
}

// ---- Gastos por vehículo ----
const GASTO_CATS = ["combustible", "mantencion", "seguros", "otros"];

export async function agregarGasto(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const vehiculo_id = sReq(formData.get("vehiculo_id"));
  if (!vehiculo_id) return { error: "Falta el vehículo." };

  const catRaw = sReq(formData.get("categoria"));
  const categoria = GASTO_CATS.includes(catRaw) ? catRaw : "otros";
  const monto_total = num(formData.get("monto_total"));
  if (!monto_total) return { error: "Ingresa un monto válido." };
  const fecha =
    sReq(formData.get("fecha")) || hoyChile();
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

  revalidatePath("/vehiculos");
  return { ok: true };
}

export async function eliminarGasto(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("gastos_vehiculo").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/vehiculos");
  return { ok: true };
}
