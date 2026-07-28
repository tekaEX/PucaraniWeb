"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, VencimientoBadge, type Tone } from "@/components/ui/badge";
import { formatNumber, formatCLP } from "@/lib/format";
import { VehiculoPanel } from "./vehiculo-panel";
import {
  VEHICULO_CATEGORIAS,
  type Vehiculo,
  type VehiculoCategoria,
  type GastoVehiculo,
} from "@/types/db";

const categoriaTone: Record<VehiculoCategoria, Tone> = {
  operacion: "blue",
  taxis: "amber",
  encomiendas: "violet",
};

type Pestana = "todos" | VehiculoCategoria | "sin_categoria";

const PESTANAS: { value: Pestana; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "operacion", label: VEHICULO_CATEGORIAS.operacion },
  { value: "taxis", label: VEHICULO_CATEGORIAS.taxis },
  { value: "encomiendas", label: VEHICULO_CATEGORIAS.encomiendas },
  { value: "sin_categoria", label: "Sin categoría" },
];

export function VehiculoAccordion({
  vehiculos,
  gastos,
}: {
  vehiculos: Vehiculo[];
  gastos: GastoVehiculo[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("todos");

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

  const visibles = useMemo(() => {
    if (pestana === "todos") return vehiculos;
    if (pestana === "sin_categoria") return vehiculos.filter((v) => !v.categoria);
    return vehiculos.filter((v) => v.categoria === pestana);
  }, [vehiculos, pestana]);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 border-b border-border bg-gray-50 px-4 py-2.5">
        {PESTANAS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPestana(p.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              pestana === p.value
                ? "bg-brand text-brand-foreground"
                : "bg-white text-muted hover:bg-gray-100"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Patente</th>
          <th className="px-4 py-3 font-medium">Vehículo</th>
          <th className="px-4 py-3 font-medium">Categoría</th>
          <th className="px-4 py-3 font-medium text-center">Cap.</th>
          <th className="px-4 py-3 font-medium">Rev. técnica</th>
          <th className="px-4 py-3 font-medium">SOAP</th>
          <th className="px-4 py-3 font-medium">Permiso circ.</th>
          <th className="px-4 py-3 font-medium text-right">Gastos</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {visibles.length === 0 ? (
          <tr>
            <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted">
              Ningún vehículo en esta categoría.
            </td>
          </tr>
        ) : null}
        {visibles.map((v) => {
          const open = openId === v.patente;
          const vGastos = porVehiculo.get(v.patente) ?? [];
          const total = vGastos.reduce((a, g) => a + Number(g.monto_total), 0);
          return (
            <Fragment key={v.patente}>
              <tr
                onClick={() => setOpenId(open ? null : v.patente)}
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
                <td className="px-4 py-3">
                  {v.categoria ? (
                    <Badge tone={categoriaTone[v.categoria]}>
                      {VEHICULO_CATEGORIAS[v.categoria]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted">Sin categoría</span>
                  )}
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
                  <td colSpan={9} className="bg-gray-50/50 px-4 py-5">
                    <div className="animate-expand">
                      <VehiculoPanel vehiculo={v} gastos={vGastos} />
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
