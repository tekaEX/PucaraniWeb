"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, Pencil, CheckCircle2, Trash2 } from "lucide-react";
import { ViajeBadge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { formatCLP, formatDate } from "@/lib/format";
import {
  costoTotalViaje,
  viajePorFacturar,
  type ViajeConRelaciones,
} from "@/types/db";
import { actualizarEstadoViaje, eliminarViaje } from "./actions";

// Tinte de fila sutil según estado (mismo criterio del sistema de diseño).
function rowTone(v: ViajeConRelaciones) {
  if (viajePorFacturar(v)) return "bg-[#fffdf8]";
  if (v.estado === "programado") return "bg-[#fcfdff]";
  return "";
}

export function ViajeAccordion({ viajes }: { viajes: ViajeConRelaciones[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Fecha</th>
          <th className="px-4 py-3 font-medium">Servicio</th>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Chofer / Bus</th>
          <th className="px-4 py-3 font-medium text-right">Valor</th>
          <th className="px-4 py-3 font-medium text-right">Costos</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3 font-medium">Factura</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {viajes.map((v) => {
          const open = openId === v.id;
          const costos = costoTotalViaje(v);
          return (
            <Fragment key={v.id}>
              <tr
                onClick={() => setOpenId(open ? null : v.id)}
                className={`cursor-pointer transition-colors hover:bg-gray-100/60 ${open ? "bg-gray-100/60" : rowTone(v)}`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {formatDate(v.fecha_inicio)}
                  {v.fecha_fin ? ` – ${formatDate(v.fecha_fin)}` : ""}
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-foreground">{v.descripcion}</span>
                  {v.orden_compra ? (
                    <span className="ml-2 text-xs text-muted">OC {v.orden_compra}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{v.cliente?.nombre ?? "—"}</td>
                <td className="px-4 py-3">
                  {v.asignaciones.length === 0 ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {v.asignaciones.map((a) => (
                        <span
                          key={a.id}
                          className="rounded-full bg-[#ececef] px-2 py-0.5 text-xs text-[#6e6e73]"
                        >
                          {[a.chofer?.nombre, a.vehiculo?.patente].filter(Boolean).join(" · ")}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums font-medium">
                  {formatCLP(v.valor)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">
                  {costos ? formatCLP(costos) : "—"}
                </td>
                <td className="px-4 py-3">
                  <ViajeBadge viaje={v} />
                </td>
                <td
                  className="whitespace-nowrap px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  {v.factura ? (
                    <Link
                      href={`/facturas/${v.factura.id}`}
                      className="text-brand hover:underline"
                    >
                      {v.factura.folio ? `N° ${v.factura.folio}` : "Borrador"}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
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
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/viajes/${v.id}`}
                        className={buttonClass({ variant: "outline", size: "sm" })}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Link>
                      {v.estado === "programado" ? (
                        <form action={actualizarEstadoViaje}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="estado" value="realizado" />
                          <button
                            type="submit"
                            className={buttonClass({ variant: "secondary", size: "sm" })}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Marcar realizado
                          </button>
                        </form>
                      ) : null}
                      <ConfirmForm
                        action={eliminarViaje}
                        mensaje={`¿Eliminar el viaje "${v.descripcion}"? Esta acción no se puede deshacer.`}
                        className="ml-auto"
                      >
                        <input type="hidden" name="id" value={v.id} />
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
                      {/* Costos y margen */}
                      <div className="rounded-xl border border-border bg-white p-4">
                        <p className="mb-3 text-sm font-semibold">Costos del viaje</p>
                        <dl className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <dt className="text-muted">Combustible</dt>
                            <dd className="tabular-nums">
                              {formatCLP(Number(v.costo_combustible))}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Peajes</dt>
                            <dd className="tabular-nums">{formatCLP(Number(v.costo_peajes))}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Viáticos</dt>
                            <dd className="tabular-nums">
                              {formatCLP(Number(v.costo_viaticos))}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Otros</dt>
                            <dd className="tabular-nums">{formatCLP(Number(v.costo_otros))}</dd>
                          </div>
                          <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                            <dt>Total costos</dt>
                            <dd className="tabular-nums">{formatCLP(costos)}</dd>
                          </div>
                          <div className="flex justify-between font-medium">
                            <dt>Margen (valor − costos)</dt>
                            <dd
                              className={`tabular-nums ${v.valor - costos < 0 ? "text-danger" : "text-ok"}`}
                            >
                              {formatCLP(v.valor - costos)}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      {/* Detalle */}
                      <div className="rounded-xl border border-border bg-white p-4">
                        <p className="mb-3 text-sm font-semibold">Detalle</p>
                        <dl className="space-y-1.5 text-sm">
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Cliente</dt>
                            <dd className="text-right">{v.cliente?.nombre ?? "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Orden de compra</dt>
                            <dd>{v.orden_compra ?? "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Cotización</dt>
                            <dd>
                              {v.cotizacion ? (
                                <Link
                                  href={`/cotizaciones/${v.cotizacion.id}`}
                                  className="text-brand hover:underline"
                                >
                                  N° {v.cotizacion.numero}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-4">
                            <dt className="text-muted">Asignaciones</dt>
                            <dd className="text-right">
                              {v.asignaciones.length === 0
                                ? "—"
                                : v.asignaciones
                                    .map((a) =>
                                      [a.chofer?.nombre, a.vehiculo?.patente]
                                        .filter(Boolean)
                                        .join(" · "),
                                    )
                                    .join(", ")}
                            </dd>
                          </div>
                          {v.notas ? (
                            <div className="pt-1.5">
                              <dt className="text-muted">Notas</dt>
                              <dd className="mt-0.5 whitespace-pre-wrap">{v.notas}</dd>
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
