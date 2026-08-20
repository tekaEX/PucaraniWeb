import { Modal } from "@/components/ui/modal";
import { FacturaForm } from "@/app/(app)/facturas/factura-form";
import { datosNuevaFactura } from "@/app/(app)/facturas/nueva/datos";
import { configSii } from "@/app/(app)/facturas/config-sii";

export const dynamic = "force-dynamic";

export default async function NuevaFacturaModal() {
  const [{ clientes, viajesDisponibles, folios }, sii] = await Promise.all([
    datosNuevaFactura(),
    configSii(),
  ]);

  return (
    <Modal titulo="Nueva factura" ancho="4xl">
      <FacturaForm
        clientes={clientes}
        viajesDisponibles={viajesDisponibles}
        foliosSugeridos={folios}
        emisionElectronica={sii.listo}
      />
    </Modal>
  );
}
