// Cotizaciones: cómo se leen, se validan y en qué se convierten al aceptarse.
//
// Todo esto vivía dentro de (app)/cotizaciones/actions.ts, mezclado con las
// escrituras a Supabase. Son funciones puras sobre datos que vienen del
// formulario, y son justo las que conviene poder probar: el navegador manda un
// string y acá se decide qué significa.

import { COTIZACION_ESTADOS, type CotizacionEstado } from "@/types/db";

export type ItemCotizacion = {
  descripcion: string;
  fecha: string | null;
  valor_unitario: number;
};

/**
 * Las líneas viajan al servidor como JSON en un campo oculto, porque son una
 * tabla dinámica y no campos fijos de un formulario. Eso significa que llega
 * un string arbitrario: puede venir cortado, vacío o manipulado.
 *
 * Nunca lanza. Una cotización sin líneas la rechaza la action con un mensaje
 * ("Agrega al menos una línea"), que es mejor que una pantalla de error.
 *
 * Se descartan las filas del todo vacías —el formulario siempre deja una al
 * final para seguir escribiendo— pero se conserva la que tenga descripción SIN
 * valor, o valor SIN descripción: son a medio llenar, no basura, y borrarlas en
 * silencio le haría perder al usuario lo que estaba escribiendo.
 */
export function parsearItems(raw: string | null | undefined): ItemCotizacion[] {
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const fecha = String(o.fecha ?? "").trim();
      return {
        descripcion: String(o.descripcion ?? "").trim(),
        fecha: fecha || null,
        // `|| 0` atrapa el NaN de un valor no numérico: un campo mal tipeado
        // vale cero, no rompe el guardado entero.
        valor_unitario: Number(o.valor_unitario ?? 0) || 0,
      };
    })
    .filter((it) => it.descripcion !== "" || it.valor_unitario !== 0);
}

/**
 * Valida el estado que llega del formulario. Ante cualquier cosa rara, borrador:
 * es el estado que no compromete nada.
 *
 * La lista sale de COTIZACION_ESTADOS y no de un array escrito acá al lado.
 * Ese Record es exhaustivo sobre CotizacionEstado, así que agregar un estado al
 * tipo obliga a agregarlo ahí; una copia suelta no la obliga nadie, y el estado
 * nuevo quedaría rechazado en silencio y guardado como borrador.
 */
export function estadoCotizacion(raw: string | null | undefined): CotizacionEstado {
  const valido = (Object.keys(COTIZACION_ESTADOS) as CotizacionEstado[]).includes(
    raw as CotizacionEstado,
  );
  return valido ? (raw as CotizacionEstado) : "borrador";
}

export type ViajeDesdeCotizacion = {
  cliente_id: string;
  cotizacion_id: string;
  descripcion: string;
  fecha_inicio: string;
  estado: "programado";
  valor: number;
};

/**
 * Al ACEPTAR una cotización, cada línea se convierte en un viaje programado,
 * para que la operación aparezca en Viajes sin volver a tipearla.
 *
 * - Se respeta el `orden` de las líneas: el viaje 1 es la línea 1 del documento
 *   que vio el cliente.
 * - Una línea sin fecha arranca hoy y se ajusta después en el viaje.
 * - El valor del viaje es el de la línea SIN IVA: el IVA es del documento, no
 *   del servicio. Sumar los viajes tiene que dar el subtotal, no el total.
 *
 * Quién decide CUÁNDO llamar a esto (que la cotización no tenga ya viajes, para
 * no duplicar al re-guardar) es la action: eso necesita consultar la base.
 */
export function viajesDesdeCotizacion(
  cot: {
    id: string;
    cliente_id: string;
    items: { descripcion: string; fecha: string | null; valor_unitario: number; orden: number }[];
  },
  hoy: string,
): ViajeDesdeCotizacion[] {
  return [...(cot.items ?? [])]
    .sort((a, b) => a.orden - b.orden)
    .map((it) => ({
      cliente_id: cot.cliente_id,
      cotizacion_id: cot.id,
      descripcion: it.descripcion,
      fecha_inicio: it.fecha ?? hoy,
      estado: "programado" as const,
      valor: Math.round(Number(it.valor_unitario)),
    }));
}

/**
 * En qué terminó el intento de generar los viajes de una cotización aceptada.
 *
 * Es un tipo y no un `string | null` (lo que devolvía antes la action) porque
 * "no pasó nada" y "salió bien" no son lo mismo, y el único caso que la app
 * sabía contar era el del error. Aceptar una cotización creaba los viajes en
 * silencio: la pastilla se pintaba de verde y nada más cambiaba en pantalla
 * —el viaje nace `programado`, así que tampoco mueve la tarjeta "Por facturar"
 * del panel, que cuenta los realizados sin factura—. Desde afuera era
 * indistinguible de que la función no existiera.
 */
export type ResultadoViajes =
  | { tipo: "creados"; cantidad: number }
  | { tipo: "ya_estaban" }
  | { tipo: "nada" }
  | { tipo: "error"; mensaje: string };

/**
 * El aviso que se le muestra a quien acaba de aceptar la cotización.
 *
 * Vive acá y no en el componente para poder probarlo: el plural y el "ya
 * estaban" son justo lo que se rompe al tocar el texto sin querer.
 */
export function avisoViajes(r: ResultadoViajes): { mensaje?: string; error?: string } {
  switch (r.tipo) {
    case "creados":
      return {
        mensaje:
          r.cantidad === 1
            ? "Viaje registrado con éxito en Viajes"
            : `${r.cantidad} viajes registrados con éxito en Viajes`,
      };
    // Re-aceptar no duplica los viajes (los cuenta la action antes de crear).
    // Decirlo es mejor que no decir nada: el silencio se lee como "falló".
    case "ya_estaban":
      return { mensaje: "Los viajes de esta cotización ya estaban registrados" };
    case "error":
      return { error: r.mensaje };
    case "nada":
      return {};
  }
}
