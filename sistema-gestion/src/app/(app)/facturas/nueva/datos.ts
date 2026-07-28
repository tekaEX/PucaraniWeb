// Carga de datos para crear una factura — compartida entre la página completa
// (/facturas/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import type { ViajeOpt } from "../factura-form";

export async function datosNuevaFactura() {
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
  const clientes = cl ?? [];
  const viajesDisponibles = (via ?? []) as ViajeOpt[];

  return { clientes, viajesDisponibles };
}
