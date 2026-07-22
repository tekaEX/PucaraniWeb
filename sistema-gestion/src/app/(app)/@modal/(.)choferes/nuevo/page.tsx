import { Modal } from "@/components/ui/modal";
import { ChoferForm } from "@/app/(app)/choferes/chofer-form";

export default function NuevoChoferModal() {
  return (
    <Modal titulo="Nuevo chofer">
      <ChoferForm />
    </Modal>
  );
}
