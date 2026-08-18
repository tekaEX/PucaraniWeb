// Viajes: lectura y validación de lo que manda el formulario.
//
// Las derivaciones del viaje en sí —costo total, utilidad, margen, si está por
// facturar— viven en types/db.ts junto a las demás, porque son propiedades del
// registro y las usa tanto la app como el resumen financiero. Acá está lo otro:
// convertir lo que llega del navegador en algo con forma.

import { VIAJE_ESTADOS, type ViajeEstado } from "@/types/db";

export type AsignacionInput = {
  chofer_id: string | null;
  vehiculo_id: string | null;
  fecha: string | null;
};

/**
 * Un viaje puede llevar N choferes y N vehículos —servicios multi-bus o de
 * varios días—, así que las asignaciones viajan como JSON en un campo oculto,
 * igual que las líneas de una cotización.
 *
 * Se descarta la asignación que no tiene NI chofer NI vehículo: no dice nada, y
 * el check de la base la rechazaría de todos modos. Pero se conserva la que
 * tiene solo uno de los dos: "este bus, chofer por confirmar" es un estado
 * real de la operación, no un error de carga.
 *
 * `fecha` null significa "todo el servicio"; con fecha, es el día puntual de un
 * servicio multi-día.
 */
export function parsearAsignaciones(raw: string | null | undefined): AsignacionInput[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const texto = (v: unknown): string | null =>
    typeof v === "string" && v !== "" ? v : null;

  return arr
    .map((a) => {
      const o = (a ?? {}) as Record<string, unknown>;
      return {
        chofer_id: texto(o.chofer_id),
        vehiculo_id: texto(o.vehiculo_id),
        fecha: texto(o.fecha),
      };
    })
    .filter((a) => a.chofer_id !== null || a.vehiculo_id !== null);
}

/**
 * Valida el estado que llega del formulario. Ante cualquier cosa rara,
 * "programado": es el estado que no afirma que el viaje ya ocurrió.
 *
 * La lista sale de VIAJE_ESTADOS, que es exhaustivo sobre ViajeEstado. Ver el
 * comentario de estadoCotizacion() en lib/cotizaciones.ts: una copia suelta se
 * desactualiza sin que nada avise.
 */
export function estadoViaje(raw: string | null | undefined): ViajeEstado {
  const valido = (Object.keys(VIAJE_ESTADOS) as ViajeEstado[]).includes(raw as ViajeEstado);
  return valido ? (raw as ViajeEstado) : "programado";
}
