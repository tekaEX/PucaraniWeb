"use client";

// Lo que Starken liquidó DE VERDAD en el mes, contra lo que el panel estimó.
//
// Vivía dentro del diálogo de reglas de pago, y son dos cosas distintas: la
// regla es cuánto se le paga al conductor, esto es cuánto entró. Se juntaban
// solo porque las dos se configuraban en la misma pantalla vieja.
//
// Sirven para lo mismo una sola vez: el número de abajo —a cuánto salió cada
// entrega según lo que llegó— es con el que se calibra el valor por entrega de
// la regla. Por eso ese dato se muestra acá y no allá: es la conclusión de esta
// comparación, no un ajuste.

import { useActionState, useState } from "react";
import { Scale, TrendingUp } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { formatCLP, formatNumber } from "@/lib/format";
import type { EncomiendaIngresoReal } from "@/types/db";
import { guardarIngresoReal, type FormState } from "./actions";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export type IngresosDelPeriodo = {
  /** Lo que el panel estima para el periodo en pantalla. */
  estimado: number;
  /** Entregas del periodo, para poder decir a cuánto salió cada una. */
  entregas: number;
  /** Filas de ingreso real que caen en el periodo (una por mes). */
  reales: EncomiendaIngresoReal[];
  /** Si la tabla todavía no existe en la base (falta correr la 0029). */
  error: string | null;
};

export function CompararIngresos({
  ingresos,
  anio,
  mes,
}: {
  ingresos: IngresosDelPeriodo;
  anio: number;
  /** Mes del periodo en pantalla, o null en la vista de año completo. */
  mes: number | null;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button onClick={() => setAbierto(true)} variant="secondary">
        <Scale className="h-4 w-4" />
        Comparar ingresos
      </Button>

      {abierto ? (
        <Dialogo
          titulo="Comparar ingresos"
          descripcion="Lo que estimó el panel contra lo que Starken liquidó de verdad."
          ancho="2xl"
          onCerrar={() => setAbierto(false)}
        >
          <Comparacion ingresos={ingresos} anio={anio} mes={mes} />
        </Dialogo>
      ) : null}
    </>
  );
}

function Comparacion({
  ingresos,
  anio,
  mes,
}: {
  ingresos: IngresosDelPeriodo;
  anio: number;
  mes: number | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(guardarIngresoReal, {});
  // En la vista de año no hay un mes al que imputar: se elige. Por defecto, el
  // último que ya tiene algo cargado, o enero.
  const [mesElegido, setMesElegido] = useState(mes ?? ingresos.reales.at(-1)?.mes ?? 1);
  const mesActivo = mes ?? mesElegido;

  const yaCargado = ingresos.reales.find((r) => r.mes === mesActivo) ?? null;
  const [monto, setMonto] = useState(yaCargado ? String(yaCargado.monto) : "");
  // Al cambiar de mes hay que traer lo de ESE mes, no dejar en el campo lo que
  // se estaba escribiendo para el anterior. Se ajusta durante el render y no en
  // un efecto: así el campo ya sale con el valor correcto en el mismo dibujado
  // en que cambia el mes, sin un cuadro intermedio mostrando el importe del mes
  // que se acaba de dejar.
  const [mesEnElCampo, setMesEnElCampo] = useState(mesActivo);
  if (mesEnElCampo !== mesActivo) {
    setMesEnElCampo(mesActivo);
    setMonto(yaCargado ? String(yaCargado.monto) : "");
  }

  const totalReal = ingresos.reales.reduce((a, r) => a + r.monto, 0);
  const hayReal = ingresos.reales.length > 0;
  const diferencia = hayReal ? totalReal - ingresos.estimado : 0;
  // Cuánto habría que poner en "valor por entrega" para que el estimado hubiera
  // dado justo. Es el número por el que se hace todo esto.
  const valorQueCuadraria =
    hayReal && ingresos.entregas > 0 ? Math.round(totalReal / ingresos.entregas) : null;

  return (
    <>
      {ingresos.error ? (
        <p className="mb-4 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn">
          Todavía no se puede guardar: falta correr la migración{" "}
          <code className="font-mono">0029</code> en Supabase. ({ingresos.error})
        </p>
      ) : null}

      <dl className="mb-4 grid gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-soft sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Estimado</dt>
          <dd className="font-semibold tabular-nums">{formatCLP(ingresos.estimado)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Real</dt>
          <dd className="font-semibold tabular-nums text-ok">
            {hayReal ? formatCLP(totalReal) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Diferencia</dt>
          <dd
            className={`font-semibold tabular-nums ${
              !hayReal ? "text-muted" : diferencia >= 0 ? "text-ok" : "text-danger"
            }`}
          >
            {hayReal ? `${diferencia >= 0 ? "+" : "−"}${formatCLP(Math.abs(diferencia))}` : "—"}
          </dd>
        </div>
      </dl>

      {valorQueCuadraria != null ? (
        <p className="mb-4 rounded-lg border border-info/25 bg-info-bg px-3 py-2 text-xs text-info">
          Con {formatNumber(ingresos.entregas)} entrega
          {ingresos.entregas === 1 ? "" : "s"}, lo que entró da{" "}
          <strong>{formatCLP(valorQueCuadraria)} por entrega</strong>. Si la estimación te queda
          lejos seguido, ese es el número a poner en la regla de pago.
        </p>
      ) : null}

      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="anio" value={anio} />
        <input type="hidden" name="mes" value={mesActivo} />

        {mes === null ? (
          <Field label="Mes" htmlFor="mes_elegido">
            <Select
              id="mes_elegido"
              value={mesElegido}
              onChange={(e) => setMesElegido(Number(e.target.value))}
            >
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>
                  {nombre} {anio}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Mes">
            <p className="flex h-[42px] items-center px-1 text-sm capitalize">
              {MESES[mes - 1]} {anio}
            </p>
          </Field>
        )}

        <Field
          label="Lo que entró"
          htmlFor="monto"
          hint={yaCargado ? "Ya cargado: al guardar se reemplaza" : undefined}
        >
          <MoneyInput id="monto" name="monto" value={monto} onChange={setMonto} placeholder="0" />
        </Field>

        {/* A lo ancho de la caja: el mes y el monto son dos campos cortos que
            entran uno al lado del otro, pero la nota es texto libre y quedaba
            embutida en media columna con un hueco vacío al lado. */}
        <Field
          label="Nota"
          htmlFor="nota"
          hint="Opcional — nº de liquidación, si es parcial…"
          className="sm:col-span-2"
        >
          <Textarea
            // Es un campo no controlado: sin la key se quedaría mostrando la
            // nota del mes anterior al cambiar de mes.
            key={mesActivo}
            id="nota"
            name="nota"
            rows={2}
            defaultValue={yaCargado?.nota ?? ""}
            placeholder="De dónde salió este número"
          />
        </Field>

        {/* Guardar contra el borde derecho, como en todos los formularios de
            encomiendas: es la esquina donde cae el pulgar y donde se lo busca.
            El aviso se va al otro extremo con mr-auto para no correrlo. */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
          {state.error ? (
            <p className="mr-auto rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? <p className="mr-auto text-sm text-ok">Ingreso guardado.</p> : null}
          <Button type="submit" disabled={pending}>
            <TrendingUp className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar ingreso del mes"}
          </Button>
        </div>
      </form>
    </>
  );
}
