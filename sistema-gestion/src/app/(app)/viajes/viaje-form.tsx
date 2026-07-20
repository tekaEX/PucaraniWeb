"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { guardarViaje, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Plus, X } from "lucide-react";
import { toInputDate, todayInput, formatCLP } from "@/lib/format";
import { VIAJE_ESTADOS } from "@/types/db";
import type { ViajeConRelaciones, ViajeEstado } from "@/types/db";

type ClienteOpt = { id: string; nombre: string; codigo: string | null };
type CotizacionOpt = {
  id: string;
  numero: number;
  cliente_id: string | null;
  total: number;
  titulo?: string | null;
};
type ChoferOpt = { id: string; nombre: string };
type VehiculoOpt = { patente: string };

type AsigRow = { chofer_id: string; vehiculo_id: string; fecha: string };

function toNum(v: string): number {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function ViajeForm({
  clientes,
  cotizaciones,
  choferes,
  vehiculos,
  viaje,
  defaults,
}: {
  clientes: ClienteOpt[];
  cotizaciones: CotizacionOpt[];
  choferes: ChoferOpt[];
  vehiculos: VehiculoOpt[];
  viaje?: ViajeConRelaciones;
  defaults?: {
    cotizacion_id?: string;
    cliente_id?: string;
    valor?: number;
    descripcion?: string;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarViaje,
    {},
  );

  const [cotizacionId, setCotizacionId] = useState(
    viaje?.cotizacion_id ?? defaults?.cotizacion_id ?? "",
  );
  const [clienteId, setClienteId] = useState(
    viaje?.cliente_id ?? defaults?.cliente_id ?? "",
  );
  const [valor, setValor] = useState(
    String(viaje?.valor ?? defaults?.valor ?? ""),
  );
  const [costos, setCostos] = useState({
    combustible: viaje?.costo_combustible ? String(viaje.costo_combustible) : "",
    peajes: viaje?.costo_peajes ? String(viaje.costo_peajes) : "",
    viaticos: viaje?.costo_viaticos ? String(viaje.costo_viaticos) : "",
    otros: viaje?.costo_otros ? String(viaje.costo_otros) : "",
  });
  const [asignaciones, setAsignaciones] = useState<AsigRow[]>(
    (viaje?.asignaciones ?? []).map((a) => ({
      chofer_id: a.chofer_id ?? "",
      vehiculo_id: a.vehiculo_id ?? "",
      fecha: a.fecha ? toInputDate(a.fecha) : "",
    })),
  );

  const ingreso = toNum(valor);
  const costoTotal =
    toNum(costos.combustible) +
    toNum(costos.peajes) +
    toNum(costos.viaticos) +
    toNum(costos.otros);
  const utilidad = ingreso - costoTotal;

  function onCotizacionChange(value: string) {
    setCotizacionId(value);
    const cot = cotizaciones.find((c) => c.id === value);
    if (cot) {
      if (cot.cliente_id) setClienteId(cot.cliente_id);
      if (!valor || valor === "0") setValor(String(cot.total));
    }
  }

  function setAsig(i: number, patch: Partial<AsigRow>) {
    setAsignaciones((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  const asignacionesJson = JSON.stringify(
    asignaciones
      .filter((a) => a.chofer_id || a.vehiculo_id)
      .map((a) => ({
        chofer_id: a.chofer_id || null,
        vehiculo_id: a.vehiculo_id || null,
        fecha: a.fecha || null,
      })),
  );

  return (
    <form action={formAction} className="space-y-6">
      {viaje ? <input type="hidden" name="id" value={viaje.id} /> : null}
      <input type="hidden" name="cotizacion_id" value={cotizacionId} />
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="asignaciones" value={asignacionesJson} />

      {viaje?.factura ? (
        <p className="rounded-lg border border-info-bg bg-info-bg px-3 py-2 text-sm text-info">
          Este viaje ya está incluido en la factura folio{" "}
          <Link href={`/facturas/${viaje.factura.id}`} className="font-semibold underline">
            {viaje.factura.folio ?? "borrador"}
          </Link>
          .
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del servicio</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Descripción" htmlFor="descripcion" className="sm:col-span-2">
            <Input
              id="descripcion"
              name="descripcion"
              required
              defaultValue={viaje?.descripcion ?? defaults?.descripcion ?? ""}
              placeholder="Conozca su puerto"
            />
          </Field>

          <Field label="Cliente" htmlFor="cliente_select">
            <Select
              id="cliente_select"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">— Elegir cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.codigo ? ` (${c.codigo})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cotización asociada" htmlFor="cotizacion_select">
            <Select
              id="cotizacion_select"
              value={cotizacionId}
              onChange={(e) => onCotizacionChange(e.target.value)}
            >
              <option value="">— Sin cotización —</option>
              {cotizaciones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.numero}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fecha de inicio" htmlFor="fecha_inicio">
            <Input
              id="fecha_inicio"
              name="fecha_inicio"
              type="date"
              defaultValue={viaje ? toInputDate(viaje.fecha_inicio) : todayInput()}
            />
          </Field>
          <Field label="Fecha de término" htmlFor="fecha_fin" hint="Solo para servicios de varios días.">
            <Input
              id="fecha_fin"
              name="fecha_fin"
              type="date"
              defaultValue={viaje?.fecha_fin ? toInputDate(viaje.fecha_fin) : ""}
            />
          </Field>

          <Field label="Estado" htmlFor="estado">
            <Select id="estado" name="estado" defaultValue={viaje?.estado ?? "programado"}>
              {(Object.entries(VIAJE_ESTADOS) as [ViajeEstado, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="Orden de compra (OC)" htmlFor="orden_compra">
            <Input
              id="orden_compra"
              name="orden_compra"
              defaultValue={viaje?.orden_compra ?? ""}
              placeholder="4800021834"
            />
          </Field>

          <Field label="Valor del servicio" htmlFor="valor">
            <Input
              id="valor"
              name="valor"
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="100000"
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Choferes y vehículos</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {asignaciones.length === 0 ? (
            <p className="text-sm text-muted">
              Sin asignaciones aún. Puedes agregar más de una (varios buses, o
              choferes distintos por día en servicios largos).
            </p>
          ) : null}
          {asignaciones.length > 0 ? (
            <div className="hidden gap-2 text-xs font-medium text-muted sm:grid sm:grid-cols-[1fr_1fr_11rem_2.5rem]">
              <span>Chofer</span>
              <span>Vehículo</span>
              <span>Día (opcional)</span>
              <span />
            </div>
          ) : null}
          {asignaciones.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_11rem_2.5rem] sm:items-center">
              <Select
                value={a.chofer_id}
                onChange={(e) => setAsig(i, { chofer_id: e.target.value })}
                aria-label="Chofer"
              >
                <option value="">— Sin chofer —</option>
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
              <Select
                value={a.vehiculo_id}
                onChange={(e) => setAsig(i, { vehiculo_id: e.target.value })}
                aria-label="Vehículo"
              >
                <option value="">— Sin vehículo —</option>
                {vehiculos.map((v) => (
                  <option key={v.patente} value={v.patente}>
                    {v.patente}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={a.fecha}
                onChange={(e) => setAsig(i, { fecha: e.target.value })}
                aria-label="Día específico"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAsignaciones((rows) => rows.filter((_, j) => j !== i))}
                aria-label="Quitar asignación"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setAsignaciones((rows) => [...rows, { chofer_id: "", vehiculo_id: "", fecha: "" }])
            }
          >
            <Plus className="h-4 w-4" />
            Agregar chofer/vehículo
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Costos del viaje y utilidad</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Combustible" htmlFor="costo_combustible" className="mb-0">
            <Input
              id="costo_combustible"
              name="costo_combustible"
              inputMode="numeric"
              value={costos.combustible}
              onChange={(e) => setCostos({ ...costos, combustible: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Peajes" htmlFor="costo_peajes" className="mb-0">
            <Input
              id="costo_peajes"
              name="costo_peajes"
              inputMode="numeric"
              value={costos.peajes}
              onChange={(e) => setCostos({ ...costos, peajes: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Viáticos" htmlFor="costo_viaticos" className="mb-0">
            <Input
              id="costo_viaticos"
              name="costo_viaticos"
              inputMode="numeric"
              value={costos.viaticos}
              onChange={(e) => setCostos({ ...costos, viaticos: e.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Otros" htmlFor="costo_otros" className="mb-0">
            <Input
              id="costo_otros"
              name="costo_otros"
              inputMode="numeric"
              value={costos.otros}
              onChange={(e) => setCostos({ ...costos, otros: e.target.value })}
              placeholder="0"
            />
          </Field>
        </CardBody>
        <div className="grid gap-2 border-t border-border px-5 py-4 text-sm sm:grid-cols-3">
          <div className="flex justify-between">
            <span className="text-muted">Ingreso</span>
            <span className="tabular-nums">{formatCLP(ingreso)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Costos</span>
            <span className="tabular-nums">{formatCLP(costoTotal)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Utilidad</span>
            <span className={`tabular-nums ${utilidad < 0 ? "text-danger" : "text-ok"}`}>
              {formatCLP(utilidad)}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardBody>
          <Field label="Notas" htmlFor="notas" className="mb-0">
            <Textarea id="notas" name="notas" defaultValue={viaje?.notas ?? ""} rows={2} />
          </Field>
        </CardBody>
      </Card>

      {state.error ? (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar viaje"}
        </Button>
        <Link href="/viajes" className={buttonClass({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
