"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { guardarServicioTaxi, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Save } from "lucide-react";
import { todayInput } from "@/lib/format";
import { TAXI_TIPOS, type TaxiTipo } from "@/types/db";

// Formulario de creación de un servicio de taxi (modal o página completa).
// Al elegir un tipo con monto por defecto (aeropuerto), se precarga el monto.
export function ServicioTaxiForm({
  clientes,
  choferes,
  inline = false,
}: {
  clientes: { id: string; nombre: string }[];
  choferes: { id: string; nombre: string }[];
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarServicioTaxi,
    {},
  );

  const [tipo, setTipo] = useState<TaxiTipo>("local");
  const [monto, setMonto] = useState("");

  function onTipoChange(nuevo: TaxiTipo) {
    const prevDefault = TAXI_TIPOS[tipo].monto;
    setTipo(nuevo);
    // Precarga el monto default del tipo si el campo está vacío o aún tiene
    // el default del tipo anterior (no pisa un monto escrito a mano).
    if (monto === "" || monto === String(prevDefault ?? "")) {
      setMonto(TAXI_TIPOS[nuevo].monto ? String(TAXI_TIPOS[nuevo].monto) : "");
    }
  }

  const fields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Fecha" htmlFor="fecha">
        <Input id="fecha" name="fecha" type="date" defaultValue={todayInput()} required />
      </Field>
      <Field label="Tipo de servicio" htmlFor="tipo">
        <Select
          id="tipo"
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
      {tipo === "especial" ? (
        <Field label="Descripción del servicio" htmlFor="descripcion" className="sm:col-span-2">
          <Input
            id="descripcion"
            name="descripcion"
            placeholder="Tour Lauca medio día…"
            required
          />
        </Field>
      ) : null}
      <Field label="Monto" htmlFor="monto">
        <MoneyInput id="monto" name="monto" value={monto} onChange={setMonto} placeholder="0" />
      </Field>
      <Field label="Nombre (pasajero)" htmlFor="pasajero">
        <Input id="pasajero" name="pasajero" placeholder="Opcional" />
      </Field>
      <Field label="Empresa" htmlFor="cliente_id">
        <Select id="cliente_id" name="cliente_id" defaultValue="">
          <option value="">Sin empresa</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Chofer" htmlFor="chofer_id">
        <Select id="chofer_id" name="chofer_id" defaultValue="">
          <option value="">Sin chofer</option>
          {choferes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </Field>
      {state.error ? (
        <p className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );

  return (
    <form action={formAction}>
      {inline ? (
        fields
      ) : (
        <Card>
          <CardBody>{fields}</CardBody>
        </Card>
      )}
      <div
        className={
          inline
            ? "mt-6 flex items-center justify-end gap-2 border-t border-border pt-5"
            : "mt-4 flex items-center gap-2"
        }
      >
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar servicio"}
        </Button>
        {!inline ? (
          <Link href="/taxis" className={buttonClass({ variant: "outline" })}>
            Cancelar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
