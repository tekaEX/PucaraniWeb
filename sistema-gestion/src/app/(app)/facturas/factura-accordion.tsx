"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, Pencil, HandCoins, Trash2 } from "lucide-react";
import { FacturaBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { formatCLP, formatDate } from "@/lib/format";
import {
  TIPOS_DTE,
  facturaEstadoDerivado,
  type FacturaConRelaciones,
  type FacturaEstadoDerivado,
} from "@/types/db";
import { marcarPagada, eliminarFactura } from "./actions";

// Tinte de fila sutil según estado (mismo criterio del sistema de diseño).
function rowTone(derivado: FacturaEstadoDerivado) {
  if (derivado === "por_cobrar") return "bg-[#fffdf8]";
  if (derivado === "borrador") return "bg-[#fcfdff]";
  return "";
}

export function FacturaAccordion({ facturas }: { facturas: FacturaConRelaciones[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Folio</th>
          <th className="px-4 py-3 font-medium">Emisión</th>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Viajes incluidos</th>
          <th className="px-4 py-3 font-medium text-right">Total</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {facturas.map((f) => {
          const open = openId === f.id;
          const derivado = facturaEstadoDerivado(f);
          return (
            <Fragment key={f.id}>
              <tr
                onClick={() => setOpenId(open ? null : f.id)}
                className={`cursor-pointer transition-colors hover:bg-gray-100/60 ${open ? "bg-gray-100/60" : rowTone(derivado)}`}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="font-semibold text-foreground">
                    {f.folio ? `N° ${f.folio}` : "Borrador"}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {TIPOS_DTE[f.tipo_dte] ?? `DTE ${f.tipo_dte}`}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {f.fecha_emision ? formatDate(f.fecha_emision) : "—"}
                </td>
                <td className="px-4 py-3">{f.cliente?.nombre ?? "—"}</td>
                <td className="px-4 py-3">
                  {f.viajes.length === 0 ? (
                    <span className="text-muted">Sin viajes</span>
                  ) : f.viajes.length === 1 ? (
                    f.viajes[0].descripcion
                  ) : (
                    <span>
                      {f.viajes.length} viajes
                      <span className="ml-1 text-xs text-muted">
                        ({f.viajes[0].descripcion}…)
                      </span>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium">
                  {formatCLP(f.total)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <FacturaBadge estado={derivado} />
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
                      <Link
                        href={`/facturas/${f.id}`}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <Pencil className="h-4 w-4" />
                        Ver / editar
                      </Link>
                      {derivado === "por_cobrar" ? (
                        <form action={marcarPagada}>
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            className={buttonClass({ variant: "secondary", size: "sm" })}
                            title="Registrar pago con fecha de hoy"
                          >
                            <HandCoins className="h-4 w-4" />
                            Registrar pago
                          </button>
                        </form>
                      ) : null}
                      <ConfirmForm
                        action={eliminarFactura}
                        mensaje={`¿Eliminar la factura ${f.folio ? `N° ${f.folio}` : "en borrador"}? Sus viajes quedarán como "por facturar". Esta acción no se puede deshacer.`}
                        className="ml-auto"
                      >
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </ConfirmForm>
                    </div>

                    <div className="grid items-start gap-4 lg:grid-cols-2">
                      {/* Viajes incluidos */}
                      <div className="overflow-hidden rounded-xl border border-border bg-white">
                        <p className="border-b border-border px-4 py-3 text-sm font-semibold">
                          Viajes incluidos
                        </p>
                        {f.viajes.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-muted">
                            Esta factura no tiene viajes asociados.
                          </p>
                        ) : (
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-border">
                              {f.viajes.map((v) => (
                                <tr key={v.id}>
                                  <td className="w-28 whitespace-nowrap px-4 py-2.5 text-muted">
                                    {formatDate(v.fecha_inicio)}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <Link
                                      href={`/viajes/${v.id}`}
                                      className="text-brand hover:underline"
                                    >
                                      {v.descripcion}
                                    </Link>
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                                    {formatCLP(v.valor)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Resumen del documento */}
                      <div className="rounded-xl border border-border bg-white p-4">
                        <p className="mb-3 text-sm font-semibold">Documento</p>
                        <dl className="space-y-1.5 text-sm">
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Tipo</dt>
                            <dd>{TIPOS_DTE[f.tipo_dte] ?? `DTE ${f.tipo_dte}`}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Neto</dt>
                            <dd className="tabular-nums">{formatCLP(f.neto)}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">IVA</dt>
                            <dd className="tabular-nums">{formatCLP(f.iva)}</dd>
                          </div>
                          <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-medium">
                            <dt>Total</dt>
                            <dd className="tabular-nums">{formatCLP(f.total)}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Fecha de pago</dt>
                            <dd>
                              {f.fecha_pago ? (
                                <span className="font-medium text-ok">
                                  {formatDate(f.fecha_pago)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          {f.notas ? (
                            <div className="pt-1.5">
                              <dt className="text-muted">Notas</dt>
                              <dd className="mt-0.5 whitespace-pre-wrap">{f.notas}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
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
