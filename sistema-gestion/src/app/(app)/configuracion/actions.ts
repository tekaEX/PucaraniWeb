"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, intNull } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

export async function guardarEmpresa(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo())
    return {
      error: "Modo demostración: conecta Supabase (ver README) para guardar datos reales.",
    };

  const id = s(formData.get("id"));

  const values = {
    nombre: sReq(formData.get("nombre")) || "Transportes Pucarani",
    razon_social: s(formData.get("razon_social")),
    rut: s(formData.get("rut")),
    direccion: s(formData.get("direccion")),
    ciudad: s(formData.get("ciudad")),
    giro: s(formData.get("giro")),
    telefono: s(formData.get("telefono")),
    email: s(formData.get("email")),
    representante: s(formData.get("representante")),
    logo_url: s(formData.get("logo_url")),
    proximo_numero_cotizacion:
      intNull(formData.get("proximo_numero_cotizacion")) ?? 1189,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("empresa").update(values).eq("id", id)
    : await supabase.from("empresa").insert(values);

  if (error) {
    return { error: `No se pudo guardar: ${error.message}` };
  }

  revalidatePath("/configuracion");
  revalidatePath("/");
  return { ok: true };
}
