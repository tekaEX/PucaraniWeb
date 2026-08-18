import "server-only";
import { cookies } from "next/headers";
import { hoyChile } from "@/lib/format";
import type { Periodo } from "@/lib/periodo";

// El lado servidor del periodo global: leer cuál está elegido.
//
// Es lo único de todo el concepto de periodo que necesita el servidor, y por
// eso vive solo. La aritmética —rangos, comparaciones, etiquetas, periodo
// anterior— está en periodo.ts y se puede usar en los dos lados.

/**
 * Lee el periodo desde la cookie. Por defecto, el mes actual EN CHILE.
 *
 * Lo de Chile no es un detalle: el servidor corre en UTC, así que de noche
 * `new Date()` ya está en el mes siguiente. Sin hoyChile(), el 31 de enero a
 * las 22:00 el dashboard se cambiaba solo a febrero y aparecía vacío.
 */
export async function getPeriodo(): Promise<Periodo> {
  const raw = (await cookies()).get("periodo")?.value;
  const [hAnio, hMes] = hoyChile().split("-").map(Number);
  const fallback: Periodo = { anio: hAnio, mes: hMes };
  if (!raw) return fallback;
  const [a, m] = raw.split("-");
  const anio = Number(a);
  if (!anio) return fallback;
  if (m === "ALL") return { anio, mes: null };
  const mes = Number(m);
  return { anio, mes: mes >= 1 && mes <= 12 ? mes : fallback.mes };
}
