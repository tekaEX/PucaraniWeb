"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/format";
import { s, sReq, bool } from "@/lib/form-helpers";
import type { CotizacionEstado } from "@/types/db";

export type FormState = { error?: string; ok?: boolean };

type ItemInput = {
  descripcion: string;
  fecha: string | null;
  valor_unitario: number;
};

const ESTADOS: CotizacionEstado[] = [
  "borrador",
  "enviada",
  "aceptada",
  "rechazada",
];

function parseItems(raw: string | null): ItemInput[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    return arr
      .map((it) => {
        const o = it as Record<string, unknown>;
        const fecha = String(o.fecha ?? "").trim();
        return {
          descripcion: String(o.descripcion ?? "").trim(),
          fecha: fecha || null,
          valor_unitario: Number(o.valor_unitario ?? 0) || 0,
        };
      })
      .filter((it) => it.descripcion !== "" || it.valor_unitario !== 0);
  } catch {
    return [];
  }
}

// Cada línea vale su valor_unitario (ya no hay cantidad).
function calcTotales(items: ItemInput[], exento: boolean) {
  const subtotal = items.reduce((acc, it) => acc + Math.round(it.valor_unitario), 0);
  const iva = exento ? 0 : Math.round(subtotal * 0.19);
  return { subtotal, iva, total: subtotal + iva };
}

// Filas de cotizacion_items a insertar (sin cantidad; total = valor).
function itemRows(items: ItemInput[], cotizacionId: string) {
  return items.map((it, i) => ({
    cotizacion_id: cotizacionId,
    orden: i,
    descripcion: it.descripcion,
    fecha: it.fecha,
    valor_unitario: it.valor_unitario,
    total: Math.round(it.valor_unitario),
  }));
}

// Al ACEPTAR una cotización, sus líneas se convierten en viajes PROGRAMADOS
// (uno por línea, vinculados a la cotización) para que la operación aparezca
// de inmediato en Viajes. Solo se generan si la cotización aún no tiene
// viajes (evita duplicados al re-guardar o re-aceptar) y requiere cliente.
// La fecha de inicio queda como hoy: se ajusta después en cada viaje.
async function generarViajesDesdeCotizacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cotizacionId: string,
): Promise<string | null> {
  const { count } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("cotizacion_id", cotizacionId);
  if ((count ?? 0) > 0) return null;

  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("id, cliente_id, items:cotizacion_items(descripcion, fecha, valor_unitario, orden)")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (!cot) return null;
  if (!cot.cliente_id) {
    return "La cotización quedó aceptada, pero sin cliente no se pueden generar los viajes: asígnale un cliente y guarda de nuevo.";
  }

  // Cada línea es un viaje programado; su fecha es la de la línea (o hoy).
  const hoy = hoyChile();
  const filas = [...(cot.items ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((it) => ({
      cliente_id: cot.cliente_id,
      cotizacion_id: cot.id,
      descripcion: it.descripcion,
      fecha_inicio: it.fecha ?? hoy,
      estado: "programado" as const,
      valor: Math.round(Number(it.valor_unitario)),
    }));
  if (filas.length === 0) return null;

  const { error } = await supabase.from("viajes").insert(filas);
  if (error) return `No se pudieron generar los viajes: ${error.message}`;

  revalidatePath("/viajes");
  revalidatePath("/");
  return null;
}

function readHeader(formData: FormData) {
  const estadoRaw = sReq(formData.get("estado")) as CotizacionEstado;
  return {
    fecha: sReq(formData.get("fecha")) || hoyChile(),
    fecha_validez: s(formData.get("fecha_validez")),
    cliente_id: s(formData.get("cliente_id")),
    autor: s(formData.get("autor")),
    titulo: s(formData.get("titulo")),
    nota_pie: s(formData.get("nota_pie")),
    exento_iva: bool(formData.get("exento_iva")),
    estado: ESTADOS.includes(estadoRaw) ? estadoRaw : "borrador",
  };
}

export async function crearCotizacion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const header = readHeader(formData);
  const items = parseItems(s(formData.get("itemsJson")));
  if (items.length === 0) {
    return { error: "Agrega al menos una línea de servicio." };
  }
  const totales = calcTotales(items, header.exento_iva);

  const supabase = await createClient();

  const { data: numero, error: numError } = await supabase.rpc(
    "next_cotizacion_numero",
  );
  if (numError) {
    return { error: `No se pudo generar el número: ${numError.message}` };
  }

  const { data: cot, error } = await supabase
    .from("cotizaciones")
    .insert({ numero, ...header, ...totales })
    .select("id")
    .single();

  if (error || !cot) {
    return { error: `No se pudo crear la cotización: ${error?.message}` };
  }

  await supabase.from("cotizacion_items").insert(itemRows(items, cot.id));

  // Si nace directamente aceptada, genera sus viajes (mejor esfuerzo: la
  // cotización ya existe, así que no bloqueamos la redirección).
  if (header.estado === "aceptada") {
    await generarViajesDesdeCotizacion(supabase, cot.id);
  }

  revalidatePath("/cotizaciones");
  // Siempre de vuelta a la lista: el detalle/edición vive en el acordeón.
  redirect("/cotizaciones");
}

export async function actualizarCotizacion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador de la cotización." };

  // El estado NO se toca aquí: lo maneja actualizarEstadoCotizacion (pastilla),
  // para no pisarlo cuando el autoguardado del documento y el cambio de estado
  // ocurren casi a la vez.
  const { estado: _estado, ...header } = readHeader(formData);
  void _estado;
  const items = parseItems(s(formData.get("itemsJson")));
  if (items.length === 0) {
    return { error: "Agrega al menos una línea de servicio." };
  }
  const totales = calcTotales(items, header.exento_iva);

  const supabase = await createClient();

  const { error } = await supabase
    .from("cotizaciones")
    .update({ ...header, ...totales, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return { error: `No se pudo actualizar: ${error.message}` };
  }

  await supabase.from("cotizacion_items").delete().eq("cotizacion_id", id);
  await supabase.from("cotizacion_items").insert(itemRows(items, id));

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  // Sin redirect: la edición vive inline (documento editable en el acordeón)
  // con autoguardado; devolver ok mantiene abierto el panel.
  return { ok: true };
}

// Cambia SOLO el estado (pastilla, autoguardado con acción dedicada — evita la
// carrera con el autoguardado del documento). Aceptada ⇒ genera los viajes.
export async function actualizarEstadoCotizacion(formData: FormData) {
  const id = sReq(formData.get("id"));
  const estadoRaw = sReq(formData.get("estado")) as CotizacionEstado;
  const estado: CotizacionEstado = ESTADOS.includes(estadoRaw) ? estadoRaw : "borrador";
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("cotizaciones").update({ estado }).eq("id", id);

  if (estado === "aceptada") {
    await generarViajesDesdeCotizacion(supabase, id);
  }

  revalidatePath("/cotizaciones");
  revalidatePath("/viajes");
  revalidatePath("/");
}

export async function eliminarCotizacion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("cotizaciones").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}
