"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { guardarFactura, type FormState } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MoneyInput, formatMiles } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Upload, Paperclip, FileText } from "lucide-react";
import { toInputDate, todayInput, formatCLP, formatDate } from "@/lib/format";
import { TIPOS_DTE } from "@/types/db";
import type { FacturaConRelaciones, FacturaEstado } from "@/types/db";
import { desglosarTotal } from "@/lib/totales";
import { EstadoGuardado } from "@/components/ui/estado-guardado";

type ClienteOpt = { id: string; nombre: string; codigo: string | null };
export type ViajeOpt = {
  id: string;
  cliente_id: string;
  descripcion: string;
  fecha_inicio: string;
  valor: number;
};

function toNum(v: string): number {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function FacturaForm({
  clientes,
  viajesDisponibles,
  factura,
  foliosSugeridos,
  emisionElectronica = false,
}: {
  clientes: ClienteOpt[];
  /** Viajes por facturar (más los ya incluidos en esta factura, si edita). */
  viajesDisponibles: ViajeOpt[];
  factura?: FacturaConRelaciones;
  /** Próximo folio por tipo de documento: { "33": 471, "34": 1290 }. */
  foliosSugeridos?: Record<string, number>;
  /** true cuando el SII está configurado y el folio lo va a entregar el CAF. */
  emisionElectronica?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarFactura,
    {},
  );

  const [clienteId, setClienteId] = useState(factura?.cliente_id ?? "");
  const [seleccion, setSeleccion] = useState<string[]>(
    factura?.viajes.map((v) => v.id) ?? [],
  );
  const [tipoDte, setTipoDte] = useState(String(factura?.tipo_dte ?? 34));

  // El folio se propone solo: es el que sigue al último emitido de ESE tipo.
  // Nadie se acuerda de memoria en qué número va cada talonario, y el dato ya
  // está en la base. Se propone, no se impone: sigue siendo un campo editable,
  // porque una factura vieja que se carga tarde lleva el folio que le tocó.
  //
  // Los folios corren por tipo de documento, así que cambiar el tipo cambia la
  // sugerencia, salvo que ya se haya escrito un folio a mano.
  //
  // PERO con el SII configurado la sugerencia deja de proponerse, y esa es la
  // parte importante: el botón "Emitir" solo aparece en un borrador SIN folio,
  // así que un folio pre-cargado apagaba la emisión electrónica sin decir nada
  // —la factura nacía con número y el botón no salía nunca—. Además "el último
  // + 1" es adivinar lo que tomar_folio() sabe con certeza: no conoce el rango
  // del CAF, no tiene lock, y dos personas facturando a la vez reciben el
  // mismo número. El campo sigue estando para cargar documentos ya emitidos
  // fuera del sistema; lo que cambia es que ya no viene relleno.
  const sugerido = (tipo: string) =>
    emisionElectronica ? "" : String(foliosSugeridos?.[tipo] ?? "");

  const [folio, setFolio] = useState<string>(
    factura?.folio ? String(factura.folio) : sugerido(String(factura?.tipo_dte ?? 34)),
  );
  const [folioTocado, setFolioTocado] = useState(false);

  function onTipoDteChange(value: string) {
    setTipoDte(value);
    if (!factura && !folioTocado) setFolio(sugerido(value));
  }
  const [estado, setEstado] = useState<FacturaEstado>(factura?.estado ?? "borrador");
  const [fechaPago, setFechaPago] = useState(
    factura?.fecha_pago ? toInputDate(factura.fecha_pago) : "",
  );
  // "" = usar la suma de los viajes seleccionados.
  const [totalManual, setTotalManual] = useState(
    factura ? String(factura.total) : "",
  );
  const [archivoPath, setArchivoPath] = useState(factura?.archivo_path ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Autoguardado al editar (viaje/factura existente); botón solo al crear.
  const formRef = useRef<HTMLFormElement>(null);
  const editando = !!factura;

  // La pastilla del acordeón también cambia estado/pago: re-sincroniza al
  // llegar props nuevas (patrón "ajustar estado en el render") para no pisar
  // ese cambio al autoguardar. https://react.dev/learn/you-might-not-need-an-effect
  const syncKey = `${factura?.estado ?? ""}|${factura?.fecha_pago ?? ""}`;
  const [syncPrev, setSyncPrev] = useState(syncKey);
  if (factura && syncKey !== syncPrev) {
    setSyncPrev(syncKey);
    setEstado(factura.estado);
    setFechaPago(factura.fecha_pago ? toInputDate(factura.fecha_pago) : "");
  }

  function autoguardar() {
    if (!editando || uploading) return;
    formRef.current?.requestSubmit();
  }
  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoguardar();
  }

  const visibles = viajesDisponibles.filter((v) => v.cliente_id === clienteId);
  const seleccionVisible = seleccion.filter((id) => visibles.some((v) => v.id === id));
  const suma = visibles
    .filter((v) => seleccionVisible.includes(v.id))
    .reduce((acc, v) => acc + Number(v.valor), 0);

  const total = totalManual.trim() !== "" ? toNum(totalManual) : suma;
  const esAfecta = tipoDte === "33";
  // El camino inverso del de cotizaciones: acá se conoce el total con IVA y hay
  // que descomponerlo. Vive en lib/totales.ts junto al directo.
  const { subtotal: neto, iva } = desglosarTotal(total, esAfecta);

  function onClienteChange(value: string) {
    setClienteId(value);
    // Los viajes de otro cliente no pueden quedar seleccionados.
    setSeleccion((sel) =>
      sel.filter((id) => viajesDisponibles.some((v) => v.id === id && v.cliente_id === value)),
    );
  }

  function toggleViaje(id: string) {
    setSeleccion((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const supabase = createClient();
      // El adjunto se guarda en la carpeta de la empresa:
      // `<empresa_id>/factura-<timestamp>.pdf`. La policy del bucket privado
      // (migración 0050) exige esa primera carpeta, así que sin el prefijo la
      // subida se rechaza. Antes el path era plano y `adjuntos` era el único
      // rincón compartido que quedaba: cualquier admin podía listar y firmar
      // los PDF de las facturas de otra empresa.
      //
      // La empresa se pregunta acá en vez de recibirla por prop porque la
      // policy `empresa_read_auth` deja ver una sola fila —la propia—, así que
      // este select devuelve la correcta sin pasar por los cuatro lugares que
      // montan este formulario.
      const { data: empresa } = await supabase.from("empresa").select("id").maybeSingle();
      if (!empresa) throw new Error("No se pudo determinar la empresa de tu cuenta.");

      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${empresa.id}/factura-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("adjuntos")
        .upload(path, file, { upsert: true });
      if (error) throw error;
      // El bucket es privado: guardamos la RUTA y abrimos con URL firmada.
      setArchivoPath(path);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  async function verAdjunto() {
    if (!archivoPath) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("adjuntos")
      .createSignedUrl(archivoPath, 60 * 60);
    if (error || !data?.signedUrl) {
      setUploadError("No se pudo abrir el adjunto.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onBlur={editando ? onBlurForm : undefined}
      className="space-y-4"
    >
      {factura ? <input type="hidden" name="id" value={factura.id} /> : null}
      <input type="hidden" name="cliente_id" value={clienteId} />
      <input type="hidden" name="viajes" value={JSON.stringify(seleccionVisible)} />
      <input type="hidden" name="neto" value={neto} />
      <input type="hidden" name="iva" value={iva} />
      <input type="hidden" name="total" value={total} />
      <input type="hidden" name="archivo_path" value={archivoPath} />

      {/* Dos columnas simétricas: misma altura, sin huecos. */}
      <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle>Documento</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente (receptor)" htmlFor="cliente_select">
            <Select
              id="cliente_select"
              value={clienteId}
              onChange={(e) => onClienteChange(e.target.value)}
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
          <Field label="Tipo de documento" htmlFor="tipo_dte">
            <Select
              id="tipo_dte"
              name="tipo_dte"
              value={tipoDte}
              onChange={(e) => onTipoDteChange(e.target.value)}
            >
              {Object.entries(TIPOS_DTE).map(([value, label]) => (
                <option key={value} value={value}>
                  {value} — {label}
                </option>
              ))}
            </Select>
          </Field>

          {/* Estado, folio y fecha van en una sola fila que ocupa la tarjeta
              entera. Antes Estado se llevaba media tarjeta y los otros dos se
              repartían la otra mitad: la fecha quedaba tan angosta que el
              navegador la recortaba a "dd - r". El minmax le garantiza a la
              fecha el ancho de "dd-mm-aaaa" más el ícono del calendario, pase
              lo que pase con el resto. */}
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_minmax(9.5rem,1fr)]">
            <Field label="Estado" htmlFor="estado">
              <Select
                id="estado"
                name="estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value as FacturaEstado)}
              >
                <option value="borrador">Borrador</option>
                <option value="emitida">Emitida</option>
                {factura ? <option value="anulada">Anulada</option> : null}
              </Select>
            </Field>
            <Field
              label="Folio (N°)"
              htmlFor="folio"
              hint={
                !factura && !folioTocado && folio
                  ? "Sigue al último emitido de este tipo."
                  : emisionElectronica && !factura && !folio
                    ? "Déjalo vacío: lo asigna el SII al emitir. Solo se escribe para cargar una factura ya emitida fuera del sistema."
                    : undefined
              }
            >
              <Input
                id="folio"
                name="folio"
                inputMode="numeric"
                value={folio}
                onChange={(e) => {
                  setFolio(e.target.value);
                  setFolioTocado(true);
                }}
                placeholder="465"
                required={estado === "emitida"}
              />
            </Field>
            <Field label="Fecha de emisión" htmlFor="fecha_emision">
              <Input
                id="fecha_emision"
                name="fecha_emision"
                type="date"
                defaultValue={
                  factura?.fecha_emision
                    ? toInputDate(factura.fecha_emision)
                    : estado === "emitida"
                      ? todayInput()
                      : ""
                }
                required={estado === "emitida"}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Viajes incluidos</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {!clienteId ? (
            <p className="text-sm text-muted">Elige primero el cliente para ver sus viajes por facturar.</p>
          ) : visibles.length === 0 ? (
            <p className="text-sm text-muted">
              Este cliente no tiene viajes por facturar.{" "}
              <Link href="/viajes/nueva" className="text-brand hover:underline">
                Registra un viaje
              </Link>{" "}
              y márcalo como realizado.
            </p>
          ) : (
            <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {visibles.map((v) => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-background/60"
                >
                  <Checkbox
                    checked={seleccionVisible.includes(v.id)}
                    onChange={() => toggleViaje(v.id)}
                  />
                  <span className="w-24 shrink-0 text-muted">{formatDate(v.fecha_inicio)}</span>
                  <span className="flex-1">{v.descripcion}</span>
                  <span className="tabular-nums">{formatCLP(v.valor)}</span>
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-muted">
            Seleccionados: {seleccionVisible.length} · Suma: {formatCLP(suma)}
          </p>
        </CardBody>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Montos y cobranza</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Total del documento"
            htmlFor="total_manual"
            hint="Déjalo vacío para usar la suma de los viajes seleccionados."
          >
            <MoneyInput
              id="total_manual"
              value={totalManual}
              onChange={setTotalManual}
              placeholder={suma > 0 ? formatMiles(suma) : "0"}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2 self-end text-sm">
            <div>
              <p className="text-xs text-muted">{esAfecta ? "Neto" : "Exento"}</p>
              <p className="tabular-nums font-medium">{formatCLP(neto)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">IVA</p>
              <p className="tabular-nums font-medium">{formatCLP(iva)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Total</p>
              <p className="tabular-nums font-semibold">{formatCLP(total)}</p>
            </div>
          </div>

          <Field
            label="Fecha de pago"
            htmlFor="fecha_pago"
            hint="Se registra cuando el cliente paga; déjala vacía si sigue pendiente."
          >
            <Input
              id="fecha_pago"
              name="fecha_pago"
              type="date"
              value={fechaPago}
              onChange={(e) => setFechaPago(e.target.value)}
              disabled={estado === "borrador"}
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
              {archivoPath ? (
                <button
                  type="button"
                  onClick={verAdjunto}
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  Ver adjunto
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-muted">
                  <Paperclip className="h-4 w-4" />
                  Sin archivo
                </span>
              )}
            </div>
            {uploadError ? (
              <p className="mt-1 text-xs text-danger">{uploadError}</p>
            ) : null}
          </div>

          <Field label="Notas" htmlFor="notas" className="sm:col-span-2">
            <Textarea id="notas" name="notas" defaultValue={factura?.notas ?? ""} rows={2} />
          </Field>
        </CardBody>
      </Card>
      </div>

      {state.error ? (
        <p className="rounded-lg bg-danger-bg border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      {editando ? (
        <EstadoGuardado
          pending={pending || uploading}
          ok={state.ok}
          guardando={uploading ? "Subiendo…" : "Guardando…"}
          reposo="Los cambios se guardan solos"
          className="h-5"
        />
      ) : (
        <div className="flex items-center justify-end">
          <Button type="submit" disabled={pending || uploading}>
            <Save className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar factura"}
          </Button>
        </div>
      )}
    </form>
  );
}
