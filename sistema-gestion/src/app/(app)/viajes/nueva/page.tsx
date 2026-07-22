import { PageHeader } from "@/components/page-header";
import { ViajeForm } from "../viaje-form";
import { datosNuevoViaje } from "./datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nuevo viaje" };

export default async function NuevoViajePage({
  searchParams,
}: {
  searchParams: Promise<{ cotizacion?: string }>;
}) {
  const { cotizacion } = await searchParams;
  const { clientes, cotizaciones, choferes, vehiculos, defaults } =
    await datosNuevoViaje(cotizacion);

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
