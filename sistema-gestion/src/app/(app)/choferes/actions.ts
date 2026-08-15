"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth";
import { s, sReq, bool } from "@/lib/form-helpers";

export type FormState = { error?: string; ok?: boolean };

// El chofer es una FICHA, no un usuario: acá se registra quién maneja, su
// licencia y sus datos, y eso es todo. No tiene cuenta ni forma de entrar al
// sistema. La tuvo mientras existió la app de reparto (/conductor), que se fue
// a Ares con encomiendas; era el único lugar donde un chofer iniciaba sesión.
//
// Quién puede administrar la ficha. Coincide con la policy
// choferes_write_admin_op (migración 0006): RLS ya frena a los demás roles.
async function puedeAdministrarChoferes(): Promise<boolean> {
  const sesion = await sesionActual();
  return sesion?.rol === "admin" || sesion?.rol === "operador";
}

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

  // Guardia explícita, no decorativa: RLS frena el DELETE de la fila EN
  // SILENCIO (0 filas afectadas, sin error), así que sin este chequeo la
  // acción respondía "eliminado" a cualquier usuario con sesión. Las Server
  // Actions son endpoints POST de la ruta donde se usan; el proxy no las mira.
  if (!(await puedeAdministrarChoferes())) {
    return { error: "No tienes permiso para eliminar choferes." };
  }

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

const CATEGORIAS_VALIDAS = ["operacion", "taxis"];

// Reemplaza el set completo de categorías del chofer (la selección del
// formulario ES la verdad — mismo patrón que las asignaciones de viaje).
export async function guardarCategoriasChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el chofer." };

  const categorias = formData
    .getAll("categorias")
    .map(String)
    .filter((c) => CATEGORIAS_VALIDAS.includes(c));

  const supabase = await createClient();
  const { error: errDel } = await supabase
    .from("chofer_categorias")
    .delete()
    .eq("chofer_id", id);
  if (errDel) return { error: `No se pudieron guardar las categorías: ${errDel.message}` };

  if (categorias.length > 0) {
    const { error: errIns } = await supabase
      .from("chofer_categorias")
      .insert(categorias.map((categoria) => ({ chofer_id: id, categoria })));
    if (errIns) return { error: `No se pudieron guardar las categorías: ${errIns.message}` };
  }

  revalidatePath("/choferes");
  return { ok: true };
}
