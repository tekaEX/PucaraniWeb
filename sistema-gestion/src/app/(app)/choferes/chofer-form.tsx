"use client";

import { useActionState } from "react";
import Link from "next/link";
import { guardarChofer, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Save } from "lucide-react";
import { toInputDate } from "@/lib/format";
import type { Chofer } from "@/types/db";

export function ChoferForm({ chofer }: { chofer?: Chofer }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarChofer,
    {},
  );

  return (
    <form action={formAction}>
      {chofer ? <input type="hidden" name="id" value={chofer.id} /> : null}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="nombre" className="sm:col-span-2">
            <Input id="nombre" name="nombre" defaultValue={chofer?.nombre ?? ""} required />
          </Field>
          <Field label="RUT" htmlFor="rut">
            <Input id="rut" name="rut" defaultValue={chofer?.rut ?? ""} />
          </Field>
          <Field label="Teléfono" htmlFor="telefono">
            <Input id="telefono" name="telefono" defaultValue={chofer?.telefono ?? ""} />
          </Field>
          <Field label="N° de licencia" htmlFor="licencia_numero">
            <Input
              id="licencia_numero"
              name="licencia_numero"
              defaultValue={chofer?.licencia_numero ?? ""}
            />
          </Field>
          <Field label="Clase de licencia" htmlFor="licencia_clase">
            <Input
              id="licencia_clase"
              name="licencia_clase"
              defaultValue={chofer?.licencia_clase ?? ""}
              placeholder="A3"
            />
          </Field>
          <Field
            label="Vencimiento de licencia"
            htmlFor="licencia_vencimiento"
            className="sm:col-span-2"
          >
            <Input
              id="licencia_vencimiento"
              name="licencia_vencimiento"
              type="date"
              defaultValue={
                chofer?.licencia_vencimiento
                  ? toInputDate(chofer.licencia_vencimiento)
                  : ""
              }
            />
          </Field>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={chofer?.activo ?? true}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">Chofer activo</span>
          </label>
          <Field label="Notas" htmlFor="notas" className="sm:col-span-2">
            <Textarea id="notas" name="notas" defaultValue={chofer?.notas ?? ""} />
          </Field>

          {state.error ? (
            <p className="sm:col-span-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar chofer"}
        </Button>
        <Link href="/choferes" className={buttonClass({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
