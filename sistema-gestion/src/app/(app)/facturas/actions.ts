"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, num, intNull } from "@/lib/form-helpers";
import type { FacturaEstado } from "@/types/db";

export type FormState = { error?: string };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

const ESTADOS: FacturaEstado[] = ["borrador", "emitida", "anulada"];
const TIPOS_DTE = [33, 34, 56, 61];

function parseViajeIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x !== "") : [];
  } catch {
    return [];
  }
}

// Traduce los errores de las restricciones de la BD a mensajes entendibles.
function mensajeError(msg: string): string {
  if (msg.includes("facturas_folio_unico")) {
    return "Ya existe una factura con ese folio y tipo de documento.";
  }
  if (msg.includes("estado") && msg.includes("emitida")) {
    return "Una factura emitida necesita folio y fecha de emisión.";
  }
  return msg;
}

export async function guardarFactura(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = s(formData.get("id"));

  const cliente_id = s(formData.get("cliente_id"));
  if (!cliente_id) return { error: "La factura debe tener un cliente (receptor)." };

  const estadoRaw = sReq(formData.get("estado")) as FacturaEstado;
  const estado: FacturaEstado = ESTADOS.includes(estadoRaw) ? estadoRaw : "borrador";

  const tipoRaw = intNull(formData.get("tipo_dte")) ?? 34;
  const tipo_dte = TIPOS_DTE.includes(tipoRaw) ? tipoRaw : 34;

  const folio = intNull(formData.get("folio"));
  const fecha_emision = s(formData.get("fecha_emision"));
  if (estado === "emitida" && (!folio || !fecha_emision)) {
    return { error: "Para marcarla como emitida indica el folio y la fecha de emisión." };
  }

  let fecha_pago = s(formData.get("fecha_pago"));
  if (fecha_pago && estado === "borrador") {
    return { error: "Un borrador no puede tener fecha de pago: emite la factura primero." };
  }
  if (formData.get("marcar_pagada") === "1" && !fecha_pago) {
    fecha_pago = new Date().toISOString().slice(0, 10);
  }

  const values = {
    cliente_id,
    tipo_dte,
    folio,
    fecha_emision,
    estado,
    neto: num(formData.get("neto")),
    iva: num(formData.get("iva")),
    total: num(formData.get("total")),
    fecha_pago,
    archivo_path: s(formData.get("archivo_path")),
    notas: s(formData.get("notas")),
  };

  const viajeIds = parseViajeIds(s(formData.get("viajes")));

  const supabase = await createClient();
  const result = id
    ? await supabase.from("facturas").update(values).eq("id", id).select("id").single()
    : await supabase.from("facturas").insert(values).select("id").single();

  if (result.error) {
    return { error: `No se pudo guardar: ${mensajeError(result.error.message)}` };
  }

  const facturaId = result.data.id as string;

  // Sincroniza los viajes incluidos: la selección del formulario ES la verdad.
  const unlink = await supabase
    .from("viajes")
    .update({ factura_id: null })
    .eq("factura_id", facturaId)
    .not("id", "in", `(${viajeIds.length > 0 ? viajeIds.join(",") : "00000000-0000-0000-0000-000000000000"})`);
  if (unlink.error) {
    return { error: `Factura guardada, pero no se pudieron desvincular viajes: ${unlink.error.message}` };
  }
  if (viajeIds.length > 0) {
    const link = await supabase
      .from("viajes")
      .update({ factura_id: facturaId })
      .in("id", viajeIds);
    if (link.error) {
      return { error: `Factura guardada, pero no se pudieron vincular los viajes: ${link.error.message}` };
    }
  }

  revalidatePath("/facturas");
  revalidatePath("/viajes");
  revalidatePath("/cobranzas");
  revalidatePath("/");
  redirect("/facturas");
}

// Registra el pago de hoy desde la lista (acción rápida).
export async function marcarPagada(formData: FormData) {
  const id = sReq(formData.get("id"));

  if (isDemo()) {
    revalidatePath("/facturas");
    return;
  }
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("facturas")
    .update({ fecha_pago: new Date().toISOString().slice(0, 10) })
    .eq("id", id)
    .is("fecha_pago", null);
  revalidatePath("/facturas");
  revalidatePath("/cobranzas");
  revalidatePath("/");
}

export async function eliminarFactura(formData: FormData) {
  if (isDemo()) redirect("/facturas");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  // Los viajes vinculados vuelven solos a "por facturar" (FK on delete set null).
  const { error } = await supabase.from("facturas").delete().eq("id", id);
  if (error) return;
  revalidatePath("/facturas");
  revalidatePath("/viajes");
  revalidatePath("/");
  redirect("/facturas");
}
