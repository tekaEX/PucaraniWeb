"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sesionActual } from "@/lib/auth";
import {
  agruparPorDia,
  calcularPagoDia,
  ingresoEstimado,
  reglaVigente,
  type DiaActividad,
  type EventoActividad,
} from "@/lib/encomiendas/pago";
import type { EncomiendaReglaPago } from "@/types/db";

// Acá solo vive lo exclusivamente admin: confirmar pagos. La carga de pedidos y
// el armado de la ruta ya no pasan por el servidor — viven en el teléfono del
// conductor (ver lib/encomiendas/local y la cabecera de la migración 0026).

export type FormState = { error?: string; ok?: boolean };

// Las Server Actions son endpoints POST de la ruta donde se usan: cualquiera
// con sesión puede invocarlas, el proxy no las filtra. RLS ya frena la
// escritura de encomienda_pagos a admin/operador, pero un DELETE/UPDATE
// bloqueado por RLS devuelve "0 filas, sin error" y la acción respondería
// {ok:true} sin haber hecho nada. Mejor decirlo de frente.
async function puedeConfirmarPagos(): Promise<boolean> {
  const sesion = await sesionActual();
  return sesion?.rol === "admin" || sesion?.rol === "operador";
}

const SELECT_ACTIVIDAD = "chofer_id, fecha, tipo";

async function leerReglas(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("encomienda_reglas_pago").select("*");
  return (data ?? []) as EncomiendaReglaPago[];
}

// Arma la fila de encomienda_pagos de un día. Es un SNAPSHOT auditable
// (guarda regla_id y calculado_en): si la regla cambia después, lo ya
// confirmado NO se recalcula solo. El panel muestra en paralelo el cálculo al
// vuelo, así que una diferencia entre ambos queda a la vista.
// Devuelve null si el día no se puede liquidar (sin conductor o sin regla).
//
// Ya no hace falta preguntar si el día "cuenta como trabajado": un día llega
// hasta acá solo si tiene actividad registrada (ver agruparPorDia).
function filaPago(
  dia: DiaActividad<EventoActividad>,
  reglas: EncomiendaReglaPago[],
  ahora: string,
) {
  if (!dia.choferId) return null;
  const regla = reglaVigente(reglas, dia.choferId, dia.fecha);
  if (!regla) return null;

  const pago = calcularPagoDia(dia.conteo, regla);

  // pago_total no va: es una columna generada (0017/0024).
  return {
    chofer_id: dia.choferId,
    fecha: dia.fecha,
    pedidos_entregados: dia.conteo.entregados,
    pedidos_no_entregados: dia.conteo.omitidos,
    ingresos_totales: ingresoEstimado(dia.conteo.entregados),
    pago_base: pago.base,
    pago_dia: pago.dia,
    pago_bono: pago.bono,
    regla_id: regla.id,
    calculado_en: ahora,
  };
}

/** Confirma (o recalcula) el pago de un día concreto para un conductor. */
export async function calcularPagoChofer(choferId: string, fecha: string): Promise<FormState> {
  if (!(await puedeConfirmarPagos())) {
    return { error: "No tienes permiso para confirmar pagos." };
  }

  const supabase = await createClient();

  const { data, error: errActividad } = await supabase
    .from("encomienda_actividad")
    .select(SELECT_ACTIVIDAD)
    .eq("chofer_id", choferId)
    .eq("fecha", fecha)
    .returns<EventoActividad[]>();
  if (errActividad) {
    return { error: `No se pudo leer la actividad: ${errActividad.message}` };
  }

  const dias = agruparPorDia(data ?? []);
  if (dias.length === 0) {
    return { error: "Ese conductor no registró actividad en esa fecha." };
  }

  const fila = filaPago(dias[0], await leerReglas(supabase), new Date().toISOString());
  if (!fila) {
    return { error: "No hay ninguna regla de pago vigente a esa fecha. Configúrala primero." };
  }

  const { error } = await supabase
    .from("encomienda_pagos")
    .upsert(fila, { onConflict: "chofer_id,fecha" });
  if (error) return { error: `No se pudo guardar el pago: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");
  return { ok: true };
}

// Confirma de una pasada todos los días del periodo que se está mirando. Sin
// esto, dejar la liquidación del mes registrada obliga a entrar día por día y
// apretar "Confirmar" treinta veces.
export async function confirmarPagosPeriodo(
  desde: string,
  hasta: string,
): Promise<FormState> {
  if (!(await puedeConfirmarPagos())) {
    return { error: "No tienes permiso para confirmar pagos." };
  }

  const supabase = await createClient();

  const { data, error: errActividad } = await supabase
    .from("encomienda_actividad")
    .select(SELECT_ACTIVIDAD)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .returns<EventoActividad[]>();
  if (errActividad) {
    return { error: `No se pudo leer la actividad: ${errActividad.message}` };
  }

  const dias = agruparPorDia(data ?? []);
  if (dias.length === 0) {
    return { error: "No hay días con actividad para confirmar en este periodo." };
  }

  const reglas = await leerReglas(supabase);
  const ahora = new Date().toISOString();
  const filas = dias.map((d) => filaPago(d, reglas, ahora)).filter((f) => f != null);

  // Un solo upsert con todas las filas, no una por día: así el mes se
  // confirma entero o no se confirma nada. Antes, un día sin regla vigente
  // cortaba el bucle a la mitad y dejaba medio periodo grabado y medio no,
  // sin manera de saber cuál era cuál.
  if (filas.length === 0) {
    return { error: "No hay ninguna regla de pago vigente para esos días. Configúrala primero." };
  }
  const { error } = await supabase
    .from("encomienda_pagos")
    .upsert(filas, { onConflict: "chofer_id,fecha" });
  if (error) return { error: `No se pudieron guardar los pagos: ${error.message}` };

  revalidatePath("/encomiendas");
  revalidatePath("/encomiendas/dia");

  const omitidos = dias.length - filas.length;
  return omitidos > 0
    ? {
        error: `Se confirmaron ${filas.length} día(s). Quedaron ${omitidos} sin liquidar por no haber una regla de pago vigente a esa fecha (o por conductor eliminado).`,
      }
    : { ok: true };
}
