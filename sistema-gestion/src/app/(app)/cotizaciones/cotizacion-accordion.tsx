"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  FileDown,
  Sheet,
  Pencil,
  Route,
  Trash2,
} from "lucide-react";
import { CotizacionBadge, ViajeBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { CotizacionPreview } from "./cotizacion-preview";
import { eliminarCotizacion } from "./actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { formatCLP, formatDate } from "@/lib/format";
import type {
  Cotizacion,
  CotizacionItem,
  Cliente,
  Viaje,
  Empresa,
} from "@/types/db";

export type CotRow = Cotizacion & {
  cliente: Pick<Cliente, "id" | "nombre" | "codigo"> | null;
  items: CotizacionItem[];
};

export function CotizacionAccordion({
  cotizaciones,
  empresa,
  viajes,
}: {
  cotizaciones: CotRow[];
  empresa: Empresa | null;
  viajes: Viaje[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const viajesPorCot = useMemo(() => {
    const m = new Map<string, Viaje[]>();
    for (const v of viajes) {
      if (!v.cotizacion_id) continue;
      const arr = m.get(v.cotizacion_id) ?? [];
      arr.push(v);
      m.set(v.cotizacion_id, arr);
    }
    return m;
  }, [viajes]);

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
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {cotizaciones.map((c) => {
          const open = openId === c.id;
          const items = [...(c.items ?? [])].sort((a, b) => a.orden - b.orden);
          const cotViajes = viajesPorCot.get(c.id) ?? [];
          return (
            <Fragment key={c.id}>
              <tr
                onClick={() => setOpenId(open ? null : c.id)}
                className={`cursor-pointer ${open ? "bg-gray-100/60" : "hover:bg-gray-100/60"}`}
              >
                <td className="px-4 py-3">
                  <span className="font-semibold text-foreground">{c.numero}</span>
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
                <td className="px-4 py-3 text-right">
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={7} className="bg-gray-50/50 px-4 py-5">
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
                        href={`/viajes/nueva?cotizacion=${c.id}`}
                        className={buttonClass({ size: "sm" })}
                      >
                        <Route className="h-4 w-4" />
                        Registrar viaje
                      </Link>
                      <ConfirmForm
                        action={eliminarCotizacion}
                        mensaje={`¿Eliminar la cotización N° ${c.numero}? Esta acción no se puede deshacer.`}
                        className="ml-auto"
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </ConfirmForm>
                    </div>

                    <CotizacionPreview empresa={empresa} cot={c} items={items} />

                    {cotViajes.length > 0 ? (
                      <div className="mt-4">
                        <p className="mb-2 text-sm font-semibold">
                          Viajes de esta cotización
                        </p>
                        <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                          {cotViajes.map((v) => (
                            <li
                              key={v.id}
                              className="flex items-center justify-between px-4 py-2 text-sm"
                            >
                              <Link
                                href={`/viajes/${v.id}`}
                                className="font-medium text-brand hover:underline"
                              >
                                {v.descripcion} · {formatDate(v.fecha_inicio)}
                              </Link>
                              <span className="flex items-center gap-3">
                                <span className="tabular-nums">{formatCLP(v.valor)}</span>
                                <ViajeBadge viaje={v} />
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
