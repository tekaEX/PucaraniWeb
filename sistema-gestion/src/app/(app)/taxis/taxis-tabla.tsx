"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, FileText, Sheet } from "lucide-react";
import { Select } from "@/components/ui/select";
import { buttonClass } from "@/components/ui/button";
import { TaxiPanel } from "./taxi-panel";
import { formatCLP, formatDate } from "@/lib/format";
import {
  TAXI_TIPOS,
  taxiNombreCliente,
  taxiNombreChofer,
  type ServicioTaxiConRelaciones,
} from "@/types/db";

// Lista de servicios del periodo con filtro por empresa. El filtro también
// alcanza a los botones Vales/Excel (exportan lo que se está viendo).
export function TaxisTabla({
  servicios,
  clientes,
  choferes,
}: {
  servicios: ServicioTaxiConRelaciones[];
  clientes: { id: string; nombre: string }[];
  choferes: { id: string; nombre: string }[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState(""); // nombre de empresa ("" = todas)

  // Empresas presentes en el periodo (incluye nombres sin match de la importación).
  const empresas = useMemo(() => {
    const set = new Set<string>();
    for (const s of servicios) {
      const n = taxiNombreCliente(s);
      if (n) set.add(n);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [servicios]);

  const visibles = filtro
    ? servicios.filter((s) => taxiNombreCliente(s) === filtro)
    : servicios;
  const total = visibles.reduce((a, s) => a + Number(s.monto), 0);

  const q = filtro ? `?cliente=${encodeURIComponent(filtro)}` : "";

  return (
    <div>
      {empresas.length > 0 ? (
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Empresa
          </span>
          <Select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="h-9 w-56"
          >
            <option value="">Todas</option>
            {empresas.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Chofer</th>
              <th className="px-4 py-3 font-medium">Pasajero</th>
              <th className="px-4 py-3 text-right font-medium">Monto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibles.map((s) => {
              const open = openId === s.id;
              return (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setOpenId(open ? null : s.id)}
                    className="cursor-pointer transition-colors hover:bg-gray-100/60"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(s.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {TAXI_TIPOS[s.tipo].label}
                      </span>
                      {s.tipo === "especial" && s.descripcion ? (
                        <span className="block text-xs text-muted">{s.descripcion}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {taxiNombreCliente(s) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{taxiNombreChofer(s) ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{s.pasajero ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatCLP(Number(s.monto))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronDown
                        className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </td>
                  </tr>

                  {open ? (
                    <tr>
                      <td colSpan={7} className="bg-gray-50/40 px-4 pb-5 pt-1">
                        <div className="animate-expand">
                          <TaxiPanel servicio={s} clientes={clientes} choferes={choferes} />
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-sm">
          <span className="text-muted">Total{filtro ? ` · ${filtro}` : ""}: </span>
          <span className="font-semibold tabular-nums">{formatCLP(total)}</span>
          <span className="ml-2 text-xs text-muted">
            {visibles.length} servicio{visibles.length === 1 ? "" : "s"}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <a
            href={`/api/taxis/vales${q}`}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <FileText className="h-4 w-4" />
            Vales (PDF)
          </a>
          <a
            href={`/api/taxis/excel${q}`}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <Sheet className="h-4 w-4" />
            Descargar Excel
          </a>
        </div>
      </div>
    </div>
  );
}
