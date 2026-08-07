"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Plus, Trash2, Check, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { EstadoSelector, type EstadoOpcion } from "@/components/ui/estado-selector";
import {
  actualizarCotizacion,
  actualizarEstadoCotizacion,
  type FormState,
} from "./actions";
import { formatCLP, toInputDate } from "@/lib/format";
import { formatMiles } from "@/components/ui/money-input";
import type { Empresa } from "@/types/db";
import type { CotRow } from "./cotizacion-accordion";

// Documento editable: la misma apariencia que la vista previa del PDF
// (cotizacion-preview.tsx), pero cada texto se edita en el lugar y se
// autoguarda al salir del campo.

const ESTADOS_COTIZACION: EstadoOpcion[] = [
  { value: "borrador", label: "Borrador", tone: "gray" },
  { value: "enviada", label: "Enviada", tone: "blue" },
  { value: "aceptada", label: "Aceptada", tone: "green" },
  { value: "rechazada", label: "Rechazada", tone: "red" },
];

type ItemRow = {
  key: number;
  fecha: string;
  descripcion: string;
  valor_unitario: number;
};

// Campo "invisible": se ve como texto del documento hasta que lo tocas.
const invis =
  "-mx-1 rounded-md bg-transparent px-1 transition-colors hover:bg-black/[0.04] focus:bg-white focus:outline focus:outline-1 focus:outline-brand/50";

export function CotizacionEditor({
  cot,
  empresa,
  clientes,
}: {
  cot: CotRow;
  empresa: Empresa | null;
  clientes: { id: string; nombre: string; codigo: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    actualizarCotizacion,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [estadoPending, startEstado] = useTransition();

  const [items, setItems] = useState<ItemRow[]>(() =>
    [...(cot.items ?? [])]
      .sort((a, b) => a.orden - b.orden)
      .map((it, i) => ({
        key: i,
        fecha: it.fecha ? toInputDate(it.fecha) : "",
        descripcion: it.descripcion,
        valor_unitario: Number(it.valor_unitario),
      })),
  );
  const [exento, setExento] = useState(cot.exento_iva);

  function autoguardar() {
    formRef.current?.requestSubmit();
  }
  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoguardar();
  }
  // El estado se guarda con acción dedicada (no el autoguardado del documento),
  // para que no compitan y el estado no se revierta.
  function cambiarEstado(nuevo: string) {
    const fd = new FormData();
    fd.set("id", cot.id);
    fd.set("estado", nuevo);
    startEstado(() => actualizarEstadoCotizacion(fd));
  }
  function setItem(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const subtotal = items.reduce((a, it) => a + Math.round(it.valor_unitario), 0);
  const iva = exento ? 0 : Math.round(subtotal * 0.19);
  const total = subtotal + iva;

  const logo = empresa?.logo_url || "/logo.png";
  const empresaLine = [empresa?.direccion, empresa?.ciudad]
    .filter(Boolean)
    .join(", ");

  return (
    <form ref={formRef} action={formAction} onBlur={onBlurForm}>
      <input type="hidden" name="id" value={cot.id} />
      <input
        type="hidden"
        name="itemsJson"
        value={JSON.stringify(
          items.map(({ fecha, descripcion, valor_unitario }) => ({
            fecha,
            descripcion,
            valor_unitario,
          })),
        )}
      />

      {/* Estado + señal de autoguardado */}
      <div className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <EstadoSelector
          name="estado"
          defaultValue={cot.estado}
          opciones={ESTADOS_COTIZACION}
          onCambio={cambiarEstado}
          pending={estadoPending}
        />
        <span className="flex h-4 items-center gap-1.5 text-xs text-muted">
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Guardando…
            </>
          ) : state.ok ? (
            <>
              <Check className="h-3.5 w-3.5 text-ok" />
              Guardado
            </>
          ) : (
            "Edita directo sobre el documento"
          )}
        </span>
      </div>

      {/* ——— El documento (mismo aspecto que el PDF) ——— */}
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-white p-5 shadow-sm sm:p-7">
        {/* Encabezado */}
        <div className="flex items-center justify-between rounded-lg bg-brand px-4 py-3 text-white sm:px-5 sm:py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Logo" className="h-14 w-auto rounded bg-white p-1" />
          <div className="text-2xl font-bold sm:text-3xl">Presupuesto</div>
        </div>

        {/* Datos empresa / meta */}
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div className="text-sm">
            <div className="font-semibold">{empresa?.nombre ?? "Transportes Pucarani"}</div>
            {empresa?.representante ? (
              <div className="text-muted">{empresa.representante}</div>
            ) : null}
            {empresaLine ? <div className="text-muted">{empresaLine}</div> : null}
            {empresa?.giro ? <div className="text-muted">Giro: {empresa.giro}</div> : null}
            {empresa?.telefono ? (
              <div className="text-muted">Teléfono: {empresa.telefono}</div>
            ) : null}
            {empresa?.rut ? <div className="text-muted">RUT: {empresa.rut}</div> : null}
          </div>
          <div className="space-y-0.5 text-sm sm:text-right">
            <div>
              <span className="text-muted">N°: </span>
              <span className="font-semibold">{cot.numero}</span>
            </div>
            <div>
              <span className="text-muted">Fecha: </span>
              <input
                type="date"
                name="fecha"
                defaultValue={toInputDate(cot.fecha)}
                className={`${invis} font-semibold`}
              />
            </div>
            <div>
              <span className="text-muted">Válido hasta: </span>
              <input
                type="date"
                name="fecha_validez"
                defaultValue={cot.fecha_validez ? toInputDate(cot.fecha_validez) : ""}
                className={`${invis} font-semibold`}
              />
            </div>
            <div>
              <span className="text-muted">Autor: </span>
              <input
                name="autor"
                defaultValue={cot.autor ?? ""}
                placeholder="autor"
                className={`${invis} w-32 font-semibold sm:text-right`}
              />
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div className="mt-4 rounded-lg bg-background px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted">
            Presupuesto para
          </div>
          <select
            name="cliente_id"
            defaultValue={cot.cliente_id ?? ""}
            onChange={autoguardar}
            className={`${invis} w-full max-w-md font-semibold`}
          >
            <option value="">— Sin cliente —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Título del servicio */}
        <input
          name="titulo"
          defaultValue={cot.titulo ?? ""}
          placeholder="Título del servicio (opcional)"
          className={`${invis} mt-4 w-full font-semibold`}
        />

        {/* Tabla de ítems */}
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-brand text-left text-xs text-white">
              <tr>
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="w-36 px-3 py-2 font-semibold">Fecha</th>
                <th className="px-3 py-2 font-semibold">Descripción</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">Valor</th>
                <th className="w-8 px-1 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, i) => (
                <tr key={it.key}>
                  <td className="px-3 py-2 align-top text-muted">{i + 1}</td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="date"
                      value={it.fecha}
                      onChange={(e) => setItem(i, { fecha: e.target.value })}
                      className={`${invis} w-full tabular-nums`}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <textarea
                      value={it.descripcion}
                      onChange={(e) => setItem(i, { descripcion: e.target.value })}
                      rows={Math.max(1, Math.ceil(it.descripcion.length / 60))}
                      placeholder="Descripción del servicio…"
                      className={`${invis} w-full resize-none`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right align-top">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.valor_unitario ? `$${formatMiles(it.valor_unitario)}` : ""}
                      onChange={(e) =>
                        setItem(i, {
                          valor_unitario: Number(e.target.value.replace(/\D/g, "")),
                        })
                      }
                      placeholder="$0"
                      className={`${invis} w-28 text-right tabular-nums`}
                    />
                  </td>
                  <td className="px-1 py-2 text-right align-top">
                    <button
                      type="button"
                      onClick={() =>
                        setItems((rows) => rows.filter((_, idx) => idx !== i))
                      }
                      title="Quitar línea"
                      className="text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() =>
              setItems((rows) => [
                ...rows,
                { key: Date.now(), fecha: "", descripcion: "", valor_unitario: 0 },
              ])
            }
            className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-brand hover:bg-brand-soft/50"
          >
            <Plus className="h-4 w-4" />
            Agregar línea
          </button>
        </div>

        {/* Totales */}
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-end gap-8">
            <span className="text-muted">Subtotal</span>
            <span className="w-28 text-right tabular-nums">{formatCLP(subtotal)}</span>
          </div>
          {!exento ? (
            <div className="flex justify-end gap-8">
              <span className="text-muted">IVA (19%)</span>
              <span className="w-28 text-right tabular-nums">{formatCLP(iva)}</span>
            </div>
          ) : null}
          <div className="flex justify-end gap-8 border-t border-border pt-1 text-base font-bold">
            <span>{exento ? "Total (exento de IVA)" : "Total"}</span>
            <span className="w-28 text-right tabular-nums">{formatCLP(total)}</span>
          </div>
          <div className="flex justify-end pt-1">
            <label className="flex items-center gap-2 text-xs text-muted">
              <Checkbox
                name="exento_iva"
                checked={exento}
                onChange={(e) => {
                  setExento(e.target.checked);
                  autoguardar();
                }}
              />
              Exento de IVA
            </label>
          </div>
        </div>

        {/* Nota al pie */}
        <textarea
          name="nota_pie"
          defaultValue={cot.nota_pie ?? ""}
          placeholder="Nota al pie (opcional)…"
          rows={2}
          className={`${invis} mt-5 w-full resize-none border-t border-border pt-3 text-xs text-muted`}
        />
      </div>

      {state.error ? (
        <p className="mx-auto mt-2 max-w-3xl text-sm text-danger">{state.error}</p>
      ) : null}
    </form>
  );
}
