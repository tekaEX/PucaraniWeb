"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { s, sReq } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

export async function guardarCliente(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
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
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("clientes").update(values).eq("id", id)
    : await supabase.from("clientes").insert(values);

  if (error) {
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/clientes");
  // Al crear, vuelve a la lista; al editar inline, se queda en el acordeón.
  if (!id) redirect("/clientes");
  return { ok: true };
}

export async function eliminarCliente(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("clientes").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "No se puede eliminar: este cliente tiene facturas y/o viajes registrados en su historial.",
      };
    }
    return { error: `No se pudo eliminar: ${error.message}` };
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}
