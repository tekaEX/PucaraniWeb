// Carga de datos para crear un servicio de taxi — compartida entre la página
// completa (/taxis/nuevo) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import { isDemo, demoClientes, demoChoferes } from "@/lib/demo";

export async function datosNuevoTaxi() {
  let clientes: { id: string; nombre: string }[];
  let choferes: { id: string; nombre: string }[];

  if (isDemo()) {
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre }));
    choferes = demoChoferes.map((c) => ({ id: c.id, nombre: c.nombre }));
  } else {
    const supabase = await createClient();
    const [{ data: cl }, { data: cho }] = await Promise.all([
      supabase.from("clientes").select("id,nombre").eq("activo", true).order("nombre"),
      supabase.from("choferes").select("id,nombre").eq("activo", true).order("nombre"),
    ]);
    clientes = cl ?? [];
    choferes = cho ?? [];
  }

  return { clientes, choferes };
}
