"use client";

import { useActionState, useRef, useState } from "react";
import { guardarServicioTaxi, eliminarServicioTaxi, type FormState } from "./actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Trash2, Check, Loader2 } from "lucide-react";
import { isDemo } from "@/lib/demo";
import { toInputDate } from "@/lib/format";
import {
  TAXI_TIPOS,
  taxiNombreCliente,
  type ServicioTaxiConRelaciones,
  type TaxiTipo,
} from "@/types/db";

// Edición inline de un servicio de taxi (autoguardado al salir del formulario,
// mismo patrón que choferes/viajes: sin botón Guardar).
export function TaxiPanel({
  servicio,
  clientes,
  choferes,
}: {
  servicio: ServicioTaxiConRelaciones;
  clientes: { id: string; nombre: string }[];
  choferes: { id: string; nombre: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarServicioTaxi,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const demo = isDemo();

  const [tipo, setTipo] = useState<TaxiTipo>(servicio.tipo);
  const [monto, setMonto] = useState(String(servicio.monto));

  function autoguardar() {
    if (demo) return; // en modo demo no se persiste
    formRef.current?.requestSubmit();
  }

  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoguardar();
  }

  function onTipoChange(nuevo: TaxiTipo) {
    const prevDefault = TAXI_TIPOS[tipo].monto;
    setTipo(nuevo);
    // Solo precarga el default del tipo nuevo si el monto estaba en 0 o era
    // el default del tipo anterior (no pisa montos escritos a mano).
    const precarga = monto === "0" || monto === "" || monto === String(prevDefault ?? "");
    if (precarga && TAXI_TIPOS[nuevo].monto) setMonto(String(TAXI_TIPOS[nuevo].monto));
    // Guardar al tiro, salvo que pase a "especial" sin descripción (el server
    // la exige): ahí se espera al blur, cuando ya esté escrita.
    if (nuevo !== "especial") {
      // setTimeout deja que React vuelque el estado nuevo al DOM antes del submit.
      setTimeout(autoguardar, 0);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <form
          ref={formRef}
          action={formAction}
          onBlur={onBlurForm}
          className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input type="hidden" name="id" value={servicio.id} />
          <Field label="Fecha" className="mb-0">
            <Input
              name="fecha"
              type="date"
              defaultValue={toInputDate(servicio.fecha)}
              required
            />
          </Field>
          <Field label="Tipo de servicio" className="mb-0">
            <Select
              name="tipo"
              value={tipo}
              onChange={(e) => onTipoChange(e.target.value as TaxiTipo)}
            >
              {Object.entries(TAXI_TIPOS).map(([value, t]) => (
                <option key={value} value={value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Monto" className="mb-0">
            <MoneyInput name="monto" value={monto} onChange={setMonto} placeholder="0" />
          </Field>
          {tipo === "especial" ? (
            <Field label="Descripción del servicio" className="mb-0 sm:col-span-2 lg:col-span-3">
              <Input
                name="descripcion"
                defaultValue={servicio.descripcion ?? ""}
                placeholder="Tour Lauca medio día…"
                required
              />
            </Field>
          ) : null}
          <Field label="Nombre (pasajero)" className="mb-0">
            <Input
              name="pasajero"
              defaultValue={servicio.pasajero ?? ""}
              placeholder="Opcional"
            />
          </Field>
          <Field label="Empresa" className="mb-0">
            <Select
              name="cliente_id"
              defaultValue={servicio.cliente_id ?? ""}
              onChange={autoguardar}
            >
              <option value="">
                {servicio.cliente_id === null && servicio.cliente_texto
                  ? `Sin empresa (era: ${servicio.cliente_texto})`
                  : "Sin empresa"}
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chofer" className="mb-0">
            <Select
              name="chofer_id"
              defaultValue={servicio.chofer_id ?? ""}
              onChange={autoguardar}
            >
              <option value="">
                {servicio.chofer_id === null && servicio.chofer_texto
                  ? `Sin chofer (era: ${servicio.chofer_texto})`
                  : "Sin chofer"}
              </option>
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          {state.error && !demo ? (
            <p className="text-sm text-danger sm:col-span-2 lg:col-span-3">{state.error}</p>
          ) : null}
        </form>

        <div className="flex flex-col items-end gap-2">
          <ConfirmForm
            action={eliminarServicioTaxi}
            mensaje={`¿Eliminar el servicio del ${toInputDate(servicio.fecha)}${
              taxiNombreCliente(servicio) ? ` (${taxiNombreCliente(servicio)})` : ""
            }? Esta acción no se puede deshacer.`}
          >
            <input type="hidden" name="id" value={servicio.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          </ConfirmForm>
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
            ) : demo ? (
              "Autoguardado (no en demo)"
            ) : (
              ""
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
