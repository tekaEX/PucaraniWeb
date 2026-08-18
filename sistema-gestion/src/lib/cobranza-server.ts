// Agregación del estado de cuenta por cliente. Depende del periodo global
// (lib/periodo usa next/headers), así que es solo-servidor.
import "server-only";
import { facturaEstadoDerivado, type FacturaConRelaciones } from "@/types/db";
import { enRango, type Periodo } from "@/lib/periodo";
import {
  DIAS_VENCE,
  diasDesde,
  cuentaVacia,
  type CuentaCliente,
  type TaxiIngreso,
  type ViajePendRaw,
} from "@/lib/cobranza";

// Construye el estado de cuenta por cliente respetando el periodo global:
// pagadas por fecha de pago, emitidas/anuladas por fecha de emisión; los
// borradores y viajes sin facturar se muestran siempre (trabajo pendiente).
// Los servicios de taxi del periodo suman como ingreso del cliente (se cobran
// al momento; nunca pasan por facturas).
export function construirCuentas(
  facturas: FacturaConRelaciones[],
  viajesPend: ViajePendRaw[],
  periodo: Periodo,
  taxis: TaxiIngreso[] = [],
): Map<string, CuentaCliente> {
  const map = new Map<string, CuentaCliente>();
  const entrada = (key: string, nombre: string) => {
    if (!map.has(key)) map.set(key, cuentaVacia(key, nombre));
    return map.get(key)!;
  };

  for (const v of viajesPend) {
    if (!enRango(v.fecha_inicio, periodo)) continue;
    const a = entrada(v.cliente?.id ?? v.cliente_id, v.cliente?.nombre ?? "Sin cliente");
    a.viajesPendientes.push(v);
    a.pendienteFacturar += Number(v.valor);
  }

  const facturasPeriodo = facturas.filter((f) => {
    const derivado = facturaEstadoDerivado(f);
    if (derivado === "pagada") return enRango(f.fecha_pago, periodo);
    if (derivado === "por_cobrar" || derivado === "anulada")
      return enRango(f.fecha_emision, periodo);
    return true; // borradores
  });

  for (const f of facturasPeriodo) {
    const a = entrada(f.cliente?.id ?? "sin-cliente", f.cliente?.nombre ?? "Sin cliente");
    a.facturas.push(f);
    const derivado = facturaEstadoDerivado(f);
    const monto = Number(f.total);
    if (derivado === "pagada") a.pagado += monto;
    else if (derivado === "por_cobrar") {
      a.porCobrar += monto;
      if (f.fecha_emision && diasDesde(f.fecha_emision) > DIAS_VENCE) a.vencido += monto;
    } else if (derivado === "borrador") {
      a.pendienteFacturar += monto;
    }
  }

  // Taxis del periodo: solo los que tienen cliente asociado (los particulares
  // no pertenecen a ninguna cuenta).
  for (const t of taxis) {
    if (!t.cliente_id || !enRango(t.fecha, periodo)) continue;
    const cuenta = map.get(t.cliente_id);
    if (cuenta) cuenta.taxis += Number(t.monto);
    else {
      const nueva = cuentaVacia(t.cliente_id, "");
      nueva.taxis = Number(t.monto);
      map.set(t.cliente_id, nueva);
    }
  }

  return map;
}
