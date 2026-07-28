// Carga de datos para crear un viaje — compartida entre la página completa
// (/viajes/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";

export async function datosNuevoViaje(cotizacionParam?: string) {
  const supabase = await createClient();
  const [{ data: cl }, { data: cot }, { data: cho }, { data: veh }] =
    await Promise.all([
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase
        .from("cotizaciones")
        .select("id,numero,cliente_id,total,titulo")
        .order("numero", { ascending: false }),
      supabase.from("choferes").select("id,nombre").order("nombre"),
      supabase.from("vehiculos").select("patente").order("patente"),
    ]);
  const clientes = cl ?? [];
  const cotizaciones = cot ?? [];
  const choferes = cho ?? [];
  const vehiculos = veh ?? [];

  let defaults: {
    cotizacion_id?: string;
    cliente_id?: string;
    valor?: number;
    descripcion?: string;
  } = {};

  if (cotizacionParam) {
    const cot = cotizaciones.find((c) => c.id === cotizacionParam);
    if (cot) {
      defaults = {
        cotizacion_id: cot.id,
        cliente_id: cot.cliente_id ?? undefined,
        valor: Number(cot.total) || undefined,
        descripcion: cot.titulo ?? undefined,
      };
    }
  }

  return { clientes, cotizaciones, choferes, vehiculos, defaults };
}
