"use client";

import { useActionState } from "react";
import Link from "next/link";
import { guardarCliente, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Save } from "lucide-react";
import type { Cliente } from "@/types/db";

export function ClienteForm({ cliente }: { cliente?: Cliente }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarCliente,
    {},
  );

  return (
    <form action={formAction}>
      {cliente ? <input type="hidden" name="id" value={cliente.id} /> : null}
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="nombre" className="sm:col-span-2">
            <Input
              id="nombre"
              name="nombre"
              defaultValue={cliente?.nombre ?? ""}
              placeholder="Empresa Portuaria Arica"
              required
            />
          </Field>
          <Field
            label="Código / sección"
            htmlFor="codigo"
            hint="Abreviatura usada en el seguimiento (ej. epa, tpa)."
          >
            <Input
              id="codigo"
              name="codigo"
              defaultValue={cliente?.codigo ?? ""}
              placeholder="epa"
            />
          </Field>
          <Field label="RUT" htmlFor="rut">
            <Input
              id="rut"
              name="rut"
              defaultValue={cliente?.rut ?? ""}
              placeholder="76.123.456-7"
            />
          </Field>
          <Field label="Dirección" htmlFor="direccion" className="sm:col-span-2">
            <Input
              id="direccion"
              name="direccion"
              defaultValue={cliente?.direccion ?? ""}
            />
          </Field>
          <Field label="Contacto (nombre)" htmlFor="contacto_nombre">
            <Input
              id="contacto_nombre"
              name="contacto_nombre"
              defaultValue={cliente?.contacto_nombre ?? ""}
            />
          </Field>
          <Field label="Contacto (teléfono)" htmlFor="contacto_telefono">
            <Input
              id="contacto_telefono"
              name="contacto_telefono"
              defaultValue={cliente?.contacto_telefono ?? ""}
            />
          </Field>
          <Field label="Contacto (correo)" htmlFor="contacto_email" className="sm:col-span-2">
            <Input
              id="contacto_email"
              name="contacto_email"
              type="email"
              defaultValue={cliente?.contacto_email ?? ""}
            />
          </Field>
          <Field label="Notas" htmlFor="notas" className="sm:col-span-2">
            <Textarea id="notas" name="notas" defaultValue={cliente?.notas ?? ""} />
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
          {pending ? "Guardando…" : "Guardar cliente"}
        </Button>
        <Link href="/clientes" className={buttonClass({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
