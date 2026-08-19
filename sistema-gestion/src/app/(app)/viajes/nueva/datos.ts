// Carga de datos para crear un viaje — compartida entre la página completa
// (/viajes/nueva) y su versión modal interceptada (@modal).
import { createClient } from "@/lib/supabase/server";
import { getPeriodo } from "@/lib/periodo-server";
import { rangoPeriodo } from "@/lib/periodo";

// Los papeles viajan con el chofer y con el bus: el formulario avisa al asignar
// uno con la licencia o la revisión técnica vencida (US5, T042). Las columnas
// están acá y no escritas en cada consulta porque el formulario de viaje se
// carga desde tres lugares —crear, crear en modal y editar— y basta que a uno
// le falte un campo para que el aviso quede mudo justo ahí.
export const COLUMNAS_CHOFER_OPT = "id,nombre,activo,licencia_vencimiento";
export const COLUMNAS_VEHICULO_OPT =
  "patente,activo,revision_tecnica_venc,soap_venc,permiso_circulacion_venc";

/**
 * Las cotizaciones que se ofrecen para asociar a un viaje: las del periodo
 * activo, y nada más.
 *
 * La lista completa crecía sin techo —son todas las cotizaciones de la
 * historia— y al cargar un viaje había que buscar el número entre cientos que
 * no venían al caso. El periodo global ya decide qué mes se está mirando en el
 * resto de la app; acá se respeta lo mismo.
 *
 * `incluirId` es la excepción necesaria: al EDITAR un viaje viejo, su
 * cotización puede ser de otro mes. Sin esto, el selector aparecería vacío y
 * guardar el viaje le borraría la asociación sin que nadie lo pidiera.
 */
export async function cotizacionesDelPeriodo(incluirId?: string | null) {
  const supabase = await createClient();
  const { desde, hasta } = rangoPeriodo(await getPeriodo());

  const filtro = `and(fecha.gte.${desde},fecha.lte.${hasta})${
    incluirId ? `,id.eq.${incluirId}` : ""
  }`;

  const { data } = await supabase
    .from("cotizaciones")
    .select("id,numero,cliente_id,total,titulo,fecha")
    .or(filtro)
    .order("numero", { ascending: false });

  return data ?? [];
}

export async function datosNuevoViaje(cotizacionParam?: string) {
  const supabase = await createClient();
  const [{ data: cl }, cot, { data: cho }, { data: veh }] =
    await Promise.all([
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      // Si se llega desde una cotización concreta (?cotizacion=…), esa entra
      // aunque sea de otro mes: es justamente la que se quiere asociar.
      cotizacionesDelPeriodo(cotizacionParam),
      supabase.from("choferes").select(COLUMNAS_CHOFER_OPT).order("nombre"),
      supabase.from("vehiculos").select(COLUMNAS_VEHICULO_OPT).order("patente"),
    ]);
  const clientes = cl ?? [];
  const cotizaciones = cot;
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
