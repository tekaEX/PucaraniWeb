"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq } from "@/lib/form-helpers";

export type FormState = { error?: string };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

export async function guardarCliente(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = s(formData.get("id"));
  const nombre = sReq(formData.get("nombre"));

  if (!nombre) {
    return { error: "El nombre del cliente es obligatorio." };
  }

  const values = {
    nombre,
    codigo: s(formData.get("codigo")),
    rut: s(formData.get("rut")),
    direccion: s(formData.get("direccion")),
    contacto_nombre: s(formData.get("contacto_nombre")),
    contacto_email: s(formData.get("contacto_email")),
    contacto_telefono: s(formData.get("contacto_telefono")),
    notas: s(formData.get("notas")),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("clientes").update(values).eq("id", id)
    : await supabase.from("clientes").insert(values);

  if (error) {
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function eliminarCliente(formData: FormData) {
  if (isDemo()) redirect("/clientes");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("clientes").delete().eq("id", id);
  revalidatePath("/clientes");
  redirect("/clientes");
}
