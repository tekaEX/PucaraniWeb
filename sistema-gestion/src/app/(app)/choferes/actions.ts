"use server";

import { exigirPanel, puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { s, sReq, bool } from "@/lib/form-helpers";
import { clasesLicencia, validarLicencia } from "@/lib/flota";

export type FormState = { error?: string; ok?: boolean };

// El chofer es una FICHA, no un usuario: acá se registra quién maneja, su
// licencia y sus datos, y eso es todo. No tiene cuenta ni forma de entrar al
// sistema. La tuvo mientras existió la app de reparto (/conductor), que se fue
// a Ares con encomiendas; era el único lugar donde un chofer iniciaba sesión.
//
// El chequeo de permiso que vivía acá (puedeAdministrarChoferes) era idéntico a
// puedeEditar() de lib/auth.ts, así que se unificó: coincide con la policy
// choferes_write_admin_op de la migración 0006.

export async function guardarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

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
  if (!id) redirect("/choferes?guardado=Chofer+agregado");
  return { ok: true };
}

/**
 * Alta rápida de un chofer con solo el nombre, sin salir de la pantalla.
 *
 * Mismo motivo que `crearClienteRapido`: en el sistema anterior el chofer se
 * agregaba desde un cuadro con un campo mientras se cargaba el servicio. La
 * licencia y sus fechas se completan después en la ficha (y hasta que eso
 * pase, sus papeles aparecen como "sin cargar", que es la verdad).
 */
export async function crearChoferRapido(
  nombre: string,
): Promise<{ id: string; nombre: string } | { error: string }> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const limpio = nombre.trim();
  if (!limpio) return { error: "Escribe el nombre del chofer." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("choferes")
    .insert({ nombre: limpio })
    .select("id, nombre")
    .single();

  if (error) return { error: `No se pudo crear: ${error.message}` };

  revalidatePath("/choferes");
  revalidatePath("/taxis");
  return { id: data.id as string, nombre: data.nombre as string };
}

// Borrado total: elimina al chofer; sus asignaciones de viaje quedan sin
// chofer (o desaparecen si esa fila era solo de este chofer — ver migración
// 0015). Para "ya no trabaja aquí" sin perder historial, usar desactivarChofer.
export async function eliminarChofer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

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
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

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
// viajes para decidir qué advertencia mostrar en el diálogo. Guardia por el
// mismo motivo que tieneHistorialVehiculo: sin sesión, RLS haría que devolviera
// "no tiene historial" en vez de rechazar.
export async function tieneHistorialChofer(id: string): Promise<boolean> {
  await exigirPanel();
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
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el chofer." };

  // La licencia es lo que habilita a manejar: una clase escrita a mano que no
  // existe ("clase Z") no deja saber si el chofer puede llevar un bus, y una
  // fecha ilegible se leería como documento vigente.
  const clases = clasesLicencia(s(formData.get("licencia_clase")));
  if ("error" in clases) return { error: clases.error };
  const licencia_vencimiento = s(formData.get("licencia_vencimiento"));
  const problema = validarLicencia(licencia_vencimiento);
  if (problema) return { error: problema };

  const values = {
    licencia_numero: s(formData.get("licencia_numero")),
    licencia_clase: clases.clases,
    licencia_vencimiento,
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
  if (!(await puedeEditar())) return;

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
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

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
