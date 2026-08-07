"use client";

// Ajustes de encomiendas, en un diálogo sobre el propio panel.
//
// Antes esto era la página /encomiendas/configuracion. Se trajo acá porque las
// tres cosas que se editan se deciden MIRANDO los números del mes: a cuánto se
// valora una entrega se ajusta comparando el estimado con lo que Starken pagó
// de verdad, y cuánto se le paga al conductor se decide viendo cuánto entró.
// Mandar a otra pantalla obligaba a memorizar las cifras o a ir y volver.

import { useActionState, useState } from "react";
import { Save, Settings, TrendingUp } from "lucide-react";
import { Dialogo } from "@/components/ui/dialogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCLP, formatDate, formatNumber } from "@/lib/format";
import { valorPedido } from "@/lib/encomiendas/pago";
import { ENCOMIENDA_TIPO_PAGO, type EncomiendaTipoPago } from "@/types/db";
import type { EncomiendaIngresoReal, EncomiendaReglaPago } from "@/types/db";
import { guardarIngresoReal, guardarReglaPago, type FormState } from "./actions";

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

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] bg-white p-5 shadow-soft">
      <h3 className="font-semibold">{titulo}</h3>
      {descripcion ? <p className="mt-0.5 text-xs text-muted">{descripcion}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ConfiguracionEncomiendas({
  reglas,
  ingresos,
  anio,
  mes,
}: {
  reglas: EncomiendaReglaPago[];
  ingresos: IngresosDelPeriodo;
  anio: number;
  /** Mes del periodo en pantalla, o null en la vista de año completo. */
  mes: number | null;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      {/* Mismo tamaño que "Actividad por día", que es su vecino en la cabecera:
          aquel usa buttonClass({variant:"secondary"}) sin tamaño, o sea el "md"
          por defecto. Este traía size="sm" y quedaba un escalón más chico al
          lado. */}
      <Button onClick={() => setAbierto(true)} variant="secondary">
        <Settings className="h-4 w-4" />
        Reglas de pago
      </Button>

      {abierto ? (
        <Dialogo
          titulo="Reglas de pago e ingresos"
          descripcion="Cuánto se estima que entra por entrega, cuánto se le paga al conductor y cuánto entró de verdad."
          ancho="2xl"
          onCerrar={() => setAbierto(false)}
        >
          <div className="space-y-4">
            <IngresosReales ingresos={ingresos} anio={anio} mes={mes} />
            <NuevaRegla vigente={reglas[0] ?? null} />
            <ReglasVigentes reglas={reglas} />
          </div>
        </Dialogo>
      ) : null}
    </>
  );
}

// ----------------------------------------------------------------------------
// Lo que entró de verdad
// ----------------------------------------------------------------------------
function IngresosReales({
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
    <Seccion
      titulo="Ingresos reales"
      descripcion="Lo que Starken liquidó de verdad, para contrastarlo con lo estimado."
    >
      {ingresos.error ? (
        <p className="mb-4 rounded-lg border border-warn/25 bg-warn-bg px-3 py-2 text-xs text-warn">
          Todavía no se puede guardar: falta correr la migración{" "}
          <code className="font-mono">0029</code> en Supabase. ({ingresos.error})
        </p>
      ) : null}

      <dl className="mb-4 grid gap-2 rounded-xl bg-background px-4 py-3 text-sm sm:grid-cols-3">
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
          lejos seguido, ese es el número a poner abajo.
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
            encomiendas (el diálogo de "Agregar día", el de pedido del chofer):
            es la esquina donde cae el pulgar y donde se lo busca. El aviso se
            va al otro extremo con mr-auto para no correrlo de lugar. */}
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
    </Seccion>
  );
}

// ----------------------------------------------------------------------------
// Nueva regla de pago
// ----------------------------------------------------------------------------
function NuevaRegla({ vigente }: { vigente: EncomiendaReglaPago | null }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(guardarReglaPago, {});
  const [tipoPago, setTipoPago] = useState<EncomiendaTipoPago>(
    vigente?.tipo_pago ?? "porcentaje",
  );
  // Los campos arrancan con lo que rige hoy: casi siempre se cambia UNA cosa
  // (el valor por entrega, el fijo diario) y volver a teclear todo lo demás es
  // la forma más fácil de guardar una regla distinta a la que se quería.
  const [valorPedidoTexto, setValorPedidoTexto] = useState(String(valorPedido(vigente)));
  const [valorPago, setValorPago] = useState(
    vigente && vigente.tipo_pago === "monto_fijo" ? String(vigente.valor_pago) : "",
  );
  const [montoDia, setMontoDia] = useState(vigente ? String(vigente.monto_dia) : "");
  const [bonoMonto, setBonoMonto] = useState(
    vigente?.bono_monto != null ? String(vigente.bono_monto) : "",
  );

  return (
    <Seccion
      titulo={vigente ? "Cambiar las reglas" : "Configurar el pago"}
      descripcion="Se guarda como una regla nueva vigente desde hoy. Las anteriores se conservan para no alterar lo ya liquidado."
    >
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Ingreso aproximado por entrega"
          htmlFor="valor_pedido"
          hint="Lo que se estima que entra por cada paquete entregado"
        >
          <MoneyInput
            id="valor_pedido"
            name="valor_pedido"
            value={valorPedidoTexto}
            onChange={setValorPedidoTexto}
            placeholder="950"
          />
        </Field>
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
          hint={
            tipoPago === "porcentaje"
              ? "Del ingreso estimado, o sea del valor por entrega de arriba"
              : undefined
          }
        >
          {tipoPago === "porcentaje" ? (
            <Input
              id="valor_pago"
              name="valor_pago"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={vigente?.tipo_pago === "porcentaje" ? vigente.valor_pago : undefined}
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
          <Input
            id="meta_entregas_dia"
            name="meta_entregas_dia"
            type="number"
            min={1}
            defaultValue={vigente?.meta_entregas_dia ?? undefined}
          />
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

        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
          {state.error ? (
            <p className="mr-auto rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? <p className="mr-auto text-sm text-ok">Regla guardada.</p> : null}
          <Button type="submit" disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? "Guardando…" : "Guardar regla"}
          </Button>
        </div>
      </form>
    </Seccion>
  );
}

// ----------------------------------------------------------------------------
// Historial
// ----------------------------------------------------------------------------
function ReglasVigentes({ reglas }: { reglas: EncomiendaReglaPago[] }) {
  if (reglas.length === 0) return null;

  return (
    <Seccion titulo="Reglas anteriores" descripcion="La primera es la que rige hoy.">
      <ul className="divide-y divide-border">
        {reglas.map((r, i) => (
          <li key={r.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {formatCLP(valorPedido(r))} por entrega
                {r.monto_dia > 0 ? ` · ${formatCLP(r.monto_dia)} por día trabajado` : ""}
              </p>
              <p className="text-xs text-muted">
                Al conductor:{" "}
                {r.tipo_pago === "porcentaje"
                  ? `${r.valor_pago}% por pedido entregado`
                  : `${formatCLP(r.valor_pago)} por pedido entregado`}
                {r.meta_entregas_dia
                  ? ` · bono de ${formatCLP(r.bono_monto ?? 0)} al llegar a ${r.meta_entregas_dia}/día`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-muted">Vigente desde {formatDate(r.vigente_desde)}</p>
            </div>
            {i === 0 ? <Badge tone="green">Vigente</Badge> : null}
          </li>
        ))}
      </ul>
    </Seccion>
  );
}
