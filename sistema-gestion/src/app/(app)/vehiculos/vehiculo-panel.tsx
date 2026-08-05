"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  guardarVehiculo,
  eliminarVehiculo,
  desactivarVehiculo,
  tieneHistorialVehiculo,
  eliminarGasto,
  type FormState,
} from "./actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GastoForm } from "./gasto-form";
import { Trash2, Check, Loader2 } from "lucide-react";
import { toInputDate, formatCLP, formatDate } from "@/lib/format";
import { PATENTE_PATTERN, PATENTE_HINT } from "@/lib/patentes";
import { buttonClass } from "@/components/ui/button";
import { Vacio } from "@/components/ui/vacio";
import {
  GASTO_CATEGORIAS,
  VEHICULO_CATEGORIAS,
  type GastoCategoria,
  type GastoVehiculo,
  type Vehiculo,
} from "@/types/db";

// Diálogo al eliminar un vehículo: distingue "ya no se va a ocupar" (se
// desactiva, se conserva todo) de "eliminar todo el registro" (borrado real,
// avisando antes si tiene historial de viajes/gastos).
function EliminarVehiculoDialog({
  vehiculo,
  onClose,
}: {
  vehiculo: Vehiculo;
  onClose: () => void;
}) {
  const [historial, setHistorial] = useState<boolean | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [desactivarState, desactivarAction, desactivarPending] = useActionState<
    FormState,
    FormData
  >(desactivarVehiculo, {});
  const [eliminarState, eliminarActionState, eliminarPending] = useActionState<
    FormState,
    FormData
  >(eliminarVehiculo, {});

  useEffect(() => {
    let vivo = true;
    tieneHistorialVehiculo(vehiculo.patente).then((tiene) => {
      if (vivo) setHistorial(tiene);
    });
    return () => {
      vivo = false;
    };
  }, [vehiculo.patente]);

  useEffect(() => {
    if (desactivarState.ok) onClose();
  }, [desactivarState.ok, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Eliminar ${vehiculo.patente}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-md rounded-[18px] bg-white p-5 shadow-card"
      >
        <p className="text-base font-semibold">¿Qué quieres hacer con {vehiculo.patente}?</p>
        {historial ? (
          <p className="mt-1.5 text-sm text-warn">
            Este vehículo tiene viajes y/o gastos registrados en su historial.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <form action={desactivarAction}>
            <input type="hidden" name="patente" value={vehiculo.patente} />
            <button
              type="submit"
              disabled={desactivarPending}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              Ya no se va a ocupar
              <span className="block text-xs font-normal text-muted">
                Se marca como inactivo. Se conserva junto con su historial.
              </span>
            </button>
          </form>

          {!confirmarBorrado ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              className="w-full rounded-xl border border-danger/20 bg-white px-4 py-3 text-left text-sm font-medium text-danger hover:bg-danger-bg"
            >
              Eliminar todo el registro
              <span className="block text-xs font-normal text-danger/80">
                Borra el vehículo del sistema. No se puede deshacer.
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-danger/20 bg-danger-bg p-3">
              <p className="text-sm text-danger">
                ¿Confirmas eliminar {vehiculo.patente} y todo su registro
                {historial ? "? Su historial de viajes quedará sin vehículo asignado." : "?"}
              </p>
              <form action={eliminarActionState} className="mt-2">
                <input type="hidden" name="patente" value={vehiculo.patente} />
                <button
                  type="submit"
                  disabled={eliminarPending}
                  className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-[#a32a21] disabled:opacity-50"
                >
                  Sí, eliminar definitivamente
                </button>
              </form>
            </div>
          )}
        </div>

        {desactivarState.error ? (
          <p className="mt-3 text-sm text-danger">{desactivarState.error}</p>
        ) : null}
        {eliminarState.error ? (
          <p className="mt-3 text-sm text-danger">{eliminarState.error}</p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-muted hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}

const catTone: Record<GastoCategoria, "amber" | "blue" | "violet" | "gray"> = {
  combustible: "amber",
  mantencion: "blue",
  seguros: "violet",
  otros: "gray",
};

function Campo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

export function VehiculoPanel({
  vehiculo,
  gastos,
}: {
  vehiculo: Vehiculo;
  gastos: GastoVehiculo[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarVehiculo,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);

  function autoguardar() {
    formRef.current?.requestSubmit();
  }
  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoguardar();
  }

  const total = gastos.reduce((a, g) => a + Number(g.monto_total), 0);
  const porCategoria = (Object.keys(GASTO_CATEGORIAS) as GastoCategoria[])
    .map((cat) => ({
      cat,
      total: gastos
        .filter((g) => g.categoria === cat)
        .reduce((a, g) => a + Number(g.monto_total), 0),
    }))
    .filter((x) => x.total > 0);

  return (
    <div className="space-y-4">
      {/* Estado de guardado + eliminar */}
      <div className="flex items-center justify-end gap-3">
        <span className="flex h-4 items-center gap-1.5 text-xs text-muted">
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando…
            </>
          ) : state.ok ? (
            <>
              <Check className="h-3.5 w-3.5 text-ok" />
              Guardado
            </>
          ) : (
            ""
          )}
        </span>
        <button
          type="button"
          onClick={() => setEliminarAbierto(true)}
          className={buttonClass({ variant: "dangerOutline", size: "sm" })}
        >
          <Trash2 className="h-4 w-4" />
          Eliminar
        </button>
        {eliminarAbierto ? (
          <EliminarVehiculoDialog
            vehiculo={vehiculo}
            onClose={() => setEliminarAbierto(false)}
          />
        ) : null}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Datos del vehículo (autoguardado) */}
        <form
          ref={formRef}
          action={formAction}
          onBlur={onBlurForm}
          className="space-y-4 rounded-xl border border-border bg-white p-4"
        >
          <p className="text-sm font-semibold">Datos del vehículo</p>
          <input type="hidden" name="patente_original" value={vehiculo.patente} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Patente">
              <Input
                name="patente"
                defaultValue={vehiculo.patente}
                required
                pattern={PATENTE_PATTERN}
                maxLength={8}
                title={PATENTE_HINT}
                className="uppercase"
              />
            </Campo>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={vehiculo.activo}
                  onChange={autoguardar}
                  className="h-4 w-4 accent-brand"
                />
                Vehículo activo
              </label>
            </div>
            <Campo label="Marca">
              <Input name="marca" defaultValue={vehiculo.marca ?? ""} />
            </Campo>
            <Campo label="Modelo">
              <Input name="modelo" defaultValue={vehiculo.modelo ?? ""} />
            </Campo>
            <Campo label="Año">
              <Input name="anio" type="number" defaultValue={vehiculo.anio ?? ""} />
            </Campo>
            <Campo label="Capacidad">
              <Input
                name="capacidad"
                type="number"
                defaultValue={vehiculo.capacidad ?? ""}
              />
            </Campo>
            <Campo label="Kilometraje" className="sm:col-span-2">
              <Input
                name="km_actual"
                type="number"
                defaultValue={vehiculo.km_actual ?? ""}
              />
            </Campo>
            <Campo label="Categoría" className="sm:col-span-2">
              <Select
                name="categoria"
                defaultValue={vehiculo.categoria ?? ""}
                onChange={autoguardar}
              >
                <option value="">Sin categoría</option>
                {Object.entries(VEHICULO_CATEGORIAS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Documentos (vencimientos)</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Rev. técnica">
                <Input
                  name="revision_tecnica_venc"
                  type="date"
                  defaultValue={
                    vehiculo.revision_tecnica_venc
                      ? toInputDate(vehiculo.revision_tecnica_venc)
                      : ""
                  }
                />
              </Campo>
              <Campo label="SOAP">
                <Input
                  name="soap_venc"
                  type="date"
                  defaultValue={vehiculo.soap_venc ? toInputDate(vehiculo.soap_venc) : ""}
                />
              </Campo>
              <Campo label="Permiso circ.">
                <Input
                  name="permiso_circulacion_venc"
                  type="date"
                  defaultValue={
                    vehiculo.permiso_circulacion_venc
                      ? toInputDate(vehiculo.permiso_circulacion_venc)
                      : ""
                  }
                />
              </Campo>
            </div>
          </div>

          <Campo label="Notas">
            <Textarea name="notas" defaultValue={vehiculo.notas ?? ""} />
          </Campo>

          {state.error ? (
            <p className="text-sm text-danger">{state.error}</p>
          ) : null}
        </form>

        {/* Gastos */}
        <div className="space-y-4 rounded-xl border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Gastos</p>
            <span className="text-sm font-semibold tabular-nums">
              {formatCLP(total)}
            </span>
          </div>

          {porCategoria.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {porCategoria.map((x) => (
                <span
                  key={x.cat}
                  className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1 text-xs font-medium"
                >
                  {GASTO_CATEGORIAS[x.cat]}
                  <span className="tabular-nums text-muted">{formatCLP(x.total)}</span>
                </span>
              ))}
            </div>
          ) : null}

          {gastos.length === 0 ? (
            <Vacio titulo="Sin gastos registrados." />
          ) : (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-[#f0f0f2]">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {gastos.map((gx) => (
                    <tr key={gx.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">
                        {formatDate(gx.fecha)}
                      </td>
                      <td className="px-1 py-2">
                        <Badge tone={catTone[gx.categoria]}>
                          {GASTO_CATEGORIAS[gx.categoria]}
                        </Badge>
                      </td>
                      <td className="max-w-[130px] truncate px-1 py-2">
                        {gx.descripcion ?? gx.proveedor_razon_social ?? "—"}
                        {gx.origen === "sii" ? (
                          <span className="ml-1 text-xs text-muted">· SII</span>
                        ) : null}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums font-medium">
                        {formatCLP(Number(gx.monto_total))}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <ConfirmForm
                          action={eliminarGasto}
                          mensaje="¿Eliminar este gasto?"
                        >
                          <input type="hidden" name="id" value={gx.id} />
                          <button
                            type="submit"
                            className="text-muted hover:text-danger"
                            title="Eliminar gasto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </ConfirmForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-[#f0f0f2] pt-3">
            <p className="mb-2 text-sm font-medium">Agregar gasto</p>
            <GastoForm vehiculoId={vehiculo.patente} />
          </div>
        </div>
      </div>
    </div>
  );
}
