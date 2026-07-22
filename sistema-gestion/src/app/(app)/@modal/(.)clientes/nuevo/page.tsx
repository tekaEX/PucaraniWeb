import { Modal } from "@/components/ui/modal";
import { ClienteForm } from "@/app/(app)/clientes/cliente-form";

export default function NuevoClienteModal() {
  return (
    <Modal titulo="Nuevo cliente">
      <ClienteForm />
    </Modal>
  );
}
