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
