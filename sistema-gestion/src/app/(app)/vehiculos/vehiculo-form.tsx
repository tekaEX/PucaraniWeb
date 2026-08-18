"use client";

import { useActionState } from "react";
import { guardarVehiculo, type FormState } from "./actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";
import { toInputDate } from "@/lib/format";
import { PATENTE_PATTERN, PATENTE_HINT } from "@/lib/patentes";
import { DOCS_VEHICULO } from "@/lib/vencimientos";
import { VEHICULO_CATEGORIAS, type Vehiculo } from "@/types/db";

export function VehiculoForm({ vehiculo }: { vehiculo?: Vehiculo }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarVehiculo,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {vehiculo ? (
        <input type="hidden" name="patente_original" value={vehiculo.patente} />
      ) : null}

      {/* Dos columnas simétricas: misma altura, sin huecos. */}
      <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Datos del vehículo</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Patente" htmlFor="patente">
            <Input
              id="patente"
              name="patente"
              defaultValue={vehiculo?.patente ?? ""}
              required
              pattern={PATENTE_PATTERN}
              maxLength={8}
              title={PATENTE_HINT}
              placeholder="ABCD-12"
              className="uppercase"
            />
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
          <Field label="Categoría" htmlFor="categoria" className="sm:col-span-2">
            <Select id="categoria" name="categoria" defaultValue={vehiculo?.categoria ?? ""}>
              <option value="">Sin categoría</option>
              {Object.entries(VEHICULO_CATEGORIAS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Documentos (vencimientos)</CardTitle>
        </CardHeader>
        {/* Un campo por documento, desde lib/vencimientos.ts: la misma lista
            que la tabla, el panel y la campana. El `name` ES la columna. */}
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {DOCS_VEHICULO.map((d) => {
            const fecha = vehiculo?.[d.campo] as string | null | undefined;
            return (
              <Field key={d.campo} label={d.label} htmlFor={d.campo}>
                <Input
                  id={d.campo}
                  name={d.campo}
                  type="date"
                  defaultValue={fecha ? toInputDate(fecha) : ""}
                />
              </Field>
            );
          })}
        </CardBody>
      </Card>

      <Card className="flex-1">
        <CardBody className="space-y-4">
          <label className="flex items-center gap-2">
            <Checkbox
              name="activo"
              defaultChecked={vehiculo?.activo ?? true}
            />
            <span className="text-sm font-medium">Vehículo activo</span>
          </label>
          <Field label="Notas" htmlFor="notas" className="mb-0">
            <Textarea id="notas" name="notas" defaultValue={vehiculo?.notas ?? ""} />
          </Field>
          {state.error ? (
            <p className="rounded-lg bg-danger-bg border border-danger/20 px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
        </CardBody>
      </Card>
      </div>
      </div>

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar vehículo"}
        </Button>
      </div>
    </form>
  );
}
