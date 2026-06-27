"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, VencimientoBadge } from "@/components/ui/badge";
import { formatNumber, formatCLP } from "@/lib/format";
import { VehiculoPanel } from "./vehiculo-panel";
import type { Vehiculo, GastoVehiculo } from "@/types/db";

export function VehiculoAccordion({
  vehiculos,
  gastos,
}: {
  vehiculos: Vehiculo[];
  gastos: GastoVehiculo[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const porVehiculo = useMemo(() => {
    const m = new Map<string, GastoVehiculo[]>();
    for (const g of gastos) {
      if (!g.vehiculo_id) continue;
      const arr = m.get(g.vehiculo_id) ?? [];
      arr.push(g);
      m.set(g.vehiculo_id, arr);
    }
    return m;
  }, [gastos]);

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Patente</th>
          <th className="px-4 py-3 font-medium">Vehículo</th>
          <th className="px-4 py-3 font-medium text-center">Cap.</th>
          <th className="px-4 py-3 font-medium">Rev. técnica</th>
          <th className="px-4 py-3 font-medium">SOAP</th>
          <th className="px-4 py-3 font-medium">Permiso circ.</th>
          <th className="px-4 py-3 font-medium text-right">Gastos</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {vehiculos.map((v) => {
          const open = openId === v.id;
          const vGastos = porVehiculo.get(v.id) ?? [];
          const total = vGastos.reduce((a, g) => a + Number(g.monto_total), 0);
          return (
            <Fragment key={v.id}>
              <tr
                onClick={() => setOpenId(open ? null : v.id)}
                className="cursor-pointer transition-colors hover:bg-gray-100/60"
              >
                <td className="px-4 py-3">
                  <span className="font-semibold text-foreground">{v.patente}</span>
                  {!v.activo ? (
                    <Badge tone="gray" className="ml-2">
                      Inactivo
                    </Badge>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted">
                  {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                  {v.anio ? ` (${v.anio})` : ""}
                  {v.km_actual != null ? ` · ${formatNumber(v.km_actual)} km` : ""}
                </td>
                <td className="px-4 py-3 text-center">{v.capacidad ?? "—"}</td>
                <td className="px-4 py-3">
                  <VencimientoBadge fecha={v.revision_tecnica_venc} />
                </td>
                <td className="px-4 py-3">
                  <VencimientoBadge fecha={v.soap_venc} />
                </td>
                <td className="px-4 py-3">
                  <VencimientoBadge fecha={v.permiso_circulacion_venc} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {total ? formatCLP(total) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={8} className="bg-gray-50/50 px-4 py-5">
                    <VehiculoPanel vehiculo={v} gastos={vGastos} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
