"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, bool } from "@/lib/form-helpers";

export type FormState = { error?: string };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

export async function guardarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = s(formData.get("id"));
  const nombre = sReq(formData.get("nombre"));
  if (!nombre) return { error: "El nombre del chofer es obligatorio." };

  const values = {
    nombre,
    rut: s(formData.get("rut")),
    telefono: s(formData.get("telefono")),
    licencia_numero: s(formData.get("licencia_numero")),
    licencia_clase: s(formData.get("licencia_clase")),
    licencia_vencimiento: s(formData.get("licencia_vencimiento")),
    activo: bool(formData.get("activo")),
    notas: s(formData.get("notas")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("choferes").update(values).eq("id", id)
    : await supabase.from("choferes").insert(values);

  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/choferes");
  redirect("/choferes");
}

export async function eliminarChofer(formData: FormData) {
  if (isDemo()) redirect("/choferes");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("choferes").delete().eq("id", id);
  revalidatePath("/choferes");
  redirect("/choferes");
}
