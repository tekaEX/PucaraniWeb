// Cálculo de ingresos y de lo que se le debe al conductor. Funciones puras,
// en un archivo SIN "use server" (ver la nota de ./actions.ts: un módulo
// "use server" solo puede exportar funciones async).
//
// Una sola implementación para los dos usos: el panel del periodo la corre AL
// VUELO sobre cada día (para poder decir "esto es lo que hay que pagar este
// mes" sin que nadie haya apretado nada), y calcularPagoChofer la corre para
// PERSISTIR el snapshot en encomienda_pagos. Si fueran dos cuentas separadas,
// la proyección y lo confirmado divergirían sin que nadie se entere.

import { VALOR_APROXIMADO_PEDIDO } from "./config";
import type { EncomiendaActividadTipo, EncomiendaReglaPago } from "@/types/db";

/** Cómo cerró el día un conductor. Sale de contar los eventos que el teléfono
 *  registró en encomienda_actividad para ese (chofer, fecha) — ver 0026.
 *
 *  Ya no existe un "sinCerrar": las paradas que el conductor no llegó a cerrar
 *  viven en su teléfono y nunca se envían, así que el servidor no las conoce.
 *  Para la liquidación es irrelevante (nunca se pagaron), y para el panel era un
 *  dato que solo aparecía si la ruta estaba en la base. */
export type ConteoDia = {
  entregados: number;
  omitidos: number;
};

// Ingreso ESTIMADO, no real: Starken maneja el valor de cada envío en su
// propio sistema y Pucarani nunca lo conoce (ver la 0021).
export function ingresoEstimado(entregados: number): number {
  return entregados * VALOR_APROXIMADO_PEDIDO;
}

// Ya no hay una función "diaTrabajado". Antes hacía falta porque una ruta podía
// existir en la base sin que el conductor hubiera salido (la app la generaba
// sola al abrirla), así que había que deducir el día trabajado del estado de la
// ruta — con todo el enredo que documenta la 0025.
//
// Con la actividad en eventos la pregunta desaparece: una fila en
// encomienda_actividad SOLO existe si el conductor hizo algo en terreno, aunque
// haya sido nada más que llamar. Si no salió, no hay filas y ese (chofer, fecha)
// simplemente no aparece. Así que todo lo que llega hasta acá es un día
// trabajado, por definición.

// Regla que corresponde a (chofer, fecha). Precedencia: un override del
// propio chofer gana sobre la regla general aunque sea más antiguo (así lo
// documenta la 0017). Dentro de cada grupo manda la más nueva, y ante empate
// de vigente_desde desempata created_at — sin ese segundo criterio, guardar
// dos reglas el mismo día hace que Postgres devuelva cualquiera de las dos y
// el pago salga distinto en cada recálculo.
export function reglaVigente(
  reglas: EncomiendaReglaPago[],
  choferId: string | null,
  fecha: string,
): EncomiendaReglaPago | null {
  // Comparación de strings a secas, no localeCompare: la colación ICU ordena
  // los símbolos de forma distinta a ASCII y PostgREST omite los microsegundos
  // cuando son exactamente 0, así que "…T14:23:05+00:00" se declaraba MÁS
  // NUEVO que "…T14:23:05.000001+00:00" y el desempate elegía la regla vieja.
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
  const masNueva = (a: EncomiendaReglaPago, b: EncomiendaReglaPago) =>
    desc(a.vigente_desde, b.vigente_desde) || desc(a.created_at, b.created_at);

  const aplicables = reglas.filter((r) => r.vigente_desde <= fecha);
  const delChofer = choferId
    ? aplicables.filter((r) => r.chofer_id === choferId).sort(masNueva)
    : [];
  if (delChofer.length > 0) return delChofer[0];

  return aplicables.filter((r) => r.chofer_id == null).sort(masNueva)[0] ?? null;
}

export type PagoDesglose = {
  /** Por cantidad de pedidos entregados. */
  base: number;
  /** Fijo por el día trabajado. */
  dia: number;
  /** Bono por alcanzar la meta de entregas del día. */
  bono: number;
  total: number;
};

export const PAGO_CERO: PagoDesglose = { base: 0, dia: 0, bono: 0, total: 0 };

// Solo se llama para un (chofer, fecha) que tiene actividad registrada: eso es
// lo que hace que el fijo diario se pague sin condición acá (ver la nota de
// arriba sobre diaTrabajado).
export function calcularPagoDia(
  conteo: ConteoDia,
  regla: EncomiendaReglaPago | null,
): PagoDesglose {
  if (!regla) return PAGO_CERO;

  // valor_pago es numeric: PostgREST lo devuelve como string ("15.00").
  const valor = Number(regla.valor_pago);
  const base =
    regla.tipo_pago === "porcentaje"
      ? Math.round((ingresoEstimado(conteo.entregados) * valor) / 100)
      : Math.round(conteo.entregados * valor);

  const dia = Number(regla.monto_dia ?? 0);

  // >= y no >: alcanzar la meta ya paga el bono (el texto de la pantalla de
  // reglas dice lo mismo).
  const bono =
    regla.meta_entregas_dia != null && conteo.entregados >= regla.meta_entregas_dia
      ? Number(regla.bono_monto ?? 0)
      : 0;

  return { base, dia, bono, total: base + dia + bono };
}

/** Cuenta los eventos de un (chofer, fecha). Los de tipo "llamada" no suman ni
 *  restan: están para probar que el conductor salió, y eso ya lo dice el hecho
 *  de que exista aunque sea una fila. */
export function contarActividad(eventos: { tipo: EncomiendaActividadTipo }[]): ConteoDia {
  return {
    entregados: eventos.filter((e) => e.tipo === "entrega").length,
    omitidos: eventos.filter((e) => e.tipo === "omision").length,
  };
}

export type EventoActividad = {
  chofer_id: string | null;
  fecha: string;
  tipo: EncomiendaActividadTipo;
};

export type DiaActividad<T extends EventoActividad> = {
  /** null si el conductor fue eliminado después (la FK es on delete set null,
   *  ver 0026): el día se sigue viendo, pero no se puede liquidar. */
  choferId: string | null;
  fecha: string;
  conteo: ConteoDia;
  /** Los eventos crudos del día, para las pantallas que muestran horas. */
  eventos: T[];
};

// Agrupa los eventos por (conductor, día), más nuevo primero. Solo aparecen los
// pares que tienen al menos un evento — y eso ES la definición de día
// trabajado, así que todo lo que sale de acá se paga.
//
// Una sola implementación para el panel del periodo, la vista del día y la
// confirmación de pagos: si cada uno agrupara a su manera, la proyección y lo
// confirmado podrían no coincidir sin que nadie se entere.
export function agruparPorDia<T extends EventoActividad>(eventos: T[]): DiaActividad<T>[] {
  const mapa = new Map<string, DiaActividad<T>>();

  for (const evento of eventos) {
    const clave = `${evento.fecha}|${evento.chofer_id ?? ""}`;
    let dia = mapa.get(clave);
    if (!dia) {
      dia = {
        choferId: evento.chofer_id,
        fecha: evento.fecha,
        conteo: { entregados: 0, omitidos: 0 },
        eventos: [],
      };
      mapa.set(clave, dia);
    }
    dia.eventos.push(evento);
    if (evento.tipo === "entrega") dia.conteo.entregados++;
    if (evento.tipo === "omision") dia.conteo.omitidos++;
  }

  return [...mapa.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}
