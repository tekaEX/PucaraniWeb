"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, bool } from "@/lib/form-helpers";
import type { CotizacionEstado } from "@/types/db";

export type FormState = { error?: string; ok?: boolean };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

type ItemInput = {
  descripcion: string;
  cantidad: number;
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
        return {
          descripcion: String(o.descripcion ?? "").trim(),
          cantidad: Number(o.cantidad ?? 1) || 0,
          valor_unitario: Number(o.valor_unitario ?? 0) || 0,
        };
      })
      .filter((it) => it.descripcion !== "" || it.valor_unitario !== 0);
  } catch {
    return [];
  }
}

function calcTotales(items: ItemInput[], exento: boolean) {
  const subtotal = items.reduce(
    (acc, it) => acc + Math.round(it.cantidad * it.valor_unitario),
    0,
  );
  const iva = exento ? 0 : Math.round(subtotal * 0.19);
  return { subtotal, iva, total: subtotal + iva };
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
    .select("id, cliente_id, items:cotizacion_items(descripcion, cantidad, valor_unitario, orden)")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (!cot) return null;
  if (!cot.cliente_id) {
    return "La cotización quedó aceptada, pero sin cliente no se pueden generar los viajes: asígnale un cliente y guarda de nuevo.";
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const filas = [...(cot.items ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((it) => ({
      cliente_id: cot.cliente_id,
      cotizacion_id: cot.id,
      descripcion: it.descripcion,
      fecha_inicio: hoy,
      estado: "programado" as const,
      valor: Math.round(Number(it.cantidad) * Number(it.valor_unitario)),
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
    fecha: sReq(formData.get("fecha")) || new Date().toISOString().slice(0, 10),
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
  if (isDemo()) return { error: DEMO_MSG };

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

  const rows = items.map((it, i) => ({
    cotizacion_id: cot.id,
    orden: i,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    valor_unitario: it.valor_unitario,
    total: Math.round(it.cantidad * it.valor_unitario),
  }));
  await supabase.from("cotizacion_items").insert(rows);

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
  if (isDemo()) return { error: DEMO_MSG };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador de la cotización." };

  const header = readHeader(formData);
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
  const rows = items.map((it, i) => ({
    cotizacion_id: id,
    orden: i,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    valor_unitario: it.valor_unitario,
    total: Math.round(it.cantidad * it.valor_unitario),
  }));
  await supabase.from("cotizacion_items").insert(rows);

  // Aceptada ⇒ sus líneas se vuelven viajes programados (una sola vez).
  if (header.estado === "aceptada") {
    const errViajes = await generarViajesDesdeCotizacion(supabase, id);
    if (errViajes) {
      revalidatePath("/cotizaciones");
      return { error: errViajes };
    }
  }

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  // Sin redirect: la edición vive inline (documento editable en el acordeón)
  // con autoguardado; devolver ok mantiene abierto el panel.
  return { ok: true };
}

export async function eliminarCotizacion(formData: FormData) {
  if (isDemo()) redirect("/cotizaciones");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("cotizaciones").delete().eq("id", id);
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}
