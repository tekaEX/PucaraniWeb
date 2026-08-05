"use client";

import { useActionState, useState } from "react";
import { guardarReglaPago, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save } from "lucide-react";
import { ENCOMIENDA_TIPO_PAGO, type EncomiendaTipoPago } from "@/types/db";

export function ReglaPagoForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarReglaPago,
    {},
  );
  const [tipoPago, setTipoPago] = useState<EncomiendaTipoPago>("porcentaje");
  const [valorPago, setValorPago] = useState("");
  const [montoDia, setMontoDia] = useState("");
  const [bonoMonto, setBonoMonto] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva regla de pago</CardTitle>
      </CardHeader>
      <form action={formAction}>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Fijo por día trabajado"
            htmlFor="monto_dia"
            hint="Se paga cada día que salió a repartir, aunque no logre entregas"
          >
            <MoneyInput
              id="monto_dia"
              name="monto_dia"
              value={montoDia}
              onChange={setMontoDia}
              placeholder="0"
            />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Tipo de pago" htmlFor="tipo_pago">
            <Select
              id="tipo_pago"
              name="tipo_pago"
              value={tipoPago}
              onChange={(e) => setTipoPago(e.target.value as EncomiendaTipoPago)}
            >
              {Object.entries(ENCOMIENDA_TIPO_PAGO).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={tipoPago === "porcentaje" ? "Porcentaje (%)" : "Monto fijo por pedido"}
            htmlFor="valor_pago"
          >
            {tipoPago === "porcentaje" ? (
              <Input
                id="valor_pago"
                name="valor_pago"
                type="number"
                min={0}
                max={100}
                step="0.1"
                required
              />
            ) : (
              <MoneyInput
                id="valor_pago"
                name="valor_pago"
                value={valorPago}
                onChange={setValorPago}
                placeholder="0"
              />
            )}
          </Field>
          <Field
            label="Meta de entregas/día para el bono"
            htmlFor="meta_entregas_dia"
            hint="Opcional"
          >
            <Input id="meta_entregas_dia" name="meta_entregas_dia" type="number" min={1} />
          </Field>
          <Field label="Monto del bono" htmlFor="bono_monto" hint="Opcional">
            <MoneyInput
              id="bono_monto"
              name="bono_monto"
              value={bonoMonto}
              onChange={setBonoMonto}
              placeholder="0"
            />
          </Field>
          {state.error ? (
            <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
              {state.error}
            </p>
          ) : null}
        </CardBody>
        <div className="flex items-center gap-2 border-t border-[#f0f0f2] px-6 py-4">
          <Button type="submit" disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar regla"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
