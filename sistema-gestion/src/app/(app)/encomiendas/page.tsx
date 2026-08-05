import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/ui/kpi";
import { Vacio } from "@/components/ui/vacio";
import { buttonClass } from "@/components/ui/button";
import { Package, Settings, CalendarRange, Truck, Wallet, CircleDollarSign } from "lucide-react";
import { formatCLP, formatDate, formatNumber } from "@/lib/format";
import { getPeriodo, rangoPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import {
  agruparPorDia,
  calcularPagoDia,
  ingresoEstimado,
  reglaVigente,
  type ConteoDia,
  type EventoActividad,
  type PagoDesglose,
} from "@/lib/encomiendas/pago";
import { VALOR_APROXIMADO_PEDIDO } from "@/lib/encomiendas/config";
import type { EncomiendaPago, EncomiendaReglaPago } from "@/types/db";
import { ConfirmarPagos } from "./confirmar-pagos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Encomiendas" };

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Fila de encomienda_actividad (0026) con el nombre del conductor pegado. */
type EventoFila = EventoActividad & { chofer: { id: string; nombre: string } | null };

type Dia = {
  fecha: string;
  choferId: string | null;
  choferNombre: string;
  conteo: ConteoDia;
  ingresos: number;
  /** Lo que corresponde pagar según la regla vigente a esa fecha. */
  calculado: PagoDesglose;
  /** Snapshot en encomienda_pagos, si alguien ya confirmó la liquidación. */
  snapshot: EncomiendaPago | null;
  /** No hay regla de pago vigente a esa fecha: el día NO se puede liquidar. */
  sinRegla: boolean;
};

/** Lo que hay que pagar: manda lo confirmado; si no hay, la proyección. */
function pagoEfectivo(d: Dia): number {
  return d.snapshot ? d.snapshot.pago_total : d.calculado.total;
}

export default async function EncomiendasPage() {
  // Mismo periodo global que el resto de la app: el mes/año lo fija el
  // PeriodoSelector de la barra superior (cookie "periodo"), igual que en el
  // Dashboard y en Finanzas. Esta página no monta ningún selector propio.
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  const supabase = await createClient();

  // Una fila por acción en terreno (ver 0026). Se agrupan por (conductor, día)
  // acá abajo: cada grupo que existe es, por definición, un día trabajado — un
  // día en que nadie salió no tiene filas y simplemente no aparece.
  const [{ data: actividadData }, { data: reglasData }, { data: pagosData }] = await Promise.all([
    supabase
      .from("encomienda_actividad")
      .select("chofer_id, fecha, tipo, chofer:choferes(id,nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .returns<EventoFila[]>(),
    supabase.from("encomienda_reglas_pago").select("*"),
    supabase.from("encomienda_pagos").select("*").gte("fecha", desde).lte("fecha", hasta),
  ]);

  const reglas = (reglasData ?? []) as EncomiendaReglaPago[];
  const pagos = (pagosData ?? []) as EncomiendaPago[];

  const dias: Dia[] = agruparPorDia(actividadData ?? []).map((d) => {
    const regla = reglaVigente(reglas, d.choferId, d.fecha);
    return {
      fecha: d.fecha,
      choferId: d.choferId,
      choferNombre: d.eventos[0]?.chofer?.nombre ?? "Conductor eliminado",
      conteo: d.conteo,
      ingresos: ingresoEstimado(d.conteo.entregados),
      calculado: calcularPagoDia(d.conteo, regla),
      snapshot: pagos.find((p) => p.fecha === d.fecha && p.chofer_id === d.choferId) ?? null,
      sinRegla: regla == null,
    };
  });

  // Días de CALENDARIO, no filas: con dos conductores saliendo los mismos 20
  // días, el KPI diría 40 en un mes que tiene 20. El pago sí se calcula por
  // día-conductor (cada uno cobra su fijo), pero la cifra que el dueño lee acá
  // es "cuántos días hubo reparto".
  const diasCalendario = new Set(dias.map((d) => d.fecha)).size;
  const totalEntregados = dias.reduce((a, d) => a + d.conteo.entregados, 0);
  const totalIngresos = dias.reduce((a, d) => a + d.ingresos, 0);
  const totalPago = dias.reduce((a, d) => a + pagoEfectivo(d), 0);
  const promedioDia = diasCalendario > 0 ? totalEntregados / diasCalendario : 0;
  // Días trabajados que no se pueden liquidar: suman $0 al total y hay que
  // decirlo, o el "a pagar" queda corto sin que se note.
  const diasSinRegla = dias.filter((d) => d.sinRegla && !d.snapshot).length;

  // Serie del gráfico, atada al mismo periodo: en vista de MES un palo por
  // cada día del mes (los días sin actividad quedan como huecos, que es justo
  // lo que conviene ver); en vista de AÑO, uno por mes.
  const serie =
    periodo.mes === null
      ? Array.from({ length: 12 }, (_, i) => {
          const pref = `${periodo.anio}-${String(i + 1).padStart(2, "0")}`;
          return {
            clave: pref,
            etiqueta: MES_CORTO[i],
            pedidos: dias
              .filter((d) => d.fecha.startsWith(pref))
              .reduce((a, d) => a + d.conteo.entregados, 0),
          };
        })
      : Array.from({ length: new Date(periodo.anio, periodo.mes, 0).getDate() }, (_, i) => {
          const mm = String(periodo.mes).padStart(2, "0");
          const fecha = `${periodo.anio}-${mm}-${String(i + 1).padStart(2, "0")}`;
          return {
            clave: fecha,
            etiqueta: String(i + 1),
            pedidos: dias
              .filter((d) => d.fecha === fecha)
              .reduce((a, d) => a + d.conteo.entregados, 0),
          };
        });
  const maxSerie = Math.max(1, ...serie.map((s) => s.pedidos));

  // Resumen por conductor: con un solo repartidor es una fila, pero el
  // esquema ya soporta varios y la liquidación se paga por persona.
  const porConductor = [
    ...dias
      .reduce((mapa, d) => {
        const clave = d.choferId ?? "sin";
        const acum = mapa.get(clave) ?? {
          nombre: d.choferNombre,
          diasTrabajados: 0,
          entregados: 0,
          ingresos: 0,
          pago: 0,
        };
        // Todo día que llegó hasta acá tiene actividad registrada, así que
        // cuenta: no hay que preguntar si el conductor salió.
        acum.diasTrabajados += 1;
        acum.entregados += d.conteo.entregados;
        acum.ingresos += d.ingresos;
        acum.pago += pagoEfectivo(d);
        mapa.set(clave, acum);
        return mapa;
      }, new Map<string, { nombre: string; diasTrabajados: number; entregados: number; ingresos: number; pago: number }>())
      .values(),
  ].sort((a, b) => b.pago - a.pago);

  return (
    <div>
      <PageHeader
        title="Gestión de encomiendas"
        description={`Ingresos, pedidos por día y liquidación del conductor · ${etiquetaPeriodo(periodo)}`}
      >
        <Link href="/encomiendas/dia" className={buttonClass({ variant: "secondary" })}>
          <CalendarRange className="h-4 w-4" />
          Actividad por día
        </Link>
        {/* Ya no hay "Nuevo pedido" desde la oficina: los pedidos los carga el
            conductor en su teléfono y no pasan por la base (ver 0026). Uno
            cargado acá no le llegaría a nadie. */}
        <Link href="/encomiendas/configuracion" className={buttonClass({ variant: "secondary" })}>
          <Settings className="h-4 w-4" />
          Reglas de pago
        </Link>
      </PageHeader>

      <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Ingresos"
          value={formatCLP(totalIngresos)}
          valueClass="text-ok"
          sub={`estimado a ${formatCLP(VALOR_APROXIMADO_PEDIDO)} por entrega`}
          icon={CircleDollarSign}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Pedidos entregados"
          value={formatNumber(totalEntregados)}
          sub={
            diasCalendario > 0
              ? `${formatNumber(Math.round(promedioDia))} por día trabajado`
              : "Sin entregas en el periodo"
          }
          icon={Package}
          tint="bg-brand-soft text-brand"
        />
        <Kpi
          label="Días trabajados"
          value={formatNumber(diasCalendario)}
          sub="Días en que el conductor salió a repartir"
          icon={Truck}
          tint="bg-info-bg text-info"
        />
        <Kpi
          label="A pagar al conductor"
          value={formatCLP(totalPago)}
          valueClass="text-warn"
          sub={
            diasSinRegla > 0
              ? `${diasSinRegla} día(s) sin regla de pago, no incluidos`
              : "Por día trabajado + por pedido"
          }
          subClass={diasSinRegla > 0 ? "text-danger" : "text-muted"}
          icon={Wallet}
          tint="bg-warn-bg text-warn"
        />
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Pedidos entregados por día</CardTitle>
            <span className="text-xs text-muted">{etiquetaPeriodo(periodo)}</span>
          </CardHeader>
          <CardBody>
            {totalEntregados === 0 ? (
              <Vacio
                titulo="Todavía no hay entregas registradas en este periodo."
                icono={<Package className="h-7 w-7" />}
              />
            ) : (
              <div className="flex items-end gap-1 sm:gap-1.5">
                {serie.map((s) => (
                  <div key={s.clave} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-32 w-full items-end justify-center">
                      <div
                        title={`${s.etiqueta}: ${formatNumber(s.pedidos)} entrega(s)`}
                        className={`w-full rounded-t-[3px] ${s.pedidos > 0 ? "bg-brand" : "bg-border/40"}`}
                        // Un día con entregas nunca puede verse como uno sin
                        // salir: con un pico de 60, un día de 1 entrega daba
                        // 2% — exactamente el mismo hilo que se pinta para el
                        // domingo. El piso de los días con actividad es 10%.
                        style={{
                          height:
                            s.pedidos > 0
                              ? `${Math.max(10, Math.round((s.pedidos / maxSerie) * 100))}%`
                              : "2%",
                        }}
                      />
                    </div>
                    <span className="text-[9px] leading-none text-muted sm:text-[10px]">
                      {s.etiqueta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Detalle por día</CardTitle>
            {dias.length > 0 ? <ConfirmarPagos desde={desde} hasta={hasta} /> : null}
          </CardHeader>
          {dias.length === 0 ? (
            <CardBody>
              <Vacio
                titulo="No hay actividad registrada en este periodo."
                icono={<CalendarRange className="h-7 w-7" />}
                accion={
                  <Link href="/encomiendas/dia" className={buttonClass({ size: "sm" })}>
                    Ver actividad por día
                  </Link>
                }
              />
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Día</th>
                    <th className="px-4 py-2.5 font-medium">Conductor</th>
                    <th className="px-4 py-2.5 text-right font-medium">Entregados</th>
                    <th className="px-4 py-2.5 text-right font-medium">No entreg.</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ingresos</th>
                    <th className="px-4 py-2.5 text-right font-medium">A pagar</th>
                    <th className="px-4 py-2.5 font-medium">Liquidación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dias.map((d) => {
                    // Un snapshot que ya no coincide con lo calculado: cambió
                    // la regla o siguieron entrando entregas después de
                    // confirmar. Alguien tiene que decidir si recalcula.
                    const desfasado =
                      d.snapshot != null && d.snapshot.pago_total !== d.calculado.total;
                    return (
                      <tr key={`${d.fecha}-${d.choferId ?? "sin"}`} className="hover:bg-background">
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link
                            href={`/encomiendas/dia?fecha=${d.fecha}`}
                            className="font-medium hover:text-brand hover:underline"
                          >
                            {formatDate(d.fecha)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted">{d.choferNombre}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNumber(d.conteo.entregados)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted">
                          {d.conteo.omitidos > 0 ? formatNumber(d.conteo.omitidos) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ok">
                          {formatCLP(d.ingresos)}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-semibold tabular-nums"
                          title={`Por pedidos ${formatCLP(d.calculado.base)} · por día ${formatCLP(d.calculado.dia)} · bono ${formatCLP(d.calculado.bono)}`}
                        >
                          {formatCLP(pagoEfectivo(d))}
                        </td>
                        <td className="px-4 py-3">
                          {d.sinRegla && !d.snapshot ? (
                            <Badge tone="red">Sin regla</Badge>
                          ) : desfasado ? (
                            <Badge tone="amber">Por recalcular</Badge>
                          ) : d.snapshot ? (
                            <Badge tone="green">Confirmada</Badge>
                          ) : (
                            <Badge tone="blue">Estimada</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Por conductor</CardTitle>
          </CardHeader>
          {porConductor.length === 0 ? (
            <CardBody>
              <Vacio titulo="Sin actividad en el periodo." icono={<Truck className="h-7 w-7" />} />
            </CardBody>
          ) : (
            <div className="divide-y divide-border">
              {porConductor.map((c) => (
                <div key={c.nombre} className="px-5 py-4">
                  <p className="font-medium">{c.nombre}</p>
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted">Días trabajados</dt>
                      <dd className="tabular-nums">{formatNumber(c.diasTrabajados)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Pedidos entregados</dt>
                      <dd className="tabular-nums">{formatNumber(c.entregados)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Ingresos generados</dt>
                      <dd className="tabular-nums text-ok">{formatCLP(c.ingresos)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-[#f0f0f2] pt-1.5">
                      <dt className="font-medium">Total a pagar</dt>
                      <dd className="font-semibold tabular-nums">{formatCLP(c.pago)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
