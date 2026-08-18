// Carga de datos para el alta de un servicio de taxi.
// El alta vive en la propia pantalla de Taxis (nuevo-servicio.tsx), así que
// esta carga es la de esa pantalla: empresas y choferes para los desplegables.
import { createClient } from "@/lib/supabase/server";

export async function datosNuevoTaxi() {
  const supabase = await createClient();
  const [{ data: cl }, { data: cho }] = await Promise.all([
    supabase.from("clientes").select("id,nombre").eq("activo", true).order("nombre"),
    // La licencia viaja con el chofer: el desplegable avisa si está vencida.
    supabase
      .from("choferes")
      .select("id,nombre,licencia_vencimiento")
      .eq("activo", true)
      .order("nombre"),
  ]);
  const clientes = cl ?? [];
  const choferes = cho ?? [];

  return { clientes, choferes };
}
