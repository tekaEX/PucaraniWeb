"use server";

import { puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/format";
import { s, sReq, bool } from "@/lib/form-helpers";
import { calcularTotales } from "@/lib/totales";
import {
  avisoViajes,
  estadoCotizacion,
  parsearItems,
  viajesDesdeCotizacion,
  type ItemCotizacion,
  type ResultadoViajes,
} from "@/lib/cotizaciones";
import type { CotizacionEstado } from "@/types/db";

export type FormState = { error?: string; ok?: boolean };

/** Lo que la pastilla de estado le devuelve al editor para avisar en pantalla. */
export type EstadoState = { mensaje?: string; error?: string };

// El cálculo vive en lib/totales.ts: lo comparten esta action y los dos
// formularios, así que lo que se muestra y lo que se guarda es el mismo código.

// Filas de cotizacion_items a insertar (sin cantidad; total = valor).
function itemRows(items: ItemCotizacion[], cotizacionId: string) {
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
): Promise<ResultadoViajes> {
  const { count } = await supabase
    .from("viajes")
    .select("id", { count: "exact", head: true })
    .eq("cotizacion_id", cotizacionId);
  if ((count ?? 0) > 0) return { tipo: "ya_estaban" };

  const { data: cot } = await supabase
    .from("cotizaciones")
    .select("id, cliente_id, items:cotizacion_items(descripcion, fecha, valor_unitario, orden)")
    .eq("id", cotizacionId)
    .maybeSingle();
  if (!cot) return { tipo: "nada" };
  if (!cot.cliente_id) {
    return {
      tipo: "error",
      mensaje:
        "La cotización quedó aceptada, pero sin cliente no se pueden generar los viajes: asígnale un cliente y guarda de nuevo.",
    };
  }

  // En qué se convierte cada línea lo decide lib/cotizaciones.ts; lo que se
  // decide acá es CUÁNDO, porque eso necesita consultar la base.
  const filas = viajesDesdeCotizacion(cot, hoyChile());
  if (filas.length === 0) return { tipo: "nada" };

  const { error } = await supabase.from("viajes").insert(filas);
  if (error) {
    return { tipo: "error", mensaje: `No se pudieron generar los viajes: ${error.message}` };
  }

  revalidatePath("/viajes");
  revalidatePath("/");
  return { tipo: "creados", cantidad: filas.length };
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
    estado: estadoCotizacion(estadoRaw),
  };
}

export async function crearCotizacion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const header = readHeader(formData);
  const items = parsearItems(s(formData.get("itemsJson")));
  if (items.length === 0) {
    return { error: "Agrega al menos una línea de servicio." };
  }
  const totales = calcularTotales(items, header.exento_iva);

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
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador de la cotización." };

  // El estado NO se toca aquí: lo maneja actualizarEstadoCotizacion (pastilla),
  // para no pisarlo cuando el autoguardado del documento y el cambio de estado
  // ocurren casi a la vez.
  const { estado: _estado, ...header } = readHeader(formData);
  void _estado;
  const items = parsearItems(s(formData.get("itemsJson")));
  if (items.length === 0) {
    return { error: "Agrega al menos una línea de servicio." };
  }
  const totales = calcularTotales(items, header.exento_iva);

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
//
// Devuelve un aviso en vez de `void`: los viajes se creaban de verdad, pero sin
// que nada lo dijera (ver ResultadoViajes en lib/cotizaciones.ts), y un fallo
// —una cotización sin cliente, un error de la base— se perdía del todo porque
// nadie leía lo que esta función devolvía.
export async function actualizarEstadoCotizacion(
  formData: FormData,
): Promise<EstadoState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  const estadoRaw = sReq(formData.get("estado")) as CotizacionEstado;
  const estado: CotizacionEstado = estadoCotizacion(estadoRaw);
  if (!id) return { error: "Falta el identificador de la cotización." };

  const supabase = await createClient();
  const { error } = await supabase.from("cotizaciones").update({ estado }).eq("id", id);
  if (error) return { error: `No se pudo cambiar el estado: ${error.message}` };

  let resultado: ResultadoViajes = { tipo: "nada" };
  if (estado === "aceptada") {
    resultado = await generarViajesDesdeCotizacion(supabase, id);
  }

  revalidatePath("/cotizaciones");
  revalidatePath("/viajes");
  revalidatePath("/");
  return avisoViajes(resultado);
}

export async function eliminarCotizacion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  const { error } = await supabase.from("cotizaciones").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}
