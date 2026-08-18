import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { exigirPanel } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mesesVentana, periodoAnterior, rangoPeriodo, type Periodo } from "@/lib/periodo";
import { hoyChile } from "@/lib/format";
import type { DatosFinancieros } from "@/lib/finanzas";

// La capa de consulta de las cifras del negocio. Es el único lugar que sabe
// QUÉ columnas y QUÉ rango hacen falta; qué significan esos números lo decide
// lib/finanzas.ts, que es puro y no toca la base.
//
// Estaba escrita dentro de (app)/page.tsx. Al sacarla acá, la misma carga sirve
// para el dashboard y para Finanzas, que hasta ahora consultaban por separado
// las mismas tablas para mostrar las mismas cifras.

export type CargaFinanciera = {
  datos: DatosFinancieros;
  /** Los meses del gráfico de tendencia, ya cubiertos por `datos`. */
  meses: Periodo[];
  error: PostgrestError | null;
};

/** Meses del gráfico de tendencia. Define además cuánto hacia atrás se carga. */
export const MESES_TENDENCIA = 6;

const VACIO: DatosFinancieros = {
  facturas: [],
  viajes: [],
  gastos: [],
  taxis: [],
  cotizaciones: [],
};

/**
 * Trae todo lo necesario para el periodo pedido, el anterior Y los meses del
 * gráfico de tendencia, en una sola pasada. Las funciones de lib/finanzas.ts
 * filtran después en memoria con `enRango`, así que el mismo conjunto sirve
 * para todos esos periodos.
 *
 * Antes eran DOCE consultas por carga del dashboard: estas cinco, y otras siete
 * que la sección financiera hacía por su cuenta sobre las mismas tablas —tres
 * de ellas pidiendo justamente estos 6 meses—. Ahora son cinco, y sobre todo:
 * las cifras de los KPI y las del gráfico salen del mismo conjunto de filas, no
 * de dos lecturas que podían no coincidir.
 *
 * Nunca se traen tablas completas: además del costo, al crecer quedarían
 * truncadas por el tope de filas de PostgREST y los totales empezarían a faltar
 * en silencio.
 *
 * El `error` se devuelve, no se traga. Descartarlo convierte cualquier falla de
 * lectura en "un mes sin trabajo" —cero cotizado, cero ingresos—, que es
 * indistinguible de la realidad y es la primera pantalla que mira el dueño.
 * Es el mismo motivo por el que existe components/ui/error-datos.tsx.
 */
export async function cargarDatosFinancieros(periodo: Periodo): Promise<CargaFinanciera> {
  // El control de acceso va ACÁ, pegado al dato, y no solo en (app)/layout.tsx.
  //
  // No es redundante: por el Partial Rendering de Next, un layout NO se vuelve
  // a ejecutar al navegar entre rutas que lo comparten, así que su exigirPanel()
  // corre una vez por carga completa y no en cada cambio de sección. La propia
  // guía del framework lo dice —"be cautious when doing checks in Layouts […]
  // do the checks close to your data source"
  // (node_modules/next/dist/docs/01-app/02-guides/authentication.md)— y es el
  // patrón "Data Access Layer" que lib/auth.ts ya cita en su encabezado.
  //
  // Al vivir en el cargador, cualquier pantalla que pida estas cifras queda
  // cubierta sin que su autor tenga que acordarse. Y no cuesta una consulta
  // extra: sesionActual() está memoizada con cache() de React durante el render.
  await exigirPanel();

  const { hasta } = rangoPeriodo(periodo);
  const meses = mesesVentana(periodo, hoyChile(), MESES_TENDENCIA);
  // El más viejo de los dos arranques: la ventana del gráfico llega más atrás
  // que el periodo anterior, salvo en vista anual (donde "anterior" es todo el
  // año pasado). Se toma el menor y con eso quedan cubiertos los dos.
  const desde = [
    rangoPeriodo(periodoAnterior(periodo)).desde,
    rangoPeriodo(meses[0]).desde,
  ].sort()[0];

  const supabase = await createClient();
  const [
    { data: cotData, error: eCot },
    { data: viajesData, error: eViajes },
    { data: factData, error: eFact },
    { data: gastosData, error: eGastos },
    { data: taxisData, error: eTaxis },
  ] = await Promise.all([
    supabase.from("cotizaciones").select("total, fecha").gte("fecha", desde).lte("fecha", hasta),
    supabase
      .from("viajes")
      .select(
        "estado, factura_id, fecha_inicio, valor, costo_combustible, costo_peajes, costo_viaticos, costo_otros",
      )
      .gte("fecha_inicio", desde)
      .lte("fecha_inicio", hasta),
    // Una factura entra al periodo por fecha_pago (ingreso) o por fecha_emision
    // (por cobrar), así que hay que traer las que cumplan cualquiera de las dos.
    supabase
      .from("facturas")
      .select("estado, total, fecha_emision, fecha_pago, cliente:clientes(nombre)")
      .or(
        `and(fecha_pago.gte.${desde},fecha_pago.lte.${hasta}),and(fecha_emision.gte.${desde},fecha_emision.lte.${hasta})`,
      ),
    supabase
      .from("gastos_vehiculo")
      .select("fecha, monto_total, categoria, vehiculo_id")
      .gte("fecha", desde)
      .lte("fecha", hasta),
    supabase
      .from("servicios_taxi")
      .select("fecha, monto, cliente_texto, cliente:clientes(nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);

  const error = eCot ?? eViajes ?? eFact ?? eGastos ?? eTaxis ?? null;
  if (error) return { datos: VACIO, meses, error };

  return {
    error: null,
    meses,
    datos: {
      cotizaciones: cotData ?? [],
      viajes: (viajesData ?? []) as DatosFinancieros["viajes"],
      // El join de cliente llega como objeto o como arreglo según la relación
      // que infiera PostgREST; las funciones de finanzas.ts leen `.nombre`.
      facturas: (factData ?? []) as unknown as DatosFinancieros["facturas"],
      gastos: (gastosData ?? []) as DatosFinancieros["gastos"],
      taxis: (taxisData ?? []) as unknown as DatosFinancieros["taxis"],
    },
  };
}
