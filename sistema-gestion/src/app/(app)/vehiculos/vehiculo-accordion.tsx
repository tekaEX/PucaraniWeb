"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, VencimientoBadge, type Tone } from "@/components/ui/badge";
import { formatNumber, formatCLP } from "@/lib/format";
import { DOCS_VEHICULO } from "@/lib/vencimientos";
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
};

// Patente, vehículo, categoría, capacidad + un documento cada uno + gastos y
// la flecha. Derivado para que agregar un documento no descuadre las filas que
// ocupan el ancho completo.
const COLUMNAS = 6 + DOCS_VEHICULO.length;

// La categoría es una ETIQUETA, no un filtro (decisión del dueño): dice dónde
// se ocupa el vehículo y nada más. Las pestañas Todos/Operación/Taxis/Sin
// categoría que partían esta lista en cuatro se sacaron — con siete vehículos,
// filtrarlos escondía flota sin ahorrar nada.
//
// Hasta que se corra la migración 0042 la base todavía acepta 'encomiendas'
// (migración 0016) y hay una fila con ese valor: no tiene entrada en
// VEHICULO_CATEGORIAS y leerla a ciegas rompería el Badge al buscar el tono.
// Se muestra el valor crudo en gris.
function esCategoriaConocida(c: string): c is VehiculoCategoria {
  return c in VEHICULO_CATEGORIAS;
}

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
      <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Patente</th>
          <th className="px-4 py-3 font-medium">Vehículo</th>
          <th className="px-4 py-3 font-medium">Categoría</th>
          <th className="px-4 py-3 font-medium text-center">Cap.</th>
          {/* Una columna por documento, desde la lista de lib/vencimientos.ts:
              agregar un papel obligatorio no debería ser editar cuatro
              archivos hasta que todos coincidan. */}
          {DOCS_VEHICULO.map((d) => (
            <th key={d.campo} className="px-4 py-3 font-medium">
              {d.corto}
            </th>
          ))}
          <th className="px-4 py-3 font-medium text-right">Gastos</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      {/* La lista vacía la resuelve la página con su tarjeta de "aún no hay
          vehículos": acá ya no hay filtro que pueda dejarla en cero. */}
      <tbody className="divide-y divide-border">
        {vehiculos.map((v) => {
          const open = openId === v.patente;
          const vGastos = porVehiculo.get(v.patente) ?? [];
          const total = vGastos.reduce((a, g) => a + Number(g.monto_total), 0);
          return (
            <Fragment key={v.patente}>
              <tr
                onClick={() => setOpenId(open ? null : v.patente)}
                className="cursor-pointer transition-colors hover:bg-brand-soft/50"
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
                  {!v.categoria ? (
                    <span className="text-xs text-muted">Sin categoría</span>
                  ) : esCategoriaConocida(v.categoria) ? (
                    <Badge tone={categoriaTone[v.categoria]}>
                      {VEHICULO_CATEGORIAS[v.categoria]}
                    </Badge>
                  ) : (
                    <Badge tone="gray">{v.categoria}</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-center">{v.capacidad ?? "—"}</td>
                {DOCS_VEHICULO.map((d) => (
                  <td key={d.campo} className="px-4 py-3">
                    <VencimientoBadge fecha={v[d.campo] as string | null} />
                  </td>
                ))}
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
                  <td colSpan={COLUMNAS} className="bg-background px-4 py-5">
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
  );
}
