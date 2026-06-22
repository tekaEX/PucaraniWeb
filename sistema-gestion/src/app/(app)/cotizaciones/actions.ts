"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, bool } from "@/lib/form-helpers";
import type { CotizacionEstado } from "@/types/db";

export type FormState = { error?: string };

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

  revalidatePath("/cotizaciones");
  redirect(`/cotizaciones/${cot.id}`);
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

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  redirect(`/cotizaciones/${id}`);
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
