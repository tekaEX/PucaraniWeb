"use client";

import { useActionState } from "react";
import { actualizarDocumentos, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VencimientoBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Save, CheckCircle2 } from "lucide-react";
import { toInputDate } from "@/lib/format";
import type { Vehiculo } from "@/types/db";

export function DocumentosRow({ vehiculo }: { vehiculo: Vehiculo }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    actualizarDocumentos,
    {},
  );

  const campos: { name: string; label: string; value: string | null }[] = [
    { name: "revision_tecnica_venc", label: "Revisión técnica", value: vehiculo.revision_tecnica_venc },
    { name: "soap_venc", label: "SOAP (seguro)", value: vehiculo.soap_venc },
    { name: "permiso_circulacion_venc", label: "Permiso de circulación", value: vehiculo.permiso_circulacion_venc },
  ];

  return (
    <Card>
      <CardBody>
        <form action={formAction}>
          <input type="hidden" name="id" value={vehiculo.id} />
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold">{vehiculo.patente}</div>
            <div className="text-xs text-muted">
              {[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ")}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {campos.map((c) => (
              <div key={c.name}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.label}</span>
                  <VencimientoBadge fecha={c.value} />
                </div>
                <Input type="date" name={c.name} defaultValue={c.value ? toInputDate(c.value) : ""} />
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              <Save className="h-4 w-4" />
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            {state.ok ? (
              <span className="flex items-center gap-1 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Guardado
              </span>
            ) : null}
            {state.error ? (
              <span className="text-sm text-red-600">{state.error}</span>
            ) : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
