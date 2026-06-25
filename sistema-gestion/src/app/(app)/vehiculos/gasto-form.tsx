"use client";

import { useActionState, useEffect, useRef } from "react";
import { agregarGasto, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { GASTO_CATEGORIAS } from "@/types/db";

export function GastoForm({ vehiculoId }: { vehiculoId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    agregarGasto,
    {},
  );
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state.ok]);

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      <input type="hidden" name="vehiculo_id" value={vehiculoId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Categoría
          </label>
          <Select name="categoria" defaultValue="combustible">
            {Object.entries(GASTO_CATEGORIAS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Monto
          </label>
          <Input name="monto_total" inputMode="numeric" placeholder="$ 0" required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            Fecha
          </label>
          <Input type="date" name="fecha" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Descripción
        </label>
        <Input name="descripcion" placeholder="Detalle del gasto (opcional)…" />
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        <Plus className="h-4 w-4" />
        {pending ? "Guardando…" : "Agregar gasto"}
      </Button>
    </form>
  );
}
