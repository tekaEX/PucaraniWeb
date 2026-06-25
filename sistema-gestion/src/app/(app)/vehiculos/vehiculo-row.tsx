"use client";

import { useRouter } from "next/navigation";
import { Badge, VencimientoBadge } from "@/components/ui/badge";
import { formatNumber, formatCLP } from "@/lib/format";
import type { Vehiculo } from "@/types/db";

// Fila completa clickeable: navega a la ficha del vehículo al hacer clic.
export function VehiculoRow({ v, total }: { v: Vehiculo; total: number }) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(`/vehiculos/${v.id}`)}
      className="cursor-pointer transition-colors hover:bg-gray-100/60"
    >
      <td className="px-4 py-3">
        <span className="font-semibold text-brand">{v.patente}</span>
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
    </tr>
  );
}
