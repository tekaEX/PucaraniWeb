// Carga de datos para crear una cotización — compartida entre la página
// completa (/cotizaciones/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";

export async function datosNuevaCotizacion() {
  const supabase = await createClient();
  const [{ data: cl }, { data: emp }] = await Promise.all([
    supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
    supabase.from("empresa").select("representante").limit(1).maybeSingle(),
  ]);
  const clientes = cl ?? [];
  const empresa = emp ?? null;

  return { clientes, defaultAutor: empresa?.representante ?? "" };
}
