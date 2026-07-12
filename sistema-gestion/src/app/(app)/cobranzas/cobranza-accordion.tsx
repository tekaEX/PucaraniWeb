"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { InitialsAvatar } from "@/components/ui/avatar";
import { FacturaBadge } from "@/components/ui/badge";
import { formatCLP, formatDate } from "@/lib/format";
import { facturaEstadoDerivado, type FacturaConRelaciones } from "@/types/db";

const DIAS_VENCE = 30;

function diasDesde(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  d.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - d.getTime()) / 86400000);
}

export type ViajePendiente = {
  id: string;
  fecha_inicio: string;
  descripcion: string;
  valor: number;
};

export type CobranzaCliente = {
  clienteId: string;
  nombre: string;
  pendienteFacturar: number;
  porCobrar: number;
  vencido: number;
  pagado: number;
  facturas: FacturaConRelaciones[];
  viajesPendientes: ViajePendiente[];
};

export function CobranzaAccordion({ filas }: { filas: CobranzaCliente[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium text-right">Por facturar</th>
          <th className="px-4 py-3 font-medium text-right">Por cobrar</th>
          <th className="px-4 py-3 font-medium text-right">Vencido</th>
          <th className="px-4 py-3 font-medium text-right">Pagado</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {filas.map((f) => {
          const open = openId === f.clienteId;
          return (
            <Fragment key={f.clienteId}>
              <tr
                onClick={() => setOpenId(open ? null : f.clienteId)}
                className="cursor-pointer transition-colors hover:bg-gray-100/60"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={f.nombre} size={32} />
                    <span className="font-semibold text-foreground">{f.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {f.pendienteFacturar ? formatCLP(f.pendienteFacturar) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {f.porCobrar ? formatCLP(f.porCobrar) : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {f.vencido ? (
                    <span className="font-medium text-danger">
                      {formatCLP(f.vencido)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">
                  {f.pagado ? formatCLP(f.pagado) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={6} className="bg-gray-50/50 px-4 py-5">
                    {f.viajesPendientes.length > 0 ? (
                      <>
                        <p className="mb-2 text-sm font-semibold">
                          Viajes por facturar
                        </p>
                        <div className="mb-4 overflow-x-auto rounded-xl border border-border bg-white">
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-border">
                              {f.viajesPendientes.map((v) => (
                                <tr key={v.id}>
                                  <td className="w-28 whitespace-nowrap px-4 py-2.5 text-muted">
                                    {formatDate(v.fecha_inicio)}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <Link href={`/viajes/${v.id}`} className="hover:underline">
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
                        </div>
                      </>
                    ) : null}

                    <p className="mb-2 text-sm font-semibold">Estado de cuenta</p>
                    {f.facturas.length === 0 ? (
                      <p className="text-sm text-muted">Sin facturas en el periodo.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                            <tr>
                              <th className="px-4 py-2.5 font-medium">Emisión</th>
                              <th className="px-4 py-2.5 font-medium">Folio</th>
                              <th className="px-4 py-2.5 font-medium">Viajes incluidos</th>
                              <th className="px-4 py-2.5 font-medium text-right">Monto</th>
                              <th className="px-4 py-2.5 font-medium">Estado</th>
                              <th className="px-4 py-2.5 font-medium text-right">
                                Antigüedad
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {f.facturas.map((fx) => {
                              const derivado = facturaEstadoDerivado(fx);
                              const dias = fx.fecha_emision ? diasDesde(fx.fecha_emision) : null;
                              const vencida =
                                derivado === "por_cobrar" && dias !== null && dias > DIAS_VENCE;
                              return (
                                <tr key={fx.id}>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                                    {fx.fecha_emision ? formatDate(fx.fecha_emision) : "—"}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <Link href={`/facturas/${fx.id}`} className="hover:underline">
                                      {fx.folio ?? "Borrador"}
                                    </Link>
                                  </td>
                                  <td className="max-w-48 truncate px-4 py-2.5">
                                    {fx.viajes.length === 0
                                      ? "—"
                                      : fx.viajes.map((v) => v.descripcion).join(" · ")}
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                                    {formatCLP(Number(fx.total))}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <FacturaBadge estado={derivado} />
                                  </td>
                                  <td className="px-4 py-2.5 text-right tabular-nums">
                                    {derivado === "por_cobrar" && dias !== null ? (
                                      <span
                                        className={
                                          vencida ? "font-medium text-danger" : "text-muted"
                                        }
                                      >
                                        {dias} día{dias === 1 ? "" : "s"}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
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
