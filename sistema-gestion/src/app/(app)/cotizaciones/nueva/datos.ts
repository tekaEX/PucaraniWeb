// Carga de datos para crear una cotización — compartida entre la página
// completa (/cotizaciones/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import { isDemo, demoClientes, demoEmpresa } from "@/lib/demo";

export async function datosNuevaCotizacion() {
  let clientes: { id: string; nombre: string; codigo: string | null }[];
  let empresa: { representante: string | null } | null;

  if (isDemo()) {
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
    empresa = { representante: demoEmpresa.representante };
  } else {
    const supabase = await createClient();
    const [{ data: cl }, { data: emp }] = await Promise.all([
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase.from("empresa").select("representante").limit(1).maybeSingle(),
    ]);
    clientes = cl ?? [];
    empresa = emp ?? null;
  }

  return { clientes, defaultAutor: empresa?.representante ?? "" };
}
