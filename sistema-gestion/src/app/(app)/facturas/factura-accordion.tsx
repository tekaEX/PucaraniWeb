"use client";

import { Fragment, useState, useTransition } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { FacturaBadge } from "@/components/ui/badge";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { EstadoSelector, type EstadoOpcion } from "@/components/ui/estado-selector";
import { formatCLP, formatDate } from "@/lib/format";
import {
  TIPOS_DTE,
  facturaEstadoDerivado,
  type FacturaConRelaciones,
  type FacturaEstadoDerivado,
} from "@/types/db";
import { actualizarEstadoFactura, eliminarFactura } from "./actions";
import { FacturaForm, type ViajeOpt } from "./factura-form";
import { EmitirBoton } from "./emitir-boton";
import { buttonClass } from "@/components/ui/button";

const ESTADOS_FACTURA: EstadoOpcion[] = [
  { value: "por_cobrar", label: "Por cobrar", tone: "amber" },
  { value: "pagada", label: "Pagada", tone: "green" },
];

// Pastilla de estado autoguardada (como en Viajes). Emitir/pagar requiere
// folio: si falta, avisa al usuario en vez de llamar al servidor.
function FacturaEstadoControl({ factura }: { factura: FacturaConRelaciones }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const derivado = facturaEstadoDerivado(factura);

  function onCambio(nuevo: string): boolean {
    setError("");
    if ((nuevo === "por_cobrar" || nuevo === "pagada") && !factura.folio) {
      setError("Asigna primero un folio (abajo) para emitir la factura.");
      return false; // veta: la pastilla no se mueve
    }
    const fd = new FormData();
    fd.set("id", factura.id);
    fd.set("estado", nuevo);
    startTransition(() => actualizarEstadoFactura(fd));
    return true;
  }

  return (
    <div>
      <EstadoSelector
        name="estado"
        defaultValue={derivado}
        opciones={ESTADOS_FACTURA}
        pending={pending}
        onCambio={onCambio}
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

// Tinte de fila sutil según estado (mismo criterio del sistema de diseño).
function rowTone(derivado: FacturaEstadoDerivado) {
  if (derivado === "por_cobrar") return "bg-[#fffdf8]";
  if (derivado === "borrador") return "bg-[#fcfdff]";
  return "";
}

/** Lo que hace falta para que el botón de emitir sirva de algo. */
export type ConfigSii = {
  ambiente: "certificacion" | "produccion";
  /** false si falta el certificado, el CAF o la resolución del SII. */
  listo: boolean;
  motivo?: string;
};

export function FacturaAccordion({
  facturas,
  clientes,
  porFacturar,
  sii,
}: {
  facturas: FacturaConRelaciones[];
  clientes: { id: string; nombre: string; codigo: string | null }[];
  porFacturar: ViajeOpt[];
  sii: ConfigSii;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
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
                className={`cursor-pointer transition-colors hover:bg-brand-soft/50 ${open ? "bg-brand-soft/70" : rowTone(derivado)}`}
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
                  <td colSpan={7} className="bg-background px-4 py-5">
                    <div className="animate-expand">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <FacturaEstadoControl factura={f} />
                      {/* Emitir solo tiene sentido en un borrador sin folio:
                          una vez emitida, el folio ya salió al SII. */}
                      {f.estado === "borrador" && !f.folio ? (
                        <EmitirBoton
                          facturaId={f.id}
                          ambiente={sii.ambiente}
                          listo={sii.listo}
                          motivo={sii.motivo}
                        />
                      ) : null}
                      <ConfirmForm
                        action={eliminarFactura}
                        mensaje={`¿Eliminar la factura ${f.folio ? `N° ${f.folio}` : "en borrador"}? Sus viajes quedarán como "por facturar". Esta acción no se puede deshacer.`}
                        className="ml-auto"
                      >
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          type="submit"
                          className={buttonClass({ variant: "dangerOutline", size: "sm" })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Eliminar
                        </button>
                      </ConfirmForm>
                    </div>

                    {/* Edición completa inline: los viajes disponibles son los
                        propios de esta factura + los que siguen por facturar. */}
                    <FacturaForm
                      factura={f}
                      clientes={clientes}
                      viajesDisponibles={[
                        ...f.viajes.map((v) => ({
                          id: v.id,
                          cliente_id: v.cliente_id,
                          descripcion: v.descripcion,
                          fecha_inicio: v.fecha_inicio,
                          valor: Number(v.valor),
                        })),
                        ...porFacturar.filter(
                          (v) => !f.viajes.some((p) => p.id === v.id),
                        ),
                      ]}
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
