"use client";

import { useActionState } from "react";
import { FileUp } from "lucide-react";
import { guardarCaf, type FormState } from "./actions";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";

// Carga de un CAF. No pide ni el tipo de documento ni el rango: los dos salen
// del propio archivo. Tipear "del 465 al 564" a mano es justo lo que después
// emite un folio fuera de rango y hace que el SII rechace el documento.
export function CafForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(guardarCaf, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label="Archivo CAF (.xml)"
        htmlFor="caf"
        hint="Se descarga del SII en «Timbraje electrónico». El tipo de documento y el rango de folios se leen del archivo."
      >
        <input
          id="caf"
          name="caf"
          type="file"
          accept=".xml,application/xml,text/xml"
          required
          className={`${inputClass} h-auto py-2 file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-sm file:text-brand`}
        />
      </Field>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <FileUp className="h-4 w-4" />
          {pending ? "Cargando…" : "Cargar folios"}
        </Button>
      </div>
    </form>
  );
}
