"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileDown,
  Sheet,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import { CotizacionBadge, FacturaBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CotizacionPreview } from "./cotizacion-preview";
import { eliminarCotizacion } from "./actions";
import { formatCLP, formatDate } from "@/lib/format";
import type {
  Cotizacion,
  CotizacionItem,
  Cliente,
  Factura,
  Empresa,
} from "@/types/db";

export type CotRow = Cotizacion & {
  cliente: Pick<Cliente, "id" | "nombre" | "codigo"> | null;
  items: CotizacionItem[];
};

export function CotizacionAccordion({
  cotizaciones,
  empresa,
  facturas,
}: {
  cotizaciones: CotRow[];
  empresa: Empresa | null;
  facturas: Factura[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const facturasPorCot = useMemo(() => {
    const m = new Map<string, Factura[]>();
    for (const f of facturas) {
      if (!f.cotizacion_id) continue;
      const arr = m.get(f.cotizacion_id) ?? [];
      arr.push(f);
      m.set(f.cotizacion_id, arr);
    }
    return m;
  }, [facturas]);

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">N°</th>
          <th className="px-4 py-3 font-medium">Fecha</th>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Detalle</th>
          <th className="px-4 py-3 font-medium text-right">Total</th>
          <th className="px-4 py-3 font-medium">Estado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {cotizaciones.map((c) => {
          const open = openId === c.id;
          const items = [...(c.items ?? [])].sort((a, b) => a.orden - b.orden);
          const cotFacturas = facturasPorCot.get(c.id) ?? [];
          return (
            <Fragment key={c.id}>
              <tr
                onClick={() => setOpenId(open ? null : c.id)}
                className={`cursor-pointer ${open ? "bg-gray-100/60" : "hover:bg-gray-50"}`}
              >
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-brand">
                    {c.numero}
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{formatDate(c.fecha)}</td>
                <td className="px-4 py-3">{c.cliente?.nombre ?? "—"}</td>
                <td className="px-4 py-3 max-w-xs truncate text-muted">
                  {c.titulo ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {formatCLP(c.total)}
                </td>
                <td className="px-4 py-3">
                  <CotizacionBadge estado={c.estado} />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={6} className="bg-gray-50/50 px-4 py-5">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/cotizaciones/${c.id}/pdf`}
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        <FileDown className="h-4 w-4" />
                        PDF
                      </a>
                      <a
                        href={`/api/cotizaciones/${c.id}/excel`}
                        className={buttonClass({ variant: "secondary", size: "sm" })}
                      >
                        <Sheet className="h-4 w-4" />
                        Excel
                      </a>
                      <Link
                        href={`/cotizaciones/${c.id}/editar`}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Link>
                      <Link
                        href={`/facturas/nueva?cotizacion=${c.id}`}
                        className={buttonClass({ size: "sm" })}
                      >
                        <Receipt className="h-4 w-4" />
                        Crear factura
                      </Link>
                      <form action={eliminarCotizacion} className="ml-auto">
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </form>
                    </div>

                    <CotizacionPreview empresa={empresa} cot={c} items={items} />

                    {cotFacturas.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2 text-sm font-semibold">
                          Facturas de esta cotización
                        </p>
                        <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                          {cotFacturas.map((f) => (
                            <li
                              key={f.id}
                              className="flex items-center justify-between px-4 py-2 text-sm"
                            >
                              <Link
                                href={`/facturas/${f.id}`}
                                className="font-medium text-brand hover:underline"
                              >
                                {f.numero ? `Factura ${f.numero}` : "Sin número"} ·{" "}
                                {formatDate(f.fecha)}
                              </Link>
                              <span className="flex items-center gap-3">
                                <span className="tabular-nums">
                                  {formatCLP(f.valor_a_pagar ?? f.valor_servicio)}
                                </span>
                                <FacturaBadge estado={f.estado} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
