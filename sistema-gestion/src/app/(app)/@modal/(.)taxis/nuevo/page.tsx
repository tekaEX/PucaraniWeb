import { Modal } from "@/components/ui/modal";
import { ServicioTaxiForm } from "@/app/(app)/taxis/servicio-form";
import { datosNuevoTaxi } from "@/app/(app)/taxis/nuevo/datos";

export default async function NuevoTaxiModal() {
  const { clientes, choferes } = await datosNuevoTaxi();
  return (
    <Modal titulo="Nuevo servicio de taxi">
      <ServicioTaxiForm clientes={clientes} choferes={choferes} inline />
    </Modal>
  );
}
