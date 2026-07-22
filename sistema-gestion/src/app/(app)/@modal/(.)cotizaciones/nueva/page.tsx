import { Modal } from "@/components/ui/modal";
import { CotizacionForm } from "@/app/(app)/cotizaciones/cotizacion-form";
import { crearCotizacion } from "@/app/(app)/cotizaciones/actions";
import { datosNuevaCotizacion } from "@/app/(app)/cotizaciones/nueva/datos";

export const dynamic = "force-dynamic";

export default async function NuevaCotizacionModal() {
  const { clientes, defaultAutor } = await datosNuevaCotizacion();

  return (
    <Modal titulo="Nueva cotización" ancho="4xl">
      <CotizacionForm
        action={crearCotizacion}
        clientes={clientes}
        defaultAutor={defaultAutor}
      />
    </Modal>
  );
}
