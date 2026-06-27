"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Paperclip, Trash2 } from "lucide-react";
import { EstadoFacturaSelect } from "./estado-select";
import { FacturaForm } from "./factura-form";
import { guardarFactura, eliminarFactura } from "./actions";
import { formatCLP, formatDate } from "@/lib/format";
import type { FacturaConRelaciones, FacturaEstado } from "@/types/db";

type ClienteOpt = { id: string; nombre: string; codigo: string | null };
type CotizacionOpt = {
  id: string;
  numero: number;
  cliente_id: string | null;
  total: number;
};
type ChoferOpt = { id: string; nombre: string };
type VehiculoOpt = { id: string; patente: string };

function rowTone(estado: FacturaEstado) {
  if (estado === "pagada") return "bg-green-50";
  if (estado === "facturada") return "bg-amber-50";
  return "";
}

export function FacturaAccordion({
  facturas,
  clientes,
  cotizaciones,
  choferes,
  vehiculos,
}: {
  facturas: FacturaConRelaciones[];
  clientes: ClienteOpt[];
  cotizaciones: CotizacionOpt[];
  choferes: ChoferOpt[];
  vehiculos: VehiculoOpt[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const totalAPagar = useMemo(
    () =>
      facturas.reduce(
        (acc, f) => acc + Number(f.valor_a_pagar ?? f.valor_servicio),
        0,
      ),
    [facturas],
  );

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-3 py-3 font-medium">Fecha</th>
          <th className="px-3 py-3 font-medium">Descripción</th>
          <th className="px-3 py-3 font-medium">Cliente</th>
          <th className="px-3 py-3 font-medium text-center">Buses</th>
          <th className="px-3 py-3 font-medium text-right">Valor</th>
          <th className="px-3 py-3 font-medium text-right">A pagar</th>
          <th className="px-3 py-3 font-medium">OC</th>
          <th className="px-3 py-3 font-medium">Coti</th>
          <th className="px-3 py-3 font-medium">N° Fact.</th>
          <th className="px-3 py-3 font-medium">Estado</th>
          <th className="px-3 py-3 font-medium"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {facturas.map((f) => {
          const open = openId === f.id;
          return (
            <Fragment key={f.id}>
              <tr className={`${rowTone(f.estado)} ${open ? "bg-gray-100/60" : ""}`}>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {formatDate(f.fecha)}
                </td>
                <td className="max-w-48 px-3 py-2.5">
                  <button
                    onClick={() => setOpenId(open ? null : f.id)}
                    className="inline-flex max-w-full items-center gap-1.5 text-left font-medium text-brand hover:underline"
                  >
                    <span className="truncate">{f.descripcion ?? "—"}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {f.cliente?.codigo?.toUpperCase() ?? f.cliente?.nombre ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums">
                  {f.n_buses ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatCLP(f.valor_servicio)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                  {f.valor_a_pagar != null ? formatCLP(f.valor_a_pagar) : "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {f.orden_compra ?? "—"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {f.cotizacion ? (
                    <Link
                      href={`/cotizaciones/${f.cotizacion.id}`}
                      className="text-brand hover:underline"
                    >
                      {f.cotizacion.numero}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{f.numero ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <EstadoFacturaSelect id={f.id} estado={f.estado} />
                </td>
                <td className="px-3 py-2.5">
                  {f.archivo_url ? (
                    <a
                      href={f.archivo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver adjunto"
                      className="text-muted hover:text-brand"
                    >
                      <Paperclip className="h-4 w-4" />
                    </a>
                  ) : null}
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={11} className="bg-gray-50/50 px-3 py-5">
                    <div className="mb-3 flex justify-end">
                      <form action={eliminarFactura}>
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </form>
                    </div>
                    <FacturaForm
                      action={guardarFactura}
                      clientes={clientes}
                      cotizaciones={cotizaciones}
                      choferes={choferes}
                      vehiculos={vehiculos}
                      factura={f}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
      <tfoot className="border-t border-border bg-gray-50 font-medium">
        <tr>
          <td colSpan={5} className="px-3 py-2.5 text-right text-muted">
            Total a pagar ({facturas.length})
          </td>
          <td className="px-3 py-2.5 text-right tabular-nums">
            {formatCLP(totalAPagar)}
          </td>
          <td colSpan={5}></td>
        </tr>
      </tfoot>
    </table>
  );
}
