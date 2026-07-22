import { Modal } from "@/components/ui/modal";
import { FacturaForm } from "@/app/(app)/facturas/factura-form";
import { datosNuevaFactura } from "@/app/(app)/facturas/nueva/datos";

export const dynamic = "force-dynamic";

export default async function NuevaFacturaModal() {
  const { clientes, viajesDisponibles } = await datosNuevaFactura();

  return (
    <Modal titulo="Nueva factura" ancho="4xl">
      <FacturaForm clientes={clientes} viajesDisponibles={viajesDisponibles} />
    </Modal>
  );
}
