"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sReq, num, intNull } from "@/lib/form-helpers";
import { hoyChile } from "@/lib/format";

export type FormState = { error?: string; ok?: boolean };

// El porcentaje NO puede leerse con num(): ese helper borra los puntos para
// soportar el formato chileno de miles ("1.234.567"), y el <input type=
// "number" step="0.1"> del formulario envía "7.5" — que num() convertiría en
// 75. Un 7,5 % guardado como 75 % es diez veces el pago del conductor, todos
// los días, sin ningún aviso. Acá el punto SÍ es separador decimal.
function porcentaje(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Regla general (chofer_id null) por ahora — MVP de 1 conductor. Cada regla
// nueva queda "vigente desde hoy"; las anteriores se conservan para no
// alterar pagos ya calculados con ellas (ver encomienda_pagos.regla_id).
//
// Una regla tiene hasta tres componentes que se suman: un fijo por día
// trabajado (monto_dia, 0024), lo que corresponda por pedido entregado
// (tipo_pago + valor_pago) y un bono opcional al alcanzar una meta diaria.
export async function guardarReglaPago(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const tipo_pago = sReq(formData.get("tipo_pago"));
  if (!["porcentaje", "monto_fijo"].includes(tipo_pago)) {
    return { error: "Tipo de pago inválido." };
  }

  // El % admite decimales; el monto fijo por pedido son pesos con separador
  // de miles. Dos formatos distintos, dos parsers distintos.
  const valor_pago =
    tipo_pago === "porcentaje"
      ? porcentaje(formData.get("valor_pago"))
      : num(formData.get("valor_pago"));
  if (valor_pago < 0) return { error: "El valor de pago no puede ser negativo." };
  if (tipo_pago === "porcentaje" && valor_pago > 100) {
    return { error: "El porcentaje no puede superar 100." };
  }

  const monto_dia = intNull(formData.get("monto_dia")) ?? 0;
  if (monto_dia < 0) return { error: "El monto por día no puede ser negativo." };

  const meta_entregas_dia = intNull(formData.get("meta_entregas_dia"));
  const bono_monto = intNull(formData.get("bono_monto"));
  if ((meta_entregas_dia == null) !== (bono_monto == null)) {
    return { error: "Para el bono, completa tanto la meta de entregas como el monto." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("encomienda_reglas_pago").insert({
    tipo_pago,
    valor_pago,
    monto_dia,
    meta_entregas_dia,
    bono_monto,
    vigente_desde: hoyChile(),
  });
  if (error) return { error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/encomiendas/configuracion");
  return { ok: true };
}
