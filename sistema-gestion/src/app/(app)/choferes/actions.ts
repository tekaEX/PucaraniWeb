"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { s, sReq, bool } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

export async function guardarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = s(formData.get("id"));
  const nombre = sReq(formData.get("nombre"));
  if (!nombre) return { error: "El nombre del chofer es obligatorio." };

  // La licencia se gestiona aparte (en la ficha), no aquí, para no sobrescribirla.
  const values = {
    nombre,
    rut: s(formData.get("rut")),
    telefono: s(formData.get("telefono")),
    activo: bool(formData.get("activo")),
    notas: s(formData.get("notas")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("choferes").update(values).eq("id", id)
    : await supabase.from("choferes").insert(values);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/choferes");
  revalidatePath("/");
  // Al crear, vuelve a la lista; al editar inline, se queda en el acordeón.
  if (!id) redirect("/choferes");
  return { ok: true };
}

// Borrado total: elimina al chofer; sus asignaciones de viaje quedan sin
// chofer (o desaparecen si esa fila era solo de este chofer — ver migración
// 0015). Para "ya no trabaja aquí" sin perder historial, usar desactivarChofer.
export async function eliminarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("choferes").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/choferes");
  revalidatePath("/");
  redirect("/choferes");
}

// El chofer deja de trabajar, pero se conserva junto con su historial.
export async function desactivarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("choferes").update({ activo: false }).eq("id", id);
  if (error) return { error: `No se pudo desactivar: ${error.message}` };
  revalidatePath("/choferes");
  revalidatePath("/");
  return { ok: true };
}

// Antes de eliminar, se consulta al vuelo si el chofer tiene historial de
// viajes para decidir qué advertencia mostrar en el diálogo.
export async function tieneHistorialChofer(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("viaje_asignaciones")
    .select("id", { count: "exact", head: true })
    .eq("chofer_id", id);
  return (count ?? 0) > 0;
}

// Actualiza la licencia del chofer (sus clases, número y única fecha de vencimiento).
export async function actualizarLicencia(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el chofer." };

  const values = {
    licencia_numero: s(formData.get("licencia_numero")),
    licencia_clase: s(formData.get("licencia_clase")),
    licencia_vencimiento: s(formData.get("licencia_vencimiento")),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("choferes").update(values).eq("id", id);
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/choferes");
  revalidatePath("/");
  return { ok: true };
}

// Guarda la URL de la foto de perfil del chofer (subida desde el navegador).
export async function actualizarFotoChofer(formData: FormData) {
  const id = sReq(formData.get("id"));
  const foto_url = s(formData.get("foto_url"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("choferes").update({ foto_url }).eq("id", id);
  revalidatePath(`/choferes/${id}`);
  revalidatePath("/choferes");
}
