import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ViajeForm } from "../viaje-form";
import {
  isDemo,
  demoClientes,
  demoCotizacionesLite,
  demoChoferes,
  demoVehiculos,
} from "@/lib/demo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo viaje" };

export default async function NuevoViajePage({
  searchParams,
}: {
  searchParams: Promise<{ cotizacion?: string }>;
}) {
  const { cotizacion: cotizacionParam } = await searchParams;

  let clientes: { id: string; nombre: string; codigo: string | null }[];
  let cotizaciones: {
    id: string;
    numero: number;
    cliente_id: string | null;
    total: number;
    titulo?: string | null;
  }[];
  let choferes: { id: string; nombre: string }[];
  let vehiculos: { id: string; patente: string }[];

  if (isDemo()) {
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
    cotizaciones = demoCotizacionesLite();
    choferes = demoChoferes.map((c) => ({ id: c.id, nombre: c.nombre }));
    vehiculos = demoVehiculos.map((v) => ({ id: v.id, patente: v.patente }));
  } else {
    const supabase = await createClient();
    const [{ data: cl }, { data: cot }, { data: cho }, { data: veh }] =
      await Promise.all([
        supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
        supabase
          .from("cotizaciones")
          .select("id,numero,cliente_id,total,titulo")
          .order("numero", { ascending: false }),
        supabase.from("choferes").select("id,nombre").order("nombre"),
        supabase.from("vehiculos").select("id,patente").order("patente"),
      ]);
    clientes = cl ?? [];
    cotizaciones = cot ?? [];
    choferes = cho ?? [];
    vehiculos = veh ?? [];
  }

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

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Nuevo viaje"
        description="Registra un servicio: cliente, fechas, choferes/buses y costos. La facturación se hace después, desde Facturas."
      />
      <ViajeForm
        clientes={clientes}
        cotizaciones={cotizaciones}
        choferes={choferes}
        vehiculos={vehiculos}
        defaults={defaults}
      />
    </div>
  );
}
