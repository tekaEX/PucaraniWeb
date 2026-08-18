// Facturas: las reglas del DOCUMENTO tributario.
//
// El estado de cuenta —por cobrar, vencido, pagado— vive en cobranza.ts, y los
// estados derivados en types/db.ts. Acá está lo otro: qué hace falta para que
// una factura sea válida antes de intentar guardarla.
//
// Las mismas reglas están como CHECK en la tabla (migración 0006), y eso está
// bien: la base es la que garantiza que el dato no se corrompa. Pero un CHECK
// violado llega como un mensaje de Postgres, y "new row for relation
// \"facturas\" violates check constraint \"facturas_check\"" no le dice nada a
// quien está facturando. Estas funciones existen para llegar antes con un
// mensaje en castellano.

import {
  FACTURA_ESTADOS,
  TIPOS_DTE,
  type FacturaEstado,
} from "@/types/db";
import { desglosarTotal, type Totales } from "@/lib/totales";

/** Solo el DTE 33 (factura afecta) lleva IVA. La 34 es exenta y la base lo
 *  exige con un check; 56 y 61 son notas y acá se tratan como exentas. */
export const DTE_AFECTO = 33;

export function estadoFactura(raw: string | null | undefined): FacturaEstado {
  const valido = (Object.keys(FACTURA_ESTADOS) as FacturaEstado[]).includes(
    raw as FacturaEstado,
  );
  return valido ? (raw as FacturaEstado) : "borrador";
}

/** Tipo de documento válido; ante cualquier cosa, 34 (exenta), que es el que
 *  no compromete IVA. */
export function tipoDte(raw: number | null | undefined): number {
  const validos = Object.keys(TIPOS_DTE).map(Number);
  return raw !== null && raw !== undefined && validos.includes(raw) ? raw : 34;
}

/**
 * Los montos que se GUARDAN, calculados en el servidor.
 *
 * El formulario ya los calcula para mostrarlos mientras el usuario tipea, y los
 * manda en campos ocultos. Pero una Server Action es un endpoint POST público
 * —la propia guía de Next lo dice— así que lo que llega en esos campos es una
 * sugerencia, no un dato. Acá se recalcula desde el total y el tipo de
 * documento, que sí son entrada del usuario.
 *
 * No es que sin esto se corrompan los datos: la tabla tiene
 * `check (total = neto + iva)` y `check (tipo_dte <> 34 or iva = 0)`, así que
 * Postgres rechazaría cualquier combinación imposible. Lo que se evita es que
 * el usuario se coma ese rechazo por algo que la app podía calcular sola —por
 * ejemplo si cambia el tipo de documento y el campo oculto todavía tiene el
 * desglose viejo.
 */
export function montosFactura(total: number, tipo: number): Totales {
  return desglosarTotal(total, tipo === DTE_AFECTO);
}

export type FacturaAValidar = {
  cliente_id: string | null;
  estado: FacturaEstado;
  folio: number | null;
  fecha_emision: string | null;
  fecha_pago: string | null;
};

/**
 * Devuelve el primer problema en castellano, o `null` si la factura se puede
 * guardar. El orden importa: se avisa primero lo que el usuario tiene que
 * completar y después lo que tiene que corregir.
 */
export function validarFactura(f: FacturaAValidar): string | null {
  if (!f.cliente_id) {
    return "La factura debe tener un cliente (receptor).";
  }
  // Una factura emitida es un documento que existe ante el SII: sin folio ni
  // fecha no se puede referenciar, ni cobrar, ni anular.
  if (f.estado === "emitida" && (!f.folio || !f.fecha_emision)) {
    return "Para marcarla como emitida indica el folio y la fecha de emisión.";
  }
  // Un borrador todavía no se le mandó a nadie: no puede estar pagado.
  if (f.fecha_pago && f.estado === "borrador") {
    return "Un borrador no puede tener fecha de pago: emite la factura primero.";
  }
  return null;
}

/** Los viajes incluidos viajan como JSON desde el formulario. */
export function parsearViajeIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string" && x !== "") : [];
  } catch {
    return [];
  }
}

/**
 * Traduce los errores de las restricciones de la base a algo legible. Queda
 * como última red: si una regla nueva aparece primero como CHECK y todavía no
 * está acá arriba, el usuario igual ve algo entendible.
 */
export function mensajeErrorFactura(msg: string): string {
  if (msg.includes("facturas_folio_unico")) {
    return "Ya existe una factura con ese folio y tipo de documento.";
  }
  if (msg.includes("estado") && msg.includes("emitida")) {
    return "Una factura emitida necesita folio y fecha de emisión.";
  }
  return msg;
}
