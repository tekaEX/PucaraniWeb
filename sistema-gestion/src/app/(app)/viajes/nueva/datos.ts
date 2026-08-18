// Carga de datos para crear un viaje — compartida entre la página completa
// (/viajes/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";

// Los papeles viajan con el chofer y con el bus: el formulario avisa al asignar
// uno con la licencia o la revisión técnica vencida (US5, T042). Las columnas
// están acá y no escritas en cada consulta porque el formulario de viaje se
// carga desde tres lugares —crear, crear en modal y editar— y basta que a uno
// le falte un campo para que el aviso quede mudo justo ahí.
export const COLUMNAS_CHOFER_OPT = "id,nombre,activo,licencia_vencimiento";
export const COLUMNAS_VEHICULO_OPT =
  "patente,activo,revision_tecnica_venc,soap_venc,permiso_circulacion_venc";

export async function datosNuevoViaje(cotizacionParam?: string) {
  const supabase = await createClient();
  const [{ data: cl }, { data: cot }, { data: cho }, { data: veh }] =
    await Promise.all([
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase
        .from("cotizaciones")
        .select("id,numero,cliente_id,total,titulo")
        .order("numero", { ascending: false }),
      supabase.from("choferes").select(COLUMNAS_CHOFER_OPT).order("nombre"),
      supabase.from("vehiculos").select(COLUMNAS_VEHICULO_OPT).order("patente"),
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
