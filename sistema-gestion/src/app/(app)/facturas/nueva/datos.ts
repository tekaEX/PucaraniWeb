// Carga de datos para crear una factura — compartida entre la página completa
// (/facturas/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import { isDemo, demoClientes, demoViajesPorFacturar } from "@/lib/demo";
import type { ViajeOpt } from "../factura-form";

export async function datosNuevaFactura() {
  let clientes: { id: string; nombre: string; codigo: string | null }[];
  let viajesDisponibles: ViajeOpt[];

  if (isDemo()) {
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
    viajesDisponibles = demoViajesPorFacturar().map((v) => ({
      id: v.id,
      cliente_id: v.cliente_id,
      descripcion: v.descripcion,
      fecha_inicio: v.fecha_inicio,
      valor: v.valor,
    }));
  } else {
    const supabase = await createClient();
    const [{ data: cl }, { data: via }] = await Promise.all([
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase
        .from("viajes")
        .select("id,cliente_id,descripcion,fecha_inicio,valor")
        .eq("estado", "realizado")
        .is("factura_id", null)
        .order("fecha_inicio", { ascending: false }),
    ]);
    clientes = cl ?? [];
    viajesDisponibles = (via ?? []) as ViajeOpt[];
  }

  return { clientes, viajesDisponibles };
}
