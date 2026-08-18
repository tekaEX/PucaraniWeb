// Carga de datos para crear una cotización — compartida entre la página
// completa (/cotizaciones/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import { empresaActual } from "@/lib/empresa-server";

export async function datosNuevaCotizacion() {
  const supabase = await createClient();
  const [{ data: cl }, emp] = await Promise.all([
    supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
    empresaActual(),
  ]);
  const clientes = cl ?? [];
  const empresa = emp ?? null;

  return { clientes, defaultAutor: empresa?.representante ?? "" };
}
