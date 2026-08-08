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
import { formatCLP, formatDate, formatNumber, formatTime, hoyChile } from "@/lib/format";
import { getPeriodo, rangoPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import {
  agruparPorDia,
  tarifaDelDia,
  valorPedido,
  type ConteoDia,
  type EventoActividad,
} from "@/lib/encomiendas/pago";
import type {
  EncomiendaIngresoReal,
  EncomiendaJornada,
  EncomiendaPago,
  EncomiendaReglaPago,
} from "@/types/db";
import { AgregarDia, type ChoferOpcion } from "./agregar-dia";
import { ReglaPago } from "./regla-pago";
import { CompararIngresos } from "./comparar-ingresos";

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
  /** Las cifras que la base congeló para este día (0031): ingreso estimado y
   *  desglose del pago. Esta pantalla NO las recalcula — lee lo que se escribió
   *  cuando el día se registró, que es lo que hace que cambiar la regla de pago
   *  no mueva ni un peso de lo que ya está.
   *
   *  null solo si el día no se pudo calcular: sin conductor (eliminado después)
   *  o sin regla configurada todavía. */
  cifras: EncomiendaPago | null;
  /** El sobre del día (0032): a qué hora salió la ruta y si ya terminó. Una
   *  jornada abierta es una ruta EN CURSO y por eso todavía no tiene cifras —
   *  la plata se cuenta una sola vez, al cerrar. */
  jornada: EncomiendaJornada | null;
  /** Eventos cargados a mano desde la oficina (0028) y total del día: con los
   *  dos se distingue un día íntegramente manual de uno que el teléfono mandó
   *  a medias y la oficina completó. */
  manuales: number;
  total: number;
};

/** Una ruta que todavía está pasando. No tiene cifras y no debe tenerlas. */
function enCurso(d: Dia): boolean {
  return d.jornada != null && d.jornada.cerrada_en == null;
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
    { data: jornadasData, error: errorJornadas },
    { data: choferesData, error: errorChoferes },
    { data: ingresosRealesData, error: errorIngresosReales },
  ] = await Promise.all([
    supabase
      .from("encomienda_actividad")
      .select("chofer_id, fecha, tipo, origen, chofer:choferes(id,nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .returns<EventoFila[]>(),
    // Hay una sola (0031). Se pide igual porque el diálogo la necesita para
    // prellenar el formulario, y porque su ausencia es lo que bloquea el resto
    // de la pantalla.
    supabase.from("encomienda_reglas_pago").select("*").limit(1).maybeSingle(),
    // Las cifras ya congeladas de cada día del periodo. De acá salen TODOS los
    // números de plata de esta pantalla: no se recalcula nada al vuelo.
    supabase.from("encomienda_pagos").select("*").gte("fecha", desde).lte("fecha", hasta),
    // El sobre de cada día: si la ruta está en curso o ya terminó (0032).
    supabase
      .from("encomienda_jornadas")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .returns<EncomiendaJornada[]>(),
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
  // trabajados, los pagos son lo que valió cada uno y la regla es lo que se
  // está aplicando. Si CUALQUIERA falla, todo número de esta pantalla queda
  // corto sin parecerlo: sin actividad se ve un mes sin trabajo, sin pagos sale
  // "$0", sin la regla el panel se cree sin configurar. Antes los errores se
  // descartaban y el resultado era indistinguible de un mes tranquilo.
  const errorPlata = errorActividad ?? errorReglas ?? errorPagos ?? errorJornadas;
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

  const regla = (reglasData ?? null) as EncomiendaReglaPago | null;
  const pagos = (pagosData ?? []) as EncomiendaPago[];
  const jornadas = (jornadasData ?? []) as EncomiendaJornada[];
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

  // La actividad dice QUÉ pasó cada día; encomienda_pagos, cuánto valió. Se
  // cruzan por (conductor, fecha) en vez de recalcular: las cifras de la
  // segunda son las que se escribieron cuando el día se registró, y son las que
  // mandan aunque la regla haya cambiado diez veces desde entonces.
  const dias: Dia[] = agruparPorDia(actividadData ?? []).map((d) => ({
    fecha: d.fecha,
    choferId: d.choferId,
    choferNombre: d.eventos[0]?.chofer?.nombre ?? "Conductor eliminado",
    conteo: d.conteo,
    cifras: pagos.find((p) => p.fecha === d.fecha && p.chofer_id === d.choferId) ?? null,
    jornada: jornadas.find((j) => j.fecha === d.fecha && j.chofer_id === d.choferId) ?? null,
    manuales: d.manuales,
    total: d.eventos.length,
  }));

  // Días de CALENDARIO, no filas: con dos conductores saliendo los mismos 20
  // días, el KPI diría 40 en un mes que tiene 20. El pago sí se calcula por
  // día-conductor (cada uno cobra su fijo), pero la cifra que el dueño lee acá
  // es "cuántos días hubo reparto".
  const diasCalendario = new Set(dias.map((d) => d.fecha)).size;
  const totalEntregados = dias.reduce((a, d) => a + d.conteo.entregados, 0);
  const totalIngresos = dias.reduce((a, d) => a + (d.cifras?.ingresos_totales ?? 0), 0);
  const totalPago = dias.reduce((a, d) => a + (d.cifras?.pago_total ?? 0), 0);
  const promedioDia = diasCalendario > 0 ? totalEntregados / diasCalendario : 0;
  // Días sin cifras que NO son una ruta en curso. Una jornada abierta también
  // suma $0, pero eso no es un problema que reportar: es una ruta que todavía
  // está pasando y se va a contar cuando termine. Mezclarlas haría que el aviso
  // se encendiera todas las tardes.
  const diasSinCifras = dias.filter((d) => d.cifras == null && !enCurso(d)).length;
  const diasEnCurso = dias.filter(enCurso).length;

  // Ingreso real del periodo: null si todavía no se cargó ninguno (distinto de
  // cero, que sería "no entró nada").
  const totalReal = ingresosReales.length > 0
    ? ingresosReales.reduce((a, r) => a + r.monto, 0)
    : null;
  const difReal = (totalReal ?? 0) - totalIngresos;
  const valorVigente = valorPedido(regla);

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
        acum.ingresos += d.cifras?.ingresos_totales ?? 0;
        acum.pago += d.cifras?.pago_total ?? 0;
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
        <CompararIngresos
          anio={periodo.anio}
          mes={periodo.mes}
          ingresos={{
            estimado: totalIngresos,
            entregas: totalEntregados,
            reales: ingresosReales,
            error: errorIngresosReales?.message ?? null,
          }}
        />
        <ReglaPago regla={regla} />
      </PageHeader>

      {/* Sin regla no hay cómo valorar un día: la base no le escribe cifras a
          ninguno y todo el panel queda en cero, con los días igual apareciendo
          en la tabla. Eso se lee como "no se trabajó" si no se dice. */}
      {regla == null ? (
        <div className="mb-4 rounded-[14px] border border-danger/25 bg-danger-bg px-4 py-3 text-sm text-danger">
          <p className="font-medium">Falta configurar la regla de pago.</p>
          <p className="mt-0.5 text-xs">
            Hasta que la guardes no se puede calcular el ingreso de ningún día ni lo que hay que
            pagarle al conductor, y no se pueden cargar días desde la oficina. Los días que el
            teléfono registre mientras tanto quedan guardados y se calculan solos apenas configures
            la regla.
          </p>
        </div>
      ) : null}

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
            diasSinCifras > 0
              ? `${diasSinCifras} día(s) sin calcular, no incluidos`
              : diasEnCurso > 0
                ? `${diasEnCurso} ruta(s) en curso, se suman al terminar`
                : "Por día trabajado + por pedido"
          }
          subClass={
            diasSinCifras > 0 ? "text-danger" : diasEnCurso > 0 ? "text-info" : "text-muted"
          }
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
                regla={regla}
                hoy={hoyChile()}
                diasConocidos={dias.map((d) => ({
                  fecha: d.fecha,
                  choferId: d.choferId,
                  entregados: d.conteo.entregados,
                  omitidos: d.conteo.omitidos,
                  manuales: d.manuales,
                  total: d.total,
                  tarifa: tarifaDelDia(d.cifras),
                }))}
              />
              {/* Acá estaba "Confirmar pagos del periodo". No queda nada que
                  confirmar: las cifras de cada día las escribe la base cuando
                  el día se registra (0031), así que la columna "A pagar" ya es
                  la definitiva desde el primer momento. */}
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
                    <th className="px-4 py-2.5 font-medium">Jornada</th>
                    <th className="px-4 py-2.5 text-right font-medium">Entregados</th>
                    <th className="px-4 py-2.5 text-right font-medium">No entreg.</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ingresos</th>
                    <th className="px-4 py-2.5 text-right font-medium">A pagar</th>
                    <th className="px-4 py-2.5 font-medium">Origen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dias.map((d) => {
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
                        {/* De cuándo a cuándo salió la ruta. Reemplaza a la
                            lista de horas de cada entrega: con la ruta hecha de
                            corrido, ese par es todo lo que dice algo. */}
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                          {enCurso(d) ? (
                            <Badge tone="amber">En curso</Badge>
                          ) : d.jornada?.inicio && d.jornada.cerrada_en ? (
                            <span className="tabular-nums">
                              {formatTime(d.jornada.inicio)} – {formatTime(d.jornada.cerrada_en)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNumber(d.conteo.entregados)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted">
                          {d.conteo.omitidos > 0 ? formatNumber(d.conteo.omitidos) : "—"}
                        </td>
                        {/* Un guion y no un $0: que un día no tenga cifras no
                            significa que no valga nada, significa que no se
                            pudo calcular. Un cero ahí sería una afirmación. */}
                        <td className="px-4 py-3 text-right tabular-nums text-ok">
                          {d.cifras ? formatCLP(d.cifras.ingresos_totales) : "—"}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-semibold tabular-nums"
                          title={
                            d.cifras
                              ? `Por pedidos ${formatCLP(d.cifras.pago_base)} · por día ${formatCLP(d.cifras.pago_dia)} · bono ${formatCLP(d.cifras.pago_bono)}`
                              : undefined
                          }
                        >
                          {d.cifras ? (
                            formatCLP(d.cifras.pago_total)
                          ) : enCurso(d) ? (
                            // No es un problema: la ruta todavía está pasando y
                            // se cuenta cuando termine.
                            <span className="font-normal text-muted">Al terminar</span>
                          ) : (
                            <Badge tone="red">
                              {d.choferId ? "Sin regla" : "Sin conductor"}
                            </Badge>
                          )}
                        </td>
                        {/* Lo único que queda por distinguir del día es de dónde
                            salieron sus números: un día del teléfono son
                            entregas con hora, uno de oficina son cifras que
                            alguien recordó. Paga igual, pero no prueba lo
                            mismo. */}
                        <td className="px-4 py-3">
                          {d.manuales === 0 ? (
                            <Badge tone="blue">Teléfono</Badge>
                          ) : d.manuales === d.total ? (
                            <Badge tone="violet">Oficina</Badge>
                          ) : (
                            <Badge tone="amber">Mixto</Badge>
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
