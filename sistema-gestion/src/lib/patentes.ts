// Patentes chilenas: formato antiguo LLNNNN (ej. AB1234) y nuevo LLLLNN
// (ej. ABCD12). Tolera separadores comunes (espacio, punto, guion).
const PATENTE_RE = /\b([A-Z]{4}[ .\-]?\d{2}|[A-Z]{2}[ .\-]?\d{4})\b/gi;

// Quita separadores y normaliza a mayúsculas: "GHPR-34" -> "GHPR34".
export function normalizar(patente: string): string {
  return patente.toUpperCase().replace(/[ .\-]/g, "");
}

// Extrae la primera patente del texto del detalle de la factura, normalizada.
// Devuelve null si no encuentra ninguna (queda para revisión manual).
export function extraerPatente(detalle: string): string | null {
  if (!detalle) return null;
  for (const m of detalle.toUpperCase().matchAll(PATENTE_RE)) {
    return normalizar(m[1]);
  }
  return null;
}

// La patente es EL identificador del vehículo (PK en la base), por eso se
// guarda siempre en formato canónico: "ABCD-12" (nuevo) o "AB-1234" (antiguo).
// Devuelve null si el texto no es una patente chilena válida.
export function formatearPatente(input: string): string | null {
  const n = normalizar(input);
  if (/^[A-Z]{4}\d{2}$/.test(n)) return `${n.slice(0, 4)}-${n.slice(4)}`;
  if (/^[A-Z]{2}\d{4}$/.test(n)) return `${n.slice(0, 2)}-${n.slice(2)}`;
  return null;
}

// Para el atributo pattern de los <input> (acepta con o sin guion; el
// servidor la lleva a la forma canónica antes de guardar).
export const PATENTE_PATTERN =
  "([A-Za-z]{4}-?[0-9]{2}|[A-Za-z]{2}-?[0-9]{4})";
export const PATENTE_HINT = "Formato: ABCD-12 (nuevo) o AB-1234 (antiguo)";
