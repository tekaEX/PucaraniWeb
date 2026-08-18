// Modelo del resumen financiero mensual.
//
// De los siete modelos de dominio que pide la feature, seis ya existían en
// types/db.ts (cotizaciones, viajes, facturas, clientes, vehículos, choferes).
// El séptimo —el reporte financiero mensual— no tenía modelo: se calculaba
// suelto dentro de (app)/page.tsx y de finanzas/secciones.tsx, dos pantallas
// que muestran las MISMAS cifras y las derivaban por separado.
//
// Acá vive la definición, en funciones puras y sin acceso a datos: quien carga
// las filas es la pantalla, quien decide qué significan es este archivo.
//
// La regla de fondo, la que hace que esto no sea una suma trivial: **cada
// concepto entra al periodo por una fecha distinta** (ver lib/periodo.ts). Una
// factura pagada cuenta como ingreso el mes en que se PAGÓ, no el que se
// emitió; un viaje realizado y sin facturar pesa el mes en que se HIZO. Usar la
// fecha equivocada no rompe nada visible: da un número plausible en el mes
// equivocado, y eso se descubre cuando ya se tomó una decisión con él.

import { enRango, etiquetaMes, mismoPeriodo, type Periodo } from "@/lib/periodo";
import {
  costoTotalViaje,
  facturaPagada,
  viajePorFacturar,
  GASTO_CATEGORIAS,
  type Factura,
  type GastoCategoria,
  type GastoVehiculo,
  type Viaje,
} from "@/types/db";

/** Lo mínimo que hace falta de cada tabla. Se pide por estructura y no por el
 *  tipo completo para que las pantallas puedan traer solo las columnas que
 *  usan, sin quedar obligadas a un `select *`. */
/** El nombre del cliente como viene del join, para los cortes por cliente. */
type ConCliente = { cliente?: { nombre: string } | null };

export type DatosFinancieros = {
  facturas: (Pick<Factura, "estado" | "total" | "fecha_emision" | "fecha_pago"> &
    ConCliente)[];
  /** Los cuatro `costo_*` van sí o sí: sin ellos costosDe() cuenta 0 de costo
   *  por viaje y nadie se entera. El tipo los exige para que la pantalla que
   *  arma el select no se los pueda olvidar. */
  viajes: Pick<
    Viaje,
    | "estado"
    | "factura_id"
    | "valor"
    | "fecha_inicio"
    | "costo_combustible"
    | "costo_peajes"
    | "costo_viaticos"
    | "costo_otros"
  >[];
  /** `categoria` y `vehiculo_id` (la patente) son para los cortes de egresos. */
  gastos: Pick<GastoVehiculo, "monto_total" | "fecha" | "categoria" | "vehiculo_id">[];
  /** Los taxis se cobran al momento: su fecha ES la fecha de cobro.
   *  `cliente_texto` conserva el nombre cuando la importación no encontró match. */
  taxis: ({ fecha: string; monto: number; cliente_texto?: string | null } & ConCliente)[];
  /** Con `fecha`, no solo el total: el resumen filtra por periodo él mismo.
   *  Si dependiera de que la consulta ya vino filtrada, alcanzaría con que una
   *  pantalla trajera un rango más ancho —por ejemplo para calcular el mes
   *  anterior— para que el cotizado del mes se inflara sin aviso. */
  cotizaciones: { total: number; fecha: string }[];
};

export type ResumenFinanciero = {
  /** Facturas pagadas en el periodo + servicios de taxi del periodo. */
  ingresos: number;
  /** Gastos de flota + costos directos de los viajes (peajes, viáticos…). */
  costos: number;
  utilidad: number;
  /** Porcentaje. `null` cuando no hubo ingresos: 0% sería mentira. */
  margen: number | null;
  /** Emitidas y sin pagar, por fecha de emisión. Todavía no es plata. */
  porCobrar: number;
  /** Viajes realizados sin factura: trabajo hecho que nadie facturó. */
  pendienteFacturar: number;
  /** Cotizado en el periodo, sin importar si se aceptó. */
  totalCotizado: number;
  /** Cuántos documentos hay detrás de cada cifra. La pantalla los muestra bajo
   *  el monto ("3 facturas emitidas"), y son parte del resumen: $0 con 0
   *  facturas es un mes sin trabajo, $0 con 12 facturas es un problema. */
  conteos: {
    cotizaciones: number;
    porFacturar: number;
    porCobrar: number;
    pagadas: number;
  };
};

/**
 * Variación porcentual contra el periodo anterior.
 *
 * `null` si el anterior fue 0: de cero a cualquier cosa no es "+100%", es una
 * división por cero disfrazada. La pantalla muestra un guion.
 */
export function delta(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/** Ingresos del periodo: lo que efectivamente entró. */
export function ingresosDe(d: DatosFinancieros, p: Periodo): number {
  const facturado = d.facturas
    .filter((f) => f.estado === "emitida" && enRango(f.fecha_pago, p))
    .reduce((a, f) => a + Number(f.total), 0);
  const taxis = d.taxis
    .filter((t) => enRango(t.fecha, p))
    .reduce((a, t) => a + Number(t.monto), 0);
  return facturado + taxis;
}

/** Egresos del periodo: flota + lo que costó mover cada viaje. */
export function costosDe(d: DatosFinancieros, p: Periodo): number {
  const flota = d.gastos
    .filter((g) => enRango(g.fecha, p))
    .reduce((a, g) => a + Number(g.monto_total), 0);
  // Los cancelados no costaron nada: no salieron.
  const viajes = d.viajes
    .filter((v) => v.estado !== "cancelado" && enRango(v.fecha_inicio, p))
    .reduce((a, v) => a + costoTotalViaje(v), 0);
  return flota + viajes;
}

/** El resumen completo del periodo. */
export function resumenFinanciero(d: DatosFinancieros, p: Periodo): ResumenFinanciero {
  const ingresos = ingresosDe(d, p);
  const costos = costosDe(d, p);
  const utilidad = ingresos - costos;

  // Se filtra una vez y se usa para el monto y para el conteo: si se hiciera
  // dos veces con dos filtros escritos aparte, el "3 facturas" podría dejar de
  // corresponder al monto de arriba sin que nada avise.
  const cotizadas = d.cotizaciones.filter((c) => enRango(c.fecha, p));
  const porFacturar = d.viajes.filter((v) => viajePorFacturar(v) && enRango(v.fecha_inicio, p));
  const porCobrarArr = d.facturas.filter(
    (f) => f.estado === "emitida" && !facturaPagada(f) && enRango(f.fecha_emision, p),
  );
  const pagadas = d.facturas.filter((f) => f.estado === "emitida" && enRango(f.fecha_pago, p));

  return {
    ingresos,
    costos,
    utilidad,
    margen: ingresos > 0 ? Math.round((utilidad / ingresos) * 100) : null,
    porCobrar: porCobrarArr.reduce((a, f) => a + Number(f.total), 0),
    pendienteFacturar: porFacturar.reduce((a, v) => a + Number(v.valor), 0),
    totalCotizado: cotizadas.reduce((a, c) => a + Number(c.total), 0),
    conteos: {
      cotizaciones: cotizadas.length,
      porFacturar: porFacturar.length,
      porCobrar: porCobrarArr.length,
      pagadas: pagadas.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Agregación mensual: el informe del negocio mes a mes
// ---------------------------------------------------------------------------

export type MesSerie = {
  periodo: Periodo;
  /** "ene", "feb"… para el eje del gráfico. */
  label: string;
  ingresos: number;
  egresos: number;
  /** El mes que el usuario tiene elegido: el gráfico lo destaca. */
  actual: boolean;
};

/**
 * Ingresos y egresos de cada mes de la ventana.
 *
 * Reusa `ingresosDe` y `costosDe`, y eso es el punto: el gráfico de tendencia
 * tenía su propia suma escrita aparte dentro de la pantalla —facturas por
 * fecha_pago, taxis por fecha, gastos de flota, costos de viaje sin los
 * cancelados— la misma definición dos veces. Coincidían, pero nada obligaba a
 * que siguieran coincidiendo: cualquier cambio en qué cuenta como ingreso dejaba
 * la barra de un mes discrepando del KPI de ese mismo mes, en la misma pantalla.
 */
export function serieMensual(
  d: DatosFinancieros,
  meses: Periodo[],
  elegido?: Periodo,
): MesSerie[] {
  return meses.map((p) => ({
    periodo: p,
    label: etiquetaMes(p),
    ingresos: ingresosDe(d, p),
    egresos: costosDe(d, p),
    actual: elegido ? mismoPeriodo(p, elegido) : false,
  }));
}

/** Una fila de un corte: quién/qué, y cuánto. Ordenadas de mayor a menor. */
export type Corte = { clave: string; total: number };

const porTotalDesc = (a: Corte, b: Corte) => b.total - a.total;

function agrupar(filas: { clave: string; monto: number }[]): Corte[] {
  const m = new Map<string, number>();
  for (const f of filas) m.set(f.clave, (m.get(f.clave) ?? 0) + f.monto);
  return [...m.entries()].map(([clave, total]) => ({ clave, total })).sort(porTotalDesc);
}

/**
 * Ingresos COBRADOS del periodo, por cliente. Entran las facturas por su fecha
 * de pago y los servicios de taxi por su fecha: los taxis también son plata de
 * un cliente, y dejarlos fuera hacía que la suma del corte no diera el KPI de
 * ingresos.
 */
export function ingresosPorCliente(d: DatosFinancieros, p: Periodo): Corte[] {
  const SIN_NOMBRE = "—";
  return agrupar([
    ...d.facturas
      .filter((f) => f.estado === "emitida" && enRango(f.fecha_pago, p))
      .map((f) => ({ clave: f.cliente?.nombre ?? SIN_NOMBRE, monto: Number(f.total) })),
    ...d.taxis
      .filter((t) => enRango(t.fecha, p))
      .map((t) => ({
        // Un taxi sin empresa es un particular, no un dato faltante.
        clave: t.cliente?.nombre ?? t.cliente_texto ?? "Taxis (particular)",
        monto: Number(t.monto),
      })),
  ]);
}

/**
 * Egresos de flota del periodo por vehículo (la clave es la patente, que ES la
 * PK). No incluye los costos de viaje: esos no están imputados a un vehículo.
 */
export function egresosPorVehiculo(d: DatosFinancieros, p: Periodo): Corte[] {
  return agrupar(
    d.gastos
      .filter((g) => enRango(g.fecha, p))
      .map((g) => ({ clave: g.vehiculo_id ?? "Sin asignar", monto: Number(g.monto_total) })),
  );
}

/** Egresos de flota del periodo por categoría de gasto, sin las que dan 0. */
export function egresosPorCategoria(
  d: DatosFinancieros,
  p: Periodo,
): { categoria: GastoCategoria; total: number }[] {
  const delPeriodo = d.gastos.filter((g) => enRango(g.fecha, p));
  return (Object.keys(GASTO_CATEGORIAS) as GastoCategoria[])
    .map((categoria) => ({
      categoria,
      total: delPeriodo
        .filter((g) => g.categoria === categoria)
        .reduce((a, g) => a + Number(g.monto_total), 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}
