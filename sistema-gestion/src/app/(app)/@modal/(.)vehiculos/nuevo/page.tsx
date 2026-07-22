import { Modal } from "@/components/ui/modal";
import { VehiculoForm } from "@/app/(app)/vehiculos/vehiculo-form";

export default function NuevoVehiculoModal() {
  return (
    <Modal titulo="Nuevo vehículo">
      <VehiculoForm />
    </Modal>
  );
}
