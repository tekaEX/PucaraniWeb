"use client";

import { useActionState } from "react";
import Link from "next/link";
import { guardarVehiculo, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";
import { toInputDate } from "@/lib/format";
import type { Vehiculo } from "@/types/db";

export function VehiculoForm({ vehiculo }: { vehiculo?: Vehiculo }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarVehiculo,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      {vehiculo ? <input type="hidden" name="id" value={vehiculo.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del vehículo</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Patente" htmlFor="patente">
            <Input id="patente" name="patente" defaultValue={vehiculo?.patente ?? ""} required />
          </Field>
          <Field label="Capacidad (pasajeros)" htmlFor="capacidad">
            <Input id="capacidad" name="capacidad" type="number" defaultValue={vehiculo?.capacidad ?? ""} />
          </Field>
          <Field label="Marca" htmlFor="marca">
            <Input id="marca" name="marca" defaultValue={vehiculo?.marca ?? ""} />
          </Field>
          <Field label="Modelo" htmlFor="modelo">
            <Input id="modelo" name="modelo" defaultValue={vehiculo?.modelo ?? ""} />
          </Field>
          <Field label="Año" htmlFor="anio">
            <Input id="anio" name="anio" type="number" defaultValue={vehiculo?.anio ?? ""} />
          </Field>
          <Field label="Kilometraje actual" htmlFor="km_actual">
            <Input id="km_actual" name="km_actual" type="number" defaultValue={vehiculo?.km_actual ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos (vencimientos)</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Revisión técnica" htmlFor="revision_tecnica_venc">
            <Input
              id="revision_tecnica_venc"
              name="revision_tecnica_venc"
              type="date"
              defaultValue={vehiculo?.revision_tecnica_venc ? toInputDate(vehiculo.revision_tecnica_venc) : ""}
            />
          </Field>
          <Field label="SOAP (seguro)" htmlFor="soap_venc">
            <Input
              id="soap_venc"
              name="soap_venc"
              type="date"
              defaultValue={vehiculo?.soap_venc ? toInputDate(vehiculo.soap_venc) : ""}
            />
          </Field>
          <Field label="Permiso de circulación" htmlFor="permiso_circulacion_venc">
            <Input
              id="permiso_circulacion_venc"
              name="permiso_circulacion_venc"
              type="date"
              defaultValue={
                vehiculo?.permiso_circulacion_venc
                  ? toInputDate(vehiculo.permiso_circulacion_venc)
                  : ""
              }
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={vehiculo?.activo ?? true}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">Vehículo activo</span>
          </label>
          <Field label="Notas" htmlFor="notas" className="mb-0">
            <Textarea id="notas" name="notas" defaultValue={vehiculo?.notas ?? ""} />
          </Field>
          {state.error ? (
            <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar vehículo"}
        </Button>
        <Link href="/vehiculos" className={buttonClass({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
