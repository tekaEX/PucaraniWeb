"use server";

import { puedeEditar, SIN_PERMISO } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyChile } from "@/lib/format";
import { s, sReq, num, intNull } from "@/lib/form-helpers";
import {
  estadoFactura,
  mensajeErrorFactura,
  montosFactura,
  parsearViajeIds,
  tipoDte as tipoDteValido,
  validarFactura,
} from "@/lib/facturas";

export type FormState = { error?: string; ok?: boolean };

export async function guardarFactura(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = s(formData.get("id"));

  const cliente_id = s(formData.get("cliente_id"));
  const estado = estadoFactura(sReq(formData.get("estado")));
  const tipo_dte = tipoDteValido(intNull(formData.get("tipo_dte")));
  const folio = intNull(formData.get("folio"));
  const fecha_emision = s(formData.get("fecha_emision"));

  let fecha_pago = s(formData.get("fecha_pago"));
  if (formData.get("marcar_pagada") === "1" && !fecha_pago) {
    fecha_pago = hoyChile();
  }

  const problema = validarFactura({ cliente_id, estado, folio, fecha_emision, fecha_pago });
  if (problema) return { error: problema };

  // El desglose se RECALCULA acá, no se toma del formulario. Los campos
  // ocultos `neto` e `iva` que manda el navegador sirven para mostrar; lo que
  // se guarda sale de montosFactura(), sobre el total y el tipo de documento,
  // que sí son entrada del usuario.
  const { subtotal: neto, iva, total } = montosFactura(
    num(formData.get("total")),
    tipo_dte,
  );

  const values = {
    cliente_id,
    tipo_dte,
    folio,
    fecha_emision,
    estado,
    neto,
    iva,
    total,
    fecha_pago,
    archivo_path: s(formData.get("archivo_path")),
    notas: s(formData.get("notas")),
  };

  const viajeIds = parsearViajeIds(s(formData.get("viajes")));

  const supabase = await createClient();
  const result = id
    ? await supabase.from("facturas").update(values).eq("id", id).select("id").single()
    : await supabase.from("facturas").insert(values).select("id").single();

  if (result.error) {
    return { error: `No se pudo guardar: ${mensajeErrorFactura(result.error.message)}` };
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
  // Edición inline (autoguardado): no redirige, mantiene abierto el acordeón.
  if (id) return { ok: true };
  redirect("/facturas?guardado=Factura+registrada");
}

// Registra el pago de hoy desde la lista (acción rápida).
export async function marcarPagada(formData: FormData) {
  if (!(await puedeEditar())) return;

  const id = sReq(formData.get("id"));
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("facturas")
    .update({ fecha_pago: hoyChile() })
    .eq("id", id)
    .is("fecha_pago", null);
  revalidatePath("/facturas");
  revalidatePath("/cobranzas");
  revalidatePath("/");
}

// Cambia el estado DERIVADO de la factura desde la pastilla (autoguardado).
// Traduce el estado visible a las columnas reales:
//   borrador   → estado=borrador, sin pago
//   por_cobrar → estado=emitida, sin pago   (requiere folio)
//   pagada     → estado=emitida, fecha_pago=hoy (requiere folio)
//   anulada    → estado=anulada
// El cliente ya bloquea emitir/pagar sin folio; esto es la red de seguridad.
export async function actualizarEstadoFactura(formData: FormData) {
  if (!(await puedeEditar())) return;

  const id = sReq(formData.get("id"));
  const nuevo = sReq(formData.get("estado"));
  if (!id) return;

  const supabase = await createClient();
  const hoy = hoyChile();

  let values: Record<string, unknown>;
  if (nuevo === "borrador") values = { estado: "borrador", fecha_pago: null };
  else if (nuevo === "anulada") values = { estado: "anulada" };
  else if (nuevo === "por_cobrar") values = { estado: "emitida", fecha_pago: null };
  else if (nuevo === "pagada") values = { estado: "emitida", fecha_pago: hoy };
  else return;

  // Emitir exige folio + fecha de emisión (check de la base): si falta la
  // fecha, la ponemos hoy. Si falta el folio, no se puede emitir.
  if (nuevo === "por_cobrar" || nuevo === "pagada") {
    const { data: f } = await supabase
      .from("facturas")
      .select("folio, fecha_emision")
      .eq("id", id)
      .maybeSingle();
    if (!f?.folio) return; // sin folio no se emite (el cliente ya avisó)
    if (!f.fecha_emision) values.fecha_emision = hoy;
  }

  await supabase.from("facturas").update(values).eq("id", id);
  revalidatePath("/facturas");
  revalidatePath("/cobranzas");
  revalidatePath("/");
}

export async function eliminarFactura(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await puedeEditar())) return { error: SIN_PERMISO };

  const id = sReq(formData.get("id"));
  if (!id) return { error: "Falta el identificador." };
  const supabase = await createClient();
  // Los viajes vinculados vuelven solos a "por facturar" (FK on delete set null).
  const { error } = await supabase.from("facturas").delete().eq("id", id);
  if (error) return { error: `No se pudo eliminar: ${error.message}` };
  revalidatePath("/facturas");
  revalidatePath("/viajes");
  revalidatePath("/");
  redirect("/facturas");
}
