"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { s, sReq, num, numNull, intNull } from "@/lib/form-helpers";
import type { FacturaEstado } from "@/types/db";

export type FormState = { error?: string };

const DEMO_MSG =
  "Modo demostración: conecta Supabase (ver README) para guardar datos reales.";

const ESTADOS: FacturaEstado[] = [
  "en_proceso",
  "por_facturar",
  "facturada",
  "pagada",
];

export async function guardarFactura(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (isDemo()) return { error: DEMO_MSG };

  const id = s(formData.get("id"));
  const estadoRaw = sReq(formData.get("estado")) as FacturaEstado;
  const estado: FacturaEstado = ESTADOS.includes(estadoRaw)
    ? estadoRaw
    : "en_proceso";

  let fecha_pago = s(formData.get("fecha_pago"));
  // Si se marca como pagada y no se indicó fecha, usamos hoy.
  if (estado === "pagada" && !fecha_pago) {
    fecha_pago = new Date().toISOString().slice(0, 10);
  }

  const values = {
    numero: s(formData.get("numero")),
    fecha: sReq(formData.get("fecha")) || new Date().toISOString().slice(0, 10),
    descripcion: s(formData.get("descripcion")),
    cliente_id: s(formData.get("cliente_id")),
    cotizacion_id: s(formData.get("cotizacion_id")),
    chofer_id: s(formData.get("chofer_id")),
    vehiculo_id: s(formData.get("vehiculo_id")),
    n_buses: intNull(formData.get("n_buses")) ?? 1,
    valor_servicio: num(formData.get("valor_servicio")),
    valor_a_pagar: numNull(formData.get("valor_a_pagar")),
    orden_compra: s(formData.get("orden_compra")),
    estado,
    fecha_pago,
    archivo_url: s(formData.get("archivo_url")),
    costo_combustible: num(formData.get("costo_combustible")),
    costo_peajes: num(formData.get("costo_peajes")),
    costo_viaticos: num(formData.get("costo_viaticos")),
    costo_otros: num(formData.get("costo_otros")),
    notas: s(formData.get("notas")),
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const result = id
    ? await supabase.from("facturas").update(values).eq("id", id).select("id").single()
    : await supabase.from("facturas").insert(values).select("id").single();

  if (result.error) {
    return { error: `No se pudo guardar: ${result.error.message}` };
  }

  revalidatePath("/facturas");
  revalidatePath("/");
  redirect("/facturas");
}

// Cambia solo el estado de una factura (para registro rápido desde la lista).
export async function actualizarEstadoFactura(formData: FormData) {
  const id = sReq(formData.get("id"));
  const estadoRaw = sReq(formData.get("estado")) as FacturaEstado;
  const estado: FacturaEstado = ESTADOS.includes(estadoRaw)
    ? estadoRaw
    : "en_proceso";

  if (isDemo()) {
    revalidatePath("/facturas");
    return;
  }
  if (!id) return;

  const supabase = await createClient();
  const update: Record<string, unknown> = {
    estado,
    updated_at: new Date().toISOString(),
  };

  // Al marcar como pagada, registra la fecha de pago si aún no la tiene.
  if (estado === "pagada") {
    const { data: actual } = await supabase
      .from("facturas")
      .select("fecha_pago")
      .eq("id", id)
      .maybeSingle();
    if (!actual?.fecha_pago) {
      update.fecha_pago = new Date().toISOString().slice(0, 10);
    }
  }

  await supabase.from("facturas").update(update).eq("id", id);
  revalidatePath("/facturas");
  revalidatePath("/");
}

export async function eliminarFactura(formData: FormData) {
  if (isDemo()) redirect("/facturas");
  const id = sReq(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("facturas").delete().eq("id", id);
  revalidatePath("/facturas");
  revalidatePath("/");
  redirect("/facturas");
}
