// Flota: las reglas del REGISTRO del vehículo y del chofer.
//
// El estado de los papeles —vencido, por vencer, sin cargar— vive en
// lib/vencimientos.ts. Acá está lo otro: qué se deja guardar.
//
// Igual que en lib/facturas.ts, parte de esto también está como CHECK en la
// base (el formato de la patente lo garantiza `vehiculos_patente_formato` de la
// migración 0008, y las fechas por ser columnas `date`). Eso está bien: la base
// es la que impide que el dato se corrompa. Pero un CHECK violado llega como
// "invalid input syntax for type date" y quien está cargando una camioneta no
// tiene por qué leer eso. Estas funciones existen para llegar antes, en
// castellano y señalando el campo.

import { VEHICULO_CATEGORIAS, type VehiculoCategoria } from "@/types/db";
import { hoyChile } from "@/lib/format";

/**
 * Categoría válida, o null ("sin clasificar"). La lista sale de
 * VEHICULO_CATEGORIAS, que es exhaustivo sobre VehiculoCategoria: una copia
 * suelta se desactualiza sin que nada avise.
 *
 * Ojo: la base todavía acepta 'encomiendas' (migración 0016) y puede haber
 * filas con ese valor. Guardar de nuevo un vehículo así lo deja sin categoría,
 * que es lo correcto: esa línea de trabajo se fue al proyecto Ares.
 */
export function categoriaVehiculo(raw: string | null | undefined): VehiculoCategoria | null {
  return raw && raw in VEHICULO_CATEGORIAS ? (raw as VehiculoCategoria) : null;
}

/** Una fecha que Postgres va a aceptar en una columna `date`. */
export function esFechaISO(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return false;
  const [, a, mes, d] = m.map(Number);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return false;
  // Descarta el 31 de febrero: el constructor de Date lo correría al 3 de marzo
  // en silencio, y el vencimiento quedaría tres días después de lo cargado.
  const fecha = new Date(Date.UTC(a, mes - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d;
}

/** Clases de licencia chilenas (Ley 18.290). A2–A5 son las profesionales: las
 *  que habilitan a manejar un bus o un taxi. */
export const LICENCIA_CLASES = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "B",
  "C",
  "D",
  "E",
  "F",
] as const;

export type LicenciaClase = (typeof LICENCIA_CLASES)[number];

/** Palabras que la gente escribe en el campo y no son una clase. */
const RELLENO = new Set(["", "CLASE", "CLASES", "Y", "E/O", "O"]);

/**
 * Normaliza las clases de licencia a la forma canónica: "clase a-3, b" →
 * "A3, B". La licencia chilena se imprime con guion ("A-3"), así que el guion
 * dentro de una clase se saca; entre clases se usa coma.
 *
 * Devuelve `{ clases }` con el texto normalizado (o null si el campo va vacío),
 * o `{ error }` si algo de lo escrito no es una clase — antes de esto, un
 * "clase Z" se guardaba tal cual y nadie podía saber si ese chofer estaba
 * habilitado para manejar un bus.
 */
export function clasesLicencia(
  raw: string | null | undefined,
): { clases: string | null } | { error: string } {
  const texto = (raw ?? "").trim();
  if (texto === "") return { clases: null };

  const encontradas = new Set<LicenciaClase>();
  for (const bruto of texto.split(/[,;/+]|\s+/)) {
    const t = bruto.toUpperCase().replace(/[.\-\s]/g, "");
    if (RELLENO.has(t)) continue;
    if (!(LICENCIA_CLASES as readonly string[]).includes(t)) {
      return {
        error: `"${bruto}" no es una clase de licencia. Válidas: ${LICENCIA_CLASES.join(", ")}.`,
      };
    }
    encontradas.add(t as LicenciaClase);
  }

  if (encontradas.size === 0) return { clases: null };
  // En el orden de LICENCIA_CLASES, no en el que se escribieron: así la misma
  // licencia se lee igual en todas las fichas.
  return { clases: LICENCIA_CLASES.filter((c) => encontradas.has(c)).join(", ") };
}

export type VehiculoAValidar = {
  anio: number | null;
  capacidad: number | null;
  km_actual: number | null;
  revision_tecnica_venc: string | null;
  soap_venc: string | null;
  permiso_circulacion_venc: string | null;
};

/** Año más allá del cual un año de fabricación es un error de tipeo. El
 *  vehículo del año siguiente existe (se venden antes), dos años no. */
const ANIO_MAX_FUTURO = 1;

/**
 * Devuelve el primer problema en castellano, o `null` si el vehículo se puede
 * guardar. La patente no se valida acá: la canoniza `formatearPatente()` de
 * lib/patentes.ts, que es la que además decide la clave primaria de la fila.
 */
export function validarVehiculo(v: VehiculoAValidar): string | null {
  const anioActual = Number(hoyChile().slice(0, 4));
  if (v.anio !== null && (v.anio < 1900 || v.anio > anioActual + ANIO_MAX_FUTURO)) {
    return `El año del vehículo debe estar entre 1900 y ${anioActual + ANIO_MAX_FUTURO}.`;
  }
  if (v.capacidad !== null && v.capacidad < 0) {
    return "La capacidad no puede ser negativa.";
  }
  if (v.km_actual !== null && v.km_actual < 0) {
    return "El kilometraje no puede ser negativo.";
  }
  for (const [campo, label] of [
    ["revision_tecnica_venc", "revisión técnica"],
    ["soap_venc", "SOAP"],
    ["permiso_circulacion_venc", "permiso de circulación"],
  ] as const) {
    const fecha = v[campo];
    if (fecha !== null && !esFechaISO(fecha)) {
      return `La fecha de vencimiento de la ${label} no es una fecha válida.`;
    }
  }
  return null;
}

/** Devuelve el primer problema de la licencia, o `null`. Las clases se validan
 *  con `clasesLicencia()`, que además las normaliza. */
export function validarLicencia(vencimiento: string | null): string | null {
  if (vencimiento !== null && !esFechaISO(vencimiento)) {
    return "La fecha de vencimiento de la licencia no es una fecha válida.";
  }
  return null;
}
