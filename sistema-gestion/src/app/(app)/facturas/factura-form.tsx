"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { guardarFactura, type FormState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Upload, Paperclip, FileText } from "lucide-react";
import { toInputDate, todayInput, formatCLP } from "@/lib/format";
import { FACTURA_ESTADOS } from "@/types/db";
import type { Factura } from "@/types/db";

type ClienteOpt = { id: string; nombre: string; codigo: string | null };
type CotizacionOpt = {
  id: string;
  numero: number;
  cliente_id: string | null;
  total: number;
};
type ChoferOpt = { id: string; nombre: string };
type VehiculoOpt = { id: string; patente: string };

function toNum(v: string): number {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function FacturaForm({
  action,
  clientes,
  cotizaciones,
  choferes,
  vehiculos,
  factura,
  defaults,
}: {
  action?: (prev: FormState, fd: FormData) => Promise<FormState>;
  clientes: ClienteOpt[];
  cotizaciones: CotizacionOpt[];
  choferes: ChoferOpt[];
  vehiculos: VehiculoOpt[];
  factura?: Factura;
  defaults?: {
    cotizacion_id?: string;
    cliente_id?: string;
    valor_servicio?: number;
    descripcion?: string;
  };
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action ?? guardarFactura,
    {},
  );

  const [cotizacionId, setCotizacionId] = useState(
    factura?.cotizacion_id ?? defaults?.cotizacion_id ?? "",
  );
  const [clienteId, setClienteId] = useState(
    factura?.cliente_id ?? defaults?.cliente_id ?? "",
  );
  const [valorServicio, setValorServicio] = useState(
    String(factura?.valor_servicio ?? defaults?.valor_servicio ?? ""),
  );
  const [valorAPagar, setValorAPagar] = useState(
    factura?.valor_a_pagar != null ? String(factura.valor_a_pagar) : "",
  );
  const [costos, setCostos] = useState({
    combustible: factura?.costo_combustible ? String(factura.costo_combustible) : "",
    peajes: factura?.costo_peajes ? String(factura.costo_peajes) : "",
    viaticos: factura?.costo_viaticos ? String(factura.costo_viaticos) : "",
    otros: factura?.costo_otros ? String(factura.costo_otros) : "",
  });
  const [archivoUrl, setArchivoUrl] = useState(factura?.archivo_url ?? "");

  const ingreso = toNum(valorAPagar) || toNum(valorServicio);
  const costoTotal =
    toNum(costos.combustible) +
    toNum(costos.peajes) +
    toNum(costos.viaticos) +
    toNum(costos.otros);
  const utilidad = ingreso - costoTotal;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function onCotizacionChange(value: string) {
    setCotizacionId(value);
    const cot = cotizaciones.find((c) => c.id === value);
    if (cot) {
      if (cot.cliente_id) setClienteId(cot.cliente_id);
      if (!valorServicio || valorServicio === "0") {
        setValorServicio(String(cot.total));
      }
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `factura-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("adjuntos")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("adjuntos").getPublicUrl(path);
      setArchivoUrl(data.publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {factura ? <input type="hidden" name="id" value={factura.id} /> : null}
      <input type="hidden" name="cotizacion_id" value={cotizacionId} />
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="archivo_url" value={archivoUrl} />

      <Card>
        <CardHeader>
          <CardTitle>Datos del servicio</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Cotización asociada" htmlFor="cotizacion_select" className="sm:col-span-2">
            <Select
              id="cotizacion_select"
              value={cotizacionId}
              onChange={(e) => onCotizacionChange(e.target.value)}
            >
              <option value="">— Sin cotización —</option>
              {cotizaciones.map((c) => (
                <option key={c.id} value={c.id}>
                  n-{c.numero}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Cliente" htmlFor="cliente_select">
            <Select
              id="cliente_select"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
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
          <Field label="Fecha del servicio" htmlFor="fecha">
            <Input
              id="fecha"
              name="fecha"
              type="date"
              defaultValue={factura ? toInputDate(factura.fecha) : todayInput()}
            />
          </Field>

          <Field label="Descripción" htmlFor="descripcion" className="sm:col-span-2">
            <Input
              id="descripcion"
              name="descripcion"
              defaultValue={factura?.descripcion ?? defaults?.descripcion ?? ""}
              placeholder="Conozca su puerto"
            />
          </Field>

          <Field label="Chofer" htmlFor="chofer_id">
            <Select id="chofer_id" name="chofer_id" defaultValue={factura?.chofer_id ?? ""}>
              <option value="">— Sin asignar —</option>
              {choferes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vehículo" htmlFor="vehiculo_id">
            <Select id="vehiculo_id" name="vehiculo_id" defaultValue={factura?.vehiculo_id ?? ""}>
              <option value="">— Sin asignar —</option>
              {vehiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.patente}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="N° de buses" htmlFor="n_buses">
            <Input
              id="n_buses"
              name="n_buses"
              type="number"
              min={0}
              defaultValue={factura?.n_buses ?? 1}
            />
          </Field>
          <Field label="Orden de compra (OC)" htmlFor="orden_compra">
            <Input
              id="orden_compra"
              name="orden_compra"
              defaultValue={factura?.orden_compra ?? ""}
              placeholder="4800021834"
            />
          </Field>

          <Field label="Valor del servicio" htmlFor="valor_servicio">
            <Input
              id="valor_servicio"
              name="valor_servicio"
              inputMode="numeric"
              value={valorServicio}
              onChange={(e) => setValorServicio(e.target.value)}
              placeholder="100000"
            />
          </Field>
          <Field label="Valor a pagar" htmlFor="valor_a_pagar" hint="Déjalo vacío si es igual al valor del servicio.">
            <Input
              id="valor_a_pagar"
              name="valor_a_pagar"
              inputMode="numeric"
              value={valorAPagar}
              onChange={(e) => setValorAPagar(e.target.value)}
              placeholder="60000"
            />
          </Field>
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
            <span className={`tabular-nums ${utilidad < 0 ? "text-red-600" : "text-green-700"}`}>
              {formatCLP(utilidad)}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facturación y estado</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="N° de factura" htmlFor="numero">
            <Input
              id="numero"
              name="numero"
              defaultValue={factura?.numero ?? ""}
              placeholder="465"
            />
          </Field>
          <Field label="Estado" htmlFor="estado">
            <Select id="estado" name="estado" defaultValue={factura?.estado ?? "en_proceso"}>
              {Object.entries(FACTURA_ESTADOS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de pago" htmlFor="fecha_pago" hint="Se completa sola al marcar como pagada.">
            <Input
              id="fecha_pago"
              name="fecha_pago"
              type="date"
              defaultValue={factura?.fecha_pago ? toInputDate(factura.fecha_pago) : ""}
            />
          </Field>

          <div>
            <p className="mb-1.5 block text-sm font-medium">PDF de la factura (opcional)</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={handleFile}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4" />
                {uploading ? "Subiendo…" : "Adjuntar"}
              </Button>
              {archivoUrl ? (
                <a
                  href={archivoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  Ver adjunto
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-muted">
                  <Paperclip className="h-4 w-4" />
                  Sin archivo
                </span>
              )}
            </div>
            {uploadError ? (
              <p className="mt-1 text-xs text-red-600">{uploadError}</p>
            ) : null}
          </div>

          <Field label="Notas" htmlFor="notas" className="sm:col-span-2">
            <Textarea id="notas" name="notas" defaultValue={factura?.notas ?? ""} rows={2} />
          </Field>
        </CardBody>
      </Card>

      {state.error ? (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || uploading}>
          <Save className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar factura"}
        </Button>
        <Link href="/facturas" className={buttonClass({ variant: "outline" })}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
