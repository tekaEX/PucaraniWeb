"use client";

import { useActionState } from "react";
import { guardarCliente, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
        <CardBody className="grid gap-3 sm:grid-cols-2">
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
          {/* Giro y comuna son obligatorios en una factura electrónica. Se
              piden acá, con el cliente adelante, y no en el momento de emitir,
              que es cuando ya no está para preguntarle. */}
          <Field label="Giro" htmlFor="giro" hint="Obligatorio para facturarle electrónicamente.">
            <Input
              id="giro"
              name="giro"
              defaultValue={cliente?.giro ?? ""}
              placeholder="Servicios de ingeniería"
            />
          </Field>
          <Field label="Comuna" htmlFor="comuna" hint="Obligatoria en la factura electrónica.">
            <Input
              id="comuna"
              name="comuna"
              defaultValue={cliente?.comuna ?? ""}
              placeholder="Arica"
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

          {state.error ? (
            <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
              {state.error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="mt-4 flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar cliente"}
        </Button>
      </div>
    </form>
  );
}
