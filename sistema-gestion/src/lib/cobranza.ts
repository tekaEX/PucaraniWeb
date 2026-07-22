// Estado de cuenta por cliente (ex "Cobranzas"): tipos y helpers puros,
// seguros para usar tanto en cliente como en servidor. La agregación que
// depende del periodo global vive en cobranza-server.ts.
import type { FacturaConRelaciones } from "@/types/db";

export const DIAS_VENCE = 30;

export function diasDesde(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
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

export type CuentaCliente = {
  clienteId: string;
  nombre: string;
  pendienteFacturar: number;
  porCobrar: number;
  vencido: number;
  pagado: number;
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
    facturas: [],
    viajesPendientes: [],
  };
}
