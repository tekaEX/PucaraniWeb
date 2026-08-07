"use client";

// Cargar a mano un día que el teléfono del conductor nunca registró: se quedó
// sin batería, se reinstaló la app, o el día es anterior a que la app existiera.
// Sin esto ese día no existe para el sistema y no se le puede pagar al
// conductor, aunque haya trabajado (ver la cabecera de la migración 0028).
//
// El formulario muestra la plata ANTES de guardar —ingresos estimados y lo que
// se le va a pagar con la regla vigente a esa fecha— porque es lo que la
// persona que carga el día está tratando de decidir. Se calcula con las mismas
// funciones puras que usa el panel y que la confirmación del pago
// (lib/encomiendas/pago.ts): una sola cuenta, sin una versión "de vista previa"
// que pueda desviarse de la de verdad.

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CalendarPlus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import { formatCLP, formatDate, formatNumber } from "@/lib/format";
import {
  calcularPagoDia,
  ingresoEstimado,
  reglaVigente,
  valorPedido,
} from "@/lib/encomiendas/pago";
import type { EncomiendaReglaPago } from "@/types/db";
import { agregarDiaManual } from "./actions";

export type ChoferOpcion = { id: string; nombre: string };

/** Lo que ya hay cargado en el periodo que se está mirando, para poder avisar
 *  que lo nuevo se SUMA en vez de reemplazar. Solo cubre el periodo en pantalla:
 *  si se elige una fecha de otro mes no hay con qué comparar, y el aviso
 *  general de abajo del formulario es el que queda. */
export type DiaConocido = {
  fecha: string;
  choferId: string | null;
  entregados: number;
  omitidos: number;
  /** Cuántos de los eventos de ese día ya eran carga manual. */
  manuales: number;
  /** Total de eventos del día, para saber si la carga manual es todo o parte. */
  total: number;
};

export function AgregarDia({
  choferes,
  errorChoferes,
  reglas,
  diasConocidos,
  hoy,
}: {
  choferes: ChoferOpcion[];
  /** Mensaje si la lista de conductores no se pudo leer. Una lista vacía por
   *  un error y una lista vacía porque nadie tiene la categoría se veían igual,
   *  y el aviso afirmaba lo segundo sin saberlo. */
  errorChoferes?: string | null;
  reglas: EncomiendaReglaPago[];
  diasConocidos: DiaConocido[];
  /** Fecha de hoy en Chile, calculada en el servidor: el reloj del navegador
   *  puede estar en otra zona y el tope del campo quedaría corrido un día. */
  hoy: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [listo, setListo] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={() => {
          setListo(false);
          setAbierto(true);
        }}
        size="sm"
        variant="secondary"
        disabled={choferes.length === 0}
        title={
          errorChoferes
            ? `No se pudo leer la lista de conductores: ${errorChoferes}`
            : choferes.length === 0
              ? "Ningún conductor tiene la categoría 'Encomiendas' asignada."
              : undefined
        }
      >
        <CalendarPlus className="h-4 w-4" />
        Agregar día
      </Button>
      {listo ? <p className="text-xs text-ok">Día cargado.</p> : null}

      {abierto ? (
        <DialogoAgregarDia
          choferes={choferes}
          reglas={reglas}
          diasConocidos={diasConocidos}
          hoy={hoy}
          onCerrar={() => setAbierto(false)}
          onGuardado={() => {
            setAbierto(false);
            setListo(true);
          }}
        />
      ) : null}
    </div>
  );
}

function DialogoAgregarDia({
  choferes,
  reglas,
  diasConocidos,
  hoy,
  onCerrar,
  onGuardado,
}: {
  choferes: ChoferOpcion[];
  reglas: EncomiendaReglaPago[];
  diasConocidos: DiaConocido[];
  hoy: string;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [choferId, setChoferId] = useState(choferes[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoy);
  const [entregados, setEntregados] = useState("");
  const [omitidos, setOmitidos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCerrar]);

  // Number("") es 0, que es justo lo que corresponde: un campo en blanco son
  // cero entregas. Un valor negativo se descarta acá y también en el servidor.
  const nEntregados = Math.max(0, Math.trunc(Number(entregados) || 0));
  const nOmitidos = Math.max(0, Math.trunc(Number(omitidos) || 0));

  const conteo = { entregados: nEntregados, omitidos: nOmitidos };
  const regla = reglaVigente(reglas, choferId, fecha);
  const pago = calcularPagoDia(conteo, regla);
  const ingresos = ingresoEstimado(nEntregados, valorPedido(regla));

  // Lo que ya hay registrado de ese (conductor, día). Si viene del teléfono, lo
  // que se cargue acá se suma; si ya era carga manual, la reemplaza. Las dos
  // cosas hay que decirlas antes de apretar Guardar, no después.
  const yaHay = diasConocidos.find((d) => d.fecha === fecha && d.choferId === choferId);
  const delTelefono = yaHay ? yaHay.total - yaHay.manuales : 0;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await agregarDiaManual({}, datos);
      if (res.error) setError(res.error);
      else onGuardado();
    });
  }

  // Portal a document.body por el mismo motivo que ui/modal.tsx: un overlay
  // "fixed inset-0" dentro de un ancestro con transform/animación se confina al
  // área de ese ancestro y deja franjas de la pantalla sin cubrir.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Agregar día trabajado"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[18px] bg-white shadow-card"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-6">
          <h2 className="text-lg font-semibold">Agregar día trabajado</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-col">
          <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-6">
            <Field label="Fecha" htmlFor="fecha">
              <Input
                id="fecha"
                name="fecha"
                type="date"
                value={fecha}
                max={hoy}
                onChange={(e) => setFecha(e.target.value)}
                required
              />
            </Field>
            <Field label="Conductor" htmlFor="chofer_id">
              <Select
                id="chofer_id"
                name="chofer_id"
                value={choferId}
                onChange={(e) => setChoferId(e.target.value)}
                required
              >
                {choferes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Entregados" htmlFor="entregados">
              <Input
                id="entregados"
                name="entregados"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={entregados}
                onChange={(e) => setEntregados(e.target.value)}
              />
            </Field>
            <Field label="No entregados" htmlFor="omitidos" hint="Opcional">
              <Input
                id="omitidos"
                name="omitidos"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="0"
                value={omitidos}
                onChange={(e) => setOmitidos(e.target.value)}
              />
            </Field>

            <dl className="rounded-xl bg-background px-4 py-3 text-sm sm:col-span-2">
              <div className="flex items-center justify-between">
                <dt className="text-muted">Ingresos estimados</dt>
                <dd className="font-semibold tabular-nums text-ok">{formatCLP(ingresos)}</dd>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-divider pt-1.5">
                <dt className="text-muted">A pagar al conductor</dt>
                <dd className="font-semibold tabular-nums">
                  {regla ? formatCLP(pago.total) : "—"}
                </dd>
              </div>
              <p className="mt-2 text-xs text-muted">
                {regla ? (
                  <>
                    Estimado a {formatCLP(valorPedido(regla))} por entrega · pago ={" "}
                    {formatCLP(pago.base)} por pedidos + {formatCLP(pago.dia)} por el día
                    {pago.bono > 0 ? ` + ${formatCLP(pago.bono)} de bono` : ""}
                  </>
                ) : (
                  <span className="text-danger">
                    No hay ninguna regla de pago vigente al {formatDate(fecha)}. El día se guarda
                    igual, pero va a quedar como “Sin regla” hasta que configures una.
                  </span>
                )}
              </p>
            </dl>

            {nEntregados + nOmitidos === 0 ? (
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted sm:col-span-2">
                Sin entregas ni omisiones, el día se registra como “salió a repartir”: cuenta como
                día trabajado y paga el fijo diario, sin sumar nada por pedido.
              </p>
            ) : null}

            {delTelefono > 0 ? (
              <p className="rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn sm:col-span-2">
                Este día ya tiene {formatNumber(delTelefono)} registro
                {delTelefono === 1 ? "" : "s"} enviados desde el teléfono (
                {formatNumber(yaHay?.entregados ?? 0)} entregado
                {(yaHay?.entregados ?? 0) === 1 ? "" : "s"}). Lo que cargues acá se SUMA a eso.
              </p>
            ) : null}

            {yaHay && yaHay.manuales > 0 ? (
              <p className="rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info sm:col-span-2">
                Ya hay una carga manual de {formatNumber(yaHay.manuales)} registro
                {yaHay.manuales === 1 ? "" : "s"} para este día: al guardar se reemplaza por lo que
                pongas ahora.
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger sm:col-span-2">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-divider px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={onCerrar} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !choferId}>
              <Save className="h-4 w-4" />
              {pending ? "Guardando…" : "Guardar día"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
