import { Modal } from "@/components/ui/modal";
import { ViajeForm } from "@/app/(app)/viajes/viaje-form";
import { datosNuevoViaje } from "@/app/(app)/viajes/nueva/datos";

export const dynamic = "force-dynamic";

export default async function NuevoViajeModal({
  searchParams,
}: {
  searchParams: Promise<{ cotizacion?: string }>;
}) {
  const { cotizacion } = await searchParams;
  const { clientes, cotizaciones, choferes, vehiculos, defaults } =
    await datosNuevoViaje(cotizacion);

  return (
    <Modal titulo="Nuevo viaje" ancho="4xl">
      <ViajeForm
        clientes={clientes}
        cotizaciones={cotizaciones}
        choferes={choferes}
        vehiculos={vehiculos}
        defaults={defaults}
      />
    </Modal>
  );
}
