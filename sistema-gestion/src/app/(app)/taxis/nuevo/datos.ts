// Carga de datos para crear un servicio de taxi — compartida entre la página
// completa (/taxis/nuevo) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";

export async function datosNuevoTaxi() {
  const supabase = await createClient();
  const [{ data: cl }, { data: cho }] = await Promise.all([
    supabase.from("clientes").select("id,nombre").eq("activo", true).order("nombre"),
    supabase.from("choferes").select("id,nombre").eq("activo", true).order("nombre"),
  ]);
  const clientes = cl ?? [];
  const choferes = cho ?? [];

  return { clientes, choferes };
}
