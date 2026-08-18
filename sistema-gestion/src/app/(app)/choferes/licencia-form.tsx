"use client";

import { useActionState, useRef } from "react";
import { actualizarLicencia, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { toInputDate } from "@/lib/format";
import { LICENCIA_CLASES } from "@/lib/flota";
import type { Chofer } from "@/types/db";
import { EstadoGuardado } from "@/components/ui/estado-guardado";

export function LicenciaForm({ chofer }: { chofer: Chofer }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    actualizarLicencia,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onBlur={onBlurForm}
      className="flex h-full flex-col gap-3"
    >
      <input type="hidden" name="id" value={chofer.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Clases</label>
          <Input
            name="licencia_clase"
            defaultValue={chofer.licencia_clase ?? ""}
            placeholder="A3, B"
            title={`Clases válidas: ${LICENCIA_CLASES.join(", ")}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">N° de licencia</label>
          <Input name="licencia_numero" defaultValue={chofer.licencia_numero ?? ""} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Vence</label>
          <Input
            type="date"
            name="licencia_vencimiento"
            defaultValue={
              chofer.licencia_vencimiento ? toInputDate(chofer.licencia_vencimiento) : ""
            }
          />
        </div>
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <EstadoGuardado
        pending={pending}
        ok={state.ok}
        guardando="Guardando licencia…"
        guardado="Licencia guardada"
        className="mt-auto"
      />
    </form>
  );
}
