"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  guardarVehiculo,
  eliminarVehiculo,
  eliminarGasto,
  type FormState,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { GastoForm } from "./gasto-form";
import { Trash2, Check, Loader2 } from "lucide-react";
import { toInputDate, formatCLP, formatDate } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import {
  GASTO_CATEGORIAS,
  type GastoCategoria,
  type GastoVehiculo,
  type Vehiculo,
} from "@/types/db";

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
  const demo = isDemo();
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setGuardado(true);
      const t = setTimeout(() => setGuardado(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  function autoguardar() {
    if (demo) return;
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
          ) : guardado ? (
            <>
              <Check className="h-3.5 w-3.5 text-ok" />
              Guardado
            </>
          ) : demo ? (
            "Autoguardado (no en demo)"
          ) : (
            ""
          )}
        </span>
        <form action={eliminarVehiculo}>
          <input type="hidden" name="id" value={vehiculo.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </form>
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
          <input type="hidden" name="id" value={vehiculo.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Patente">
              <Input name="patente" defaultValue={vehiculo.patente} required />
            </Campo>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={vehiculo.activo}
                  onChange={autoguardar}
                  className="h-4 w-4"
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

          {state.error && !demo ? (
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
                  className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium"
                >
                  {GASTO_CATEGORIAS[x.cat]}
                  <span className="tabular-nums text-muted">{formatCLP(x.total)}</span>
                </span>
              ))}
            </div>
          ) : null}

          {gastos.length === 0 ? (
            <p className="text-sm text-muted">Sin gastos registrados.</p>
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
                        <form action={eliminarGasto}>
                          <input type="hidden" name="id" value={gx.id} />
                          <input type="hidden" name="vehiculo_id" value={vehiculo.id} />
                          <button
                            type="submit"
                            className="text-muted hover:text-red-600"
                            title="Eliminar gasto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-[#f0f0f2] pt-3">
            <p className="mb-2 text-sm font-medium">Agregar gasto</p>
            <GastoForm vehiculoId={vehiculo.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
