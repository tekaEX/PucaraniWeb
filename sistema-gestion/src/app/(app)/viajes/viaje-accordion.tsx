"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, Trash2 } from "lucide-react";
import { ChoferBadge, ViajeBadge } from "@/components/ui/badge";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EstadoSelector, type EstadoOpcion } from "@/components/ui/estado-selector";
import {
  ViajeForm,
  type ClienteOpt,
  type CotizacionOpt,
  type ChoferOpt,
  type VehiculoOpt,
} from "./viaje-form";
import { formatCLP, formatDate } from "@/lib/format";
import {
  costoTotalViaje,
  viajePorFacturar,
  type ViajeConRelaciones,
} from "@/types/db";
import { actualizarEstadoViaje, eliminarViaje } from "./actions";
import { buttonClass } from "@/components/ui/button";

const ESTADOS_VIAJE: EstadoOpcion[] = [
  { value: "programado", label: "Programado", tone: "blue" },
  { value: "realizado", label: "Realizado", tone: "green" },
  { value: "cancelado", label: "Cancelado", tone: "gray" },
];

// Selector de estado con autoguardado (componente compartido del sistema).
// useTransition mantiene `pending` (el spinner) hasta que el servidor guarda
// y la lista se revalida.
function EstadoViajeControl({ viaje }: { viaje: ViajeConRelaciones }) {
  const [pending, startTransition] = useTransition();
  return (
    <EstadoSelector
      name="estado"
      defaultValue={viaje.estado}
      opciones={ESTADOS_VIAJE}
      pending={pending}
      onCambio={(nuevo) => {
        const fd = new FormData();
        fd.set("id", viaje.id);
        fd.set("estado", nuevo);
        startTransition(() => actualizarEstadoViaje(fd));
      }}
    />
  );
}

// Tinte de fila sutil según estado (mismo criterio del sistema de diseño).
function rowTone(v: ViajeConRelaciones) {
  if (viajePorFacturar(v)) return "bg-[#fffdf8]";
  if (v.estado === "programado") return "bg-[#fcfdff]";
  return "";
}

export function ViajeAccordion({
  viajes,
  clientes,
  cotizaciones,
  choferes,
  vehiculos,
}: {
  viajes: ViajeConRelaciones[];
  clientes: ClienteOpt[];
  cotizaciones: CotizacionOpt[];
  choferes: ChoferOpt[];
  vehiculos: VehiculoOpt[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Fecha</th>
          <th className="px-4 py-3 font-medium">Servicio</th>
          <th className="px-4 py-3 font-medium">Cliente</th>
          <th className="px-4 py-3 font-medium">Chofer / Bus</th>
          <th className="px-4 py-3 font-medium text-right">Valor</th>
          <th className="px-4 py-3 font-medium text-right">Costos</th>
          <th className="px-4 py-3 font-medium">Estado</th>
          <th className="px-4 py-3 font-medium">Cotización</th>
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
                className={`cursor-pointer transition-colors hover:bg-brand-soft/50 ${open ? "bg-brand-soft/70" : rowTone(v)}`}
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
                        <ChoferBadge key={a.id}>
                          {[a.chofer?.nombre, a.vehiculo?.patente].filter(Boolean).join(" · ")}
                        </ChoferBadge>
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
                  {v.cotizacion ? (
                    <Link
                      href={`/cotizaciones/${v.cotizacion.id}`}
                      className="text-brand hover:underline"
                    >
                      N° {v.cotizacion.numero}
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
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
                  <td colSpan={10} className="bg-background px-4 py-5">
                    <div className="animate-expand">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <EstadoViajeControl viaje={v} />
                      <ConfirmForm
                        action={eliminarViaje}
                        mensaje={`¿Eliminar el viaje "${v.descripcion}"? Esta acción no se puede deshacer.`}
                        className="ml-auto"
                      >
                        <input type="hidden" name="id" value={v.id} />
                        <button
                          type="submit"
                          className={buttonClass({ variant: "dangerOutline", size: "sm" })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </ConfirmForm>
                    </div>

                    {/* Edición completa inline (mismo patrón que Facturas y
                        Cotizaciones): datos, asignaciones y costos. */}
                    <ViajeForm
                      viaje={v}
                      clientes={clientes}
                      cotizaciones={cotizaciones}
                      choferes={choferes}
                      vehiculos={vehiculos}
                    />
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
