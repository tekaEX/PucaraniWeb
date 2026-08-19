"use server";

import { puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { s, sReq } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

export async function guardarCliente(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

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
    giro: s(formData.get("giro")),
    comuna: s(formData.get("comuna")),
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
  if (!id) redirect("/clientes?guardado=Cliente+agregado");
  return { ok: true };
}

/**
 * Alta rápida de una empresa con solo el nombre, sin salir de la pantalla.
 *
 * Existe por el flujo de Taxis: se está cargando un servicio, la empresa no
 * está en la lista, y en el sistema anterior se agregaba ahí mismo en un
 * cuadro con un campo. Mandar a alguien a /clientes a mitad de carga le hace
 * perder lo que venía escribiendo.
 *
 * El resto de la ficha (RUT, dirección, contacto) se completa después en
 * Clientes: acá se registra que la empresa existe, que es lo que hace falta
 * para asignarle el servicio.
 */
export async function crearClienteRapido(
  nombre: string,
): Promise<{ id: string; nombre: string } | { error: string }> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const limpio = nombre.trim();
  if (!limpio) return { error: "Escribe el nombre de la empresa." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre: limpio })
    .select("id, nombre")
    .single();

  if (error) return { error: `No se pudo crear: ${error.message}` };

  revalidatePath("/clientes");
  revalidatePath("/taxis");
  return { id: data.id as string, nombre: data.nombre as string };
}

export async function eliminarCliente(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

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
