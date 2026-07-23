// Estado de cuenta por cliente (ex "Cobranzas"): tipos y helpers puros,
// seguros para usar tanto en cliente como en servidor. La agregación que
// depende del periodo global vive en cobranza-server.ts.
import type { FacturaConRelaciones } from "@/types/db";
import { hoyChile } from "@/lib/format";

export const DIAS_VENCE = 30;

export function diasDesde(fecha: string): number {
  // Anclado al día de Chile: en el servidor (UTC) la antigüedad no debe
  // adelantarse un día por la noche.
  const hoy = new Date(`${hoyChile()}T00:00:00`);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  d.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - d.getTime()) / 86400000);
}

export type ViajePendiente = {
  id: string;
  fecha_inicio: string;
  descripcion: string;
  valor: number;
};

// Viaje realizado sin factura, con su cliente (entrada a construirCuentas).
export type ViajePendRaw = ViajePendiente & {
  cliente: { id: string; nombre: string } | null;
  cliente_id: string;
};

// Servicio de taxi mínimo para la agregación por cliente.
export type TaxiIngreso = {
  cliente_id: string | null;
  fecha: string;
  monto: number;
};

export type CuentaCliente = {
  clienteId: string;
  nombre: string;
  pendienteFacturar: number;
  porCobrar: number;
  vencido: number;
  pagado: number;
  /** Ingresos por servicios de taxi del periodo (se cobran al momento). */
  taxis: number;
  facturas: FacturaConRelaciones[];
  viajesPendientes: ViajePendiente[];
};

export function cuentaVacia(clienteId: string, nombre: string): CuentaCliente {
  return {
    clienteId,
    nombre,
    pendienteFacturar: 0,
    porCobrar: 0,
    vencido: 0,
    pagado: 0,
    taxis: 0,
    facturas: [],
    viajesPendientes: [],
  };
}
