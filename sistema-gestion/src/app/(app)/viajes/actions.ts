"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { hoyChile } from "@/lib/format";
import { s, sReq, num } from "@/lib/form-helpers";
import type { ViajeEstado } from "@/types/db";

export type FormState = { error?: string; ok?: boolean };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

const ESTADOS: ViajeEstado[] = ["programado", "realizado", "cancelado"];

type AsignacionInput = {
  chofer_id: string | null;
  vehiculo_id: string | null;
  fecha: string | null;
};

// El formulario envía las asignaciones como JSON en un input oculto.
function parseAsignaciones(raw: string | null): AsignacionInput[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((a) => ({
        chofer_id: typeof a?.chofer_id === "string" && a.chofer_id !== "" ? a.chofer_id : null,
        vehiculo_id: typeof a?.vehiculo_id === "string" && a.vehiculo_id !== "" ? a.vehiculo_id : null,
        fecha: typeof a?.fecha === "string" && a.fecha !== "" ? a.fecha : null,
      }))
      // Una asignación sin chofer NI vehículo no dice nada (el check de la BD
      // también la rechazaría).
      .filter((a) => a.chofer_id !== null || a.vehiculo_id !== null);
  } catch {
    return [];
  }
}

export async function guardarViaje(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = s(formData.get("id"));
  const estadoRaw = sReq(formData.get("estado")) as ViajeEstado;
  const estado: ViajeEstado = ESTADOS.includes(estadoRaw) ? estadoRaw : "programado";

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

  const asignaciones = parseAsignaciones(s(formData.get("asignaciones")));

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
  redirect("/viajes");
}

// Cambio rápido de estado desde la lista.
export async function actualizarEstadoViaje(formData: FormData) {
  const id = sReq(formData.get("id"));
  const estadoRaw = sReq(formData.get("estado")) as ViajeEstado;
  if (!ESTADOS.includes(estadoRaw)) return;

  if (isDemo()) {
    revalidatePath("/viajes");
    return;
  }
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("viajes").update({ estado: estadoRaw }).eq("id", id);
  revalidatePath("/viajes");
  revalidatePath("/");
}

export async function eliminarViaje(formData: FormData) {
  if (isDemo()) redirect("/viajes");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("viajes").delete().eq("id", id);
  if (error) return;
  revalidatePath("/viajes");
  revalidatePath("/");
  redirect("/viajes");
}
