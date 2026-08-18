import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Empresa } from "@/types/db";

/**
 * La empresa de la cuenta que está mirando la pantalla.
 *
 * Existe para reemplazar el idioma que estaba repetido en seis lugares:
 *
 *     .from("empresa").select("*").order("created_at").limit(1).single()
 *
 * Eso decía "la empresa más antigua de la base", que era lo mismo que "la mía"
 * solo mientras hubiera una sola. Desde la migración 0050 hay más de una y la
 * policy `empresa_read_auth` deja ver únicamente la propia, así que aquellas
 * consultas seguirían funcionando —por lo que la RLS filtra, no por lo que
 * piden—. Un `order by created_at limit 1` que devuelve lo correcto de casualidad
 * es exactamente la clase de código que engaña al leerlo: si mañana una cuenta
 * llega a ver dos empresas, elegiría la vieja sin que nadie lo note.
 *
 * Acá no hace falta pasar `empresa_id`: la policy ya lo hace. Lo que cambia es
 * que la consulta ahora dice lo que quiere.
 */
export async function empresaActual(): Promise<Empresa | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("empresa").select("*").maybeSingle();
  return (data as Empresa) ?? null;
}
