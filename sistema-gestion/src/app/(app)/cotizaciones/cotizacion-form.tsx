"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import type { FormState } from "./actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Save } from "lucide-react";
import { formatCLP, toInputDate, todayInput } from "@/lib/format";
import { COTIZACION_ESTADOS } from "@/types/db";
import type { Cotizacion, CotizacionItem } from "@/types/db";

const NOTA_DEFAULT =
  "En caso de sufrir algún desperfecto la máquina en servicio, contamos con máquinas de reemplazo al instante.";
const TITULO_DEFAULT = "Transporte de pasajeros — bus de acercamiento";

type Row = {
  key: string;
  fecha: string;
  descripcion: string;
  valor_unitario: string;
};

function toNum(v: string): number {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

let counter = 0;
const newKey = () => `r${Date.now()}-${counter++}`;

export function CotizacionForm({
  action,
  clientes,
  cotizacion,
  items,
  defaultAutor,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  clientes: { id: string; nombre: string; codigo: string | null }[];
  cotizacion?: Cotizacion;
  items?: CotizacionItem[];
  defaultAutor?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );

  const [exento, setExento] = useState<boolean>(cotizacion?.exento_iva ?? true);
  const [rows, setRows] = useState<Row[]>(
    items && items.length > 0
      ? items.map((it) => ({
          key: newKey(),
          fecha: it.fecha ? toInputDate(it.fecha) : "",
          descripcion: it.descripcion,
          valor_unitario: String(it.valor_unitario),
        }))
      : [{ key: newKey(), fecha: "", descripcion: "", valor_unitario: "" }],
  );

  const totales = useMemo(() => {
    const subtotal = rows.reduce(
      (acc, r) => acc + Math.round(toNum(r.valor_unitario)),
      0,
    );
    const iva = exento ? 0 : Math.round(subtotal * 0.19);
    return { subtotal, iva, total: subtotal + iva };
  }, [rows, exento]);

  const itemsJson = JSON.stringify(
    rows.map((r) => ({
      fecha: r.fecha || null,
      descripcion: r.descripcion,
      valor_unitario: toNum(r.valor_unitario),
    })),
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: newKey(), fecha: "", descripcion: "", valor_unitario: "" },
    ]);
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  return (
    <form action={formAction} className="space-y-4">
      {cotizacion ? <input type="hidden" name="id" value={cotizacion.id} /> : null}
      <input type="hidden" name="itemsJson" value={itemsJson} />
      <input type="hidden" name="exento_iva" value={exento ? "on" : ""} />

      <Card>
        <CardHeader>
          <CardTitle>
            {cotizacion ? `Cotización N° ${cotizacion.numero}` : "Datos de la cotización"}
          </CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente" htmlFor="cliente_id">
            <Select
              id="cliente_id"
              name="cliente_id"
              defaultValue={cotizacion?.cliente_id ?? ""}
            >
              <option value="">— Sin cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.codigo ? ` (${c.codigo})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado" htmlFor="estado">
            <Select id="estado" name="estado" defaultValue={cotizacion?.estado ?? "borrador"}>
              {Object.entries(COTIZACION_ESTADOS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="fecha">
            <Input
              id="fecha"
              name="fecha"
              type="date"
              defaultValue={cotizacion ? toInputDate(cotizacion.fecha) : todayInput()}
            />
          </Field>
          <Field label="Válido hasta" htmlFor="fecha_validez">
            <Input
              id="fecha_validez"
              name="fecha_validez"
              type="date"
              defaultValue={
                cotizacion?.fecha_validez
                  ? toInputDate(cotizacion.fecha_validez)
                  : toInputDate(addDays(new Date(), 30))
              }
            />
          </Field>
          <Field label="Autor" htmlFor="autor">
            <Input
              id="autor"
              name="autor"
              defaultValue={cotizacion?.autor ?? defaultAutor ?? ""}
              placeholder="c.carreño"
            />
          </Field>
          <Field label="Título del servicio" htmlFor="titulo">
            <Input
              id="titulo"
              name="titulo"
              defaultValue={cotizacion?.titulo ?? TITULO_DEFAULT}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle del servicio</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4" />
            Agregar línea
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.key}
              className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[9.5rem_1fr_8rem_2.5rem] sm:items-end"
            >
              <Field label="Fecha" className="mb-0">
                <Input
                  type="date"
                  value={r.fecha}
                  onChange={(e) => updateRow(r.key, { fecha: e.target.value })}
                />
              </Field>
              <Field label="Descripción" className="mb-0">
                <Textarea
                  value={r.descripcion}
                  onChange={(e) => updateRow(r.key, { descripcion: e.target.value })}
                  placeholder="Día 15 — desde casino el morro al regimiento..."
                  className="min-h-10"
                  rows={2}
                />
              </Field>
              <Field label="Valor" className="mb-0">
                <MoneyInput
                  value={r.valor_unitario}
                  onChange={(raw) => updateRow(r.key, { valor_unitario: raw })}
                  placeholder="0"
                />
              </Field>
              <button
                type="button"
                onClick={() => removeRow(r.key)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger"
                aria-label="Quitar línea"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <Field label="Nota al pie" htmlFor="nota_pie" className="mb-0">
              <Textarea
                id="nota_pie"
                name="nota_pie"
                defaultValue={cotizacion?.nota_pie ?? NOTA_DEFAULT}
                rows={3}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-2 text-sm">
            <label className="mb-3 flex items-center gap-2">
              <Checkbox checked={exento} onChange={(e) => setExento(e.target.checked)} />
              <span className="font-medium">Servicio exento de IVA</span>
            </label>
            <div className="flex justify-between">
              <span className="text-muted">Subtotal</span>
              <span className="tabular-nums">{formatCLP(totales.subtotal)}</span>
            </div>
            {!exento ? (
              <div className="flex justify-between">
                <span className="text-muted">IVA (19%)</span>
                <span className="tabular-nums">{formatCLP(totales.iva)}</span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCLP(totales.total)}</span>
            </div>
            {exento ? (
              <p className="text-xs text-muted">Valor del servicio exento de IVA.</p>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-danger-bg border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar cotización"}
        </Button>
        <Link href="/cotizaciones" className={buttonClass({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
