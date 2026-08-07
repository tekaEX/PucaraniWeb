import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Kpi } from "@/components/ui/kpi";
import { Vacio } from "@/components/ui/vacio";
import { ErrorDatos } from "@/components/ui/error-datos";
import { buttonClass } from "@/components/ui/button";
import { Package, CalendarRange, Truck, Wallet, CircleDollarSign } from "lucide-react";
import { formatCLP, formatDate, formatNumber, hoyChile } from "@/lib/format";
import { getPeriodo, rangoPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import {
  agruparPorDia,
  calcularPagoDia,
  ingresoEstimado,
  reglaVigente,
  valorPedido,
  type ConteoDia,
  type EventoActividad,
  type PagoDesglose,
} from "@/lib/encomiendas/pago";
import type {
  EncomiendaIngresoReal,
  EncomiendaPago,
  EncomiendaReglaPago,
} from "@/types/db";
import { ConfirmarPagos } from "./confirmar-pagos";
import { AgregarDia, type ChoferOpcion } from "./agregar-dia";
import { ConfiguracionEncomiendas } from "./configuracion-encomiendas";

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
  /** Eventos cargados a mano desde la oficina (0028) y total del día: con los
   *  dos se distingue un día íntegramente manual de uno que el teléfono mandó
   *  a medias y la oficina completó. */
  manuales: number;
  total: number;
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
  const [
    { data: actividadData, error: errorActividad },
    { data: reglasData, error: errorReglas },
    { data: pagosData, error: errorPagos },
    { data: choferesData, error: errorChoferes },
    { data: ingresosRealesData, error: errorIngresosReales },
  ] = await Promise.all([
    supabase
      .from("encomienda_actividad")
      .select("chofer_id, fecha, tipo, origen, chofer:choferes(id,nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .returns<EventoFila[]>(),
    supabase.from("encomienda_reglas_pago").select("*"),
    supabase.from("encomienda_pagos").select("*").gte("fecha", desde).lte("fecha", hasta),
    // Para el selector de "Agregar día". Se piden por categoría y no todos los
    // choferes: cargarle un día de encomiendas a un conductor de taxis o de
    // operación metería a otra área en esta liquidación.
    supabase
      .from("chofer_categorias")
      .select("chofer:choferes(id, nombre, activo)")
      .eq("categoria", "encomiendas")
      .returns<{ chofer: { id: string; nombre: string; activo: boolean } | null }[]>(),
    // Lo que Starken liquidó de verdad (0029). Va por mes, no por fecha, así
    // que se filtra por año y —en vista de mes— por ese mes.
    (periodo.mes === null
      ? supabase.from("encomienda_ingresos_reales").select("*").eq("anio", periodo.anio)
      : supabase
          .from("encomienda_ingresos_reales")
          .select("*")
          .eq("anio", periodo.anio)
          .eq("mes", periodo.mes)
    ).returns<EncomiendaIngresoReal[]>(),
  ]);

  // Las tres primeras consultas son la plata: la actividad son los días
  // trabajados, las reglas son cuánto se paga por cada uno y los pagos son lo
  // ya confirmado. Si CUALQUIERA falla, todo número de esta pantalla queda
  // corto sin parecerlo: sin actividad se ve un mes sin trabajo, sin reglas
  // sale "$0 a pagar", sin pagos se pierde lo ya liquidado. Antes los errores
  // se descartaban y el resultado era indistinguible de un mes tranquilo.
  const errorPlata = errorActividad ?? errorReglas ?? errorPagos;
  if (errorPlata) {
    return (
      <div>
        <PageHeader
          title="Gestión de encomiendas"
          description={etiquetaPeriodo(periodo)}
        />
        <ErrorDatos
          titulo="No se pudo leer la actividad de encomiendas."
          detalle={errorPlata.message}
        />
      </div>
    );
  }

  const reglas = (reglasData ?? []) as EncomiendaReglaPago[];
  const pagos = (pagosData ?? []) as EncomiendaPago[];
  // Este NO entra en errorPlata: que falte el ingreso real no vuelve falso
  // ningún número de la pantalla —el estimado sigue siendo el estimado—, solo
  // deja sin hacer la comparación. El aviso va dentro del diálogo, donde sirve.
  const ingresosReales = (ingresosRealesData ?? []) as EncomiendaIngresoReal[];

  // Solo conductores activos: uno dado de baja no debería aparecer como opción
  // para cargarle días nuevos. Su historial y sus liquidaciones ya cargadas
  // siguen intactos — eso sale de la actividad, no de esta lista.
  const choferesEncomiendas: ChoferOpcion[] = (choferesData ?? [])
    .flatMap((f) => (f.chofer && f.chofer.activo ? [f.chofer] : []))
    .map((c) => ({ id: c.id, nombre: c.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const dias: Dia[] = agruparPorDia(actividadData ?? []).map((d) => {
    const regla = reglaVigente(reglas, d.choferId, d.fecha);
    return {
      fecha: d.fecha,
      choferId: d.choferId,
      choferNombre: d.eventos[0]?.chofer?.nombre ?? "Conductor eliminado",
      conteo: d.conteo,
      // Cada día se valora con el valor por entrega de SU regla vigente (0029):
      // si el valor cambió a mitad de año, los meses anteriores conservan el
      // que tenían en vez de reescribirse solos.
      ingresos: ingresoEstimado(d.conteo.entregados, valorPedido(regla)),
      calculado: calcularPagoDia(d.conteo, regla),
      snapshot: pagos.find((p) => p.fecha === d.fecha && p.chofer_id === d.choferId) ?? null,
      sinRegla: regla == null,
      manuales: d.manuales,
      total: d.eventos.length,
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

  // Ingreso real del periodo: null si todavía no se cargó ninguno (distinto de
  // cero, que sería "no entró nada").
  const totalReal = ingresosReales.length > 0
    ? ingresosReales.reduce((a, r) => a + r.monto, 0)
    : null;
  const difReal = (totalReal ?? 0) - totalIngresos;
  // El valor por entrega que rige HOY, para el subtítulo cuando no hay real.
  const valorVigente = valorPedido(reglaVigente(reglas, null, hoyChile()));

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
        <ConfiguracionEncomiendas
          reglas={reglas}
          anio={periodo.anio}
          mes={periodo.mes}
          ingresos={{
            estimado: totalIngresos,
            entregas: totalEntregados,
            reales: ingresosReales,
            error: errorIngresosReales?.message ?? null,
          }}
        />
      </PageHeader>

      <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Ingresos estimados"
          value={formatCLP(totalIngresos)}
          valueClass="text-ok"
          // Con lo real cargado, lo que importa deja de ser el estimado y pasa
          // a ser cuánto le erró: es el número con el que se calibra el valor
          // por entrega.
          sub={
            totalReal != null
              ? `reales ${formatCLP(totalReal)} · ${difReal >= 0 ? "+" : "−"}${formatCLP(Math.abs(difReal))}`
              : `a ${formatCLP(valorVigente)} por entrega · carga los reales para comparar`
          }
          subClass={totalReal == null ? "text-muted" : difReal >= 0 ? "text-ok" : "text-danger"}
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
            <div className="flex flex-wrap items-start justify-end gap-2">
              {/* Va acá y no en la cabecera de la página porque es esta tabla
                  la que va a cambiar: se carga un día y aparece una fila. */}
              <AgregarDia
                choferes={choferesEncomiendas}
                // Sin esto, una consulta fallida deja la lista vacía y el botón
                // se desactiva diciendo "ningún conductor tiene la categoría",
                // que es una afirmación sobre datos que no se pudieron leer.
                errorChoferes={errorChoferes?.message ?? null}
                reglas={reglas}
                hoy={hoyChile()}
                diasConocidos={dias.map((d) => ({
                  fecha: d.fecha,
                  choferId: d.choferId,
                  entregados: d.conteo.entregados,
                  omitidos: d.conteo.omitidos,
                  manuales: d.manuales,
                  total: d.total,
                }))}
              />
              {dias.length > 0 ? <ConfirmarPagos desde={desde} hasta={hasta} /> : null}
            </div>
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
                          {/* Un día cargado desde la oficina paga igual que uno
                              registrado en terreno, pero no es la misma prueba:
                              son números que alguien recordó, no entregas con
                              hora. Quien mira la liquidación tiene que poder
                              distinguirlos de un vistazo. */}
                          {/* "Manual parcial" es el caso que más confunde: el
                              teléfono alcanzó a mandar una parte del día y la
                              oficina completó el resto. */}
                          {d.manuales > 0 ? (
                            <Badge tone="violet" className="ml-2">
                              {d.manuales === d.total ? "Carga manual" : "Manual parcial"}
                            </Badge>
                          ) : null}
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
                    <div className="flex justify-between border-t border-divider pt-1.5">
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
