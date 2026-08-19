"use server";

import { puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/format";
import { s, sReq, num } from "@/lib/form-helpers";
import { estadoViaje, parsearAsignaciones } from "@/lib/viajes";

export type FormState = { error?: string; ok?: boolean };

export async function guardarViaje(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = s(formData.get("id"));
  const estado = estadoViaje(sReq(formData.get("estado")));

  const descripcion = s(formData.get("descripcion"));
  if (!descripcion) return { error: "La descripción del servicio es obligatoria." };

  const cliente_id = s(formData.get("cliente_id"));
  if (!cliente_id) return { error: "Todo viaje debe tener un cliente." };

  const values = {
    descripcion,
    cliente_id,
    cotizacion_id: s(formData.get("cotizacion_id")),
    fecha_inicio: sReq(formData.get("fecha_inicio")) || hoyChile(),
    fecha_fin: s(formData.get("fecha_fin")),
    estado,
    valor: num(formData.get("valor")),
    orden_compra: s(formData.get("orden_compra")),
    costo_combustible: num(formData.get("costo_combustible")),
    costo_peajes: num(formData.get("costo_peajes")),
    costo_viaticos: num(formData.get("costo_viaticos")),
    costo_otros: num(formData.get("costo_otros")),
    notas: s(formData.get("notas")),
  };

  const asignaciones = parsearAsignaciones(s(formData.get("asignaciones")));

  const supabase = await createClient();
  const result = id
    ? await supabase.from("viajes").update(values).eq("id", id).select("id").single()
    : await supabase.from("viajes").insert(values).select("id").single();

  if (result.error) {
    return { error: `No se pudo guardar: ${result.error.message}` };
  }

  const viajeId = result.data.id as string;

  // Reemplaza las asignaciones completas (patrón simple y sin estados a medias:
  // la lista del formulario ES la verdad).
  const del = await supabase.from("viaje_asignaciones").delete().eq("viaje_id", viajeId);
  if (del.error) {
    return { error: `Viaje guardado, pero no se pudieron actualizar las asignaciones: ${del.error.message}` };
  }
  if (asignaciones.length > 0) {
    const ins = await supabase
      .from("viaje_asignaciones")
      .insert(asignaciones.map((a) => ({ ...a, viaje_id: viajeId })));
    if (ins.error) {
      return { error: `Viaje guardado, pero no se pudieron guardar las asignaciones: ${ins.error.message}` };
    }
  }

  revalidatePath("/viajes");
  revalidatePath("/");
  // Edición inline (autoguardado): no redirige, mantiene abierto el acordeón.
  if (id) return { ok: true };
  redirect("/viajes?guardado=Viaje+registrado");
}

// Cambio rápido de estado desde la lista.
export async function actualizarEstadoViaje(formData: FormData) {
  if (!(await puedeEditar())) return;

  const id = sReq(formData.get("id"));
  // Un estado inválido acá NO se degrada a "programado": vendría de la
  // pastilla de la lista, y cambiar el estado a otra cosa distinta de la que se
  // pidió es peor que no hacer nada.
  const crudo = sReq(formData.get("estado"));
  if (estadoViaje(crudo) !== crudo) return;
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("viajes").update({ estado: crudo }).eq("id", id);
  revalidatePath("/viajes");
  revalidatePath("/");
}

export async function eliminarViaje(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("viajes").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/viajes");
  revalidatePath("/");
  redirect("/viajes");
}
