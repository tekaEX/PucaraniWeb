"use client";

import { Fragment, useMemo, useState } from "react";
import { Car, ChevronDown, FileText, Sheet, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { buttonClass } from "@/components/ui/button";
import { TaxiPanel } from "./taxi-panel";
import { eliminarServicioTaxi } from "./actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { formatCLP, formatDate } from "@/lib/format";
import {
  taxiTipoLabel,
  taxiPideDescripcion,
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
  etiquetaPeriodo,
}: {
  servicios: ServicioTaxiConRelaciones[];
  clientes: { id: string; nombre: string }[];
  choferes: { id: string; nombre: string; licencia_vencimiento?: string | null }[];
  /** "abril 2026" — para decir de qué periodo no hay servicios. */
  etiquetaPeriodo: string;
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
  const vacio = visibles.length === 0;

  return (
    <div>
      {/* Cabecera de la tabla: de qué periodo son las filas y cuántas son —el
          contador del sistema anterior, que muestra "visibles / total" cuando
          hay un filtro puesto— y a la derecha el filtro por empresa. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold capitalize">{etiquetaPeriodo}</span>
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
            {filtro && visibles.length !== servicios.length
              ? `${visibles.length} / ${servicios.length}`
              : visibles.length}
          </span>
        </div>
        {empresas.length > 0 ? (
          <div className="flex items-center gap-2">
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
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
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Car className="mx-auto mb-2 h-8 w-8 text-muted/45" />
                  <p className="text-sm text-muted">
                    {filtro
                      ? `Sin servicios de ${filtro} en ${etiquetaPeriodo.toLowerCase()}.`
                      : `Sin servicios registrados en ${etiquetaPeriodo.toLowerCase()}.`}
                  </p>
                </td>
              </tr>
            ) : null}
            {visibles.map((s) => {
              const open = openId === s.id;
              return (
                <Fragment key={s.id}>
                  <tr
                    onClick={() => setOpenId(open ? null : s.id)}
                    className="cursor-pointer transition-colors hover:bg-brand-soft/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(s.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {taxiTipoLabel(s.tipo)}
                      </span>
                      {taxiPideDescripcion(s.tipo) && s.descripcion ? (
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
                    {/* Acciones de la fila, en el mismo orden que el sistema
                        anterior: el vale de ESE servicio y su eliminación. El
                        clic en la fila sigue abriendo la edición, que el
                        sistema viejo no tenía. */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`/api/taxis/vales?id=${s.id}`}
                          target="_blank"
                          rel="noopener"
                          title="Vale de este servicio (PDF)"
                          aria-label={`Vale del servicio del ${formatDate(s.fecha)}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-brand-soft hover:text-brand"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                        <ConfirmForm
                          action={eliminarServicioTaxi}
                          mensaje={`¿Eliminar el servicio del ${formatDate(s.fecha)}? Esta acción no se puede deshacer.`}
                        >
                          <input type="hidden" name="id" value={s.id} />
                          <button
                            type="submit"
                            title="Eliminar"
                            aria-label={`Eliminar el servicio del ${formatDate(s.fecha)}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-bg hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </ConfirmForm>
                        <ChevronDown
                          onClick={() => setOpenId(open ? null : s.id)}
                          className={`h-4 w-4 cursor-pointer text-muted transition-transform ${open ? "rotate-180" : ""}`}
                        />
                      </div>
                    </td>
                  </tr>

                  {open ? (
                    <tr>
                      <td colSpan={7} className="bg-background px-4 pb-5 pt-1">
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
        {/* Sin filas no hay nada que exportar: los botones se apagan en vez de
            llevar a una descarga que devuelve "sin servicios". */}
        <div className="flex items-center gap-2">
          <a
            href={vacio ? undefined : `/api/taxis/vales${q}`}
            target="_blank"
            rel="noopener"
            aria-disabled={vacio}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: vacio ? "pointer-events-none opacity-50" : undefined,
            })}
          >
            <FileText className="h-4 w-4" />
            Vales (PDF)
          </a>
          <a
            href={vacio ? undefined : `/api/taxis/excel${q}`}
            aria-disabled={vacio}
            className={buttonClass({
              variant: "outline",
              size: "sm",
              className: vacio ? "pointer-events-none opacity-50" : undefined,
            })}
          >
            <Sheet className="h-4 w-4" />
            Descargar Excel
          </a>
        </div>
      </div>
    </div>
  );
}
