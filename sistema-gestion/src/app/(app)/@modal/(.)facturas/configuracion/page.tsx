import { Modal } from "@/components/ui/modal";
import { ConfiguracionSii } from "@/app/(app)/facturas/configuracion/contenido";

// La configuración del SII se mira contra la lista de facturas que quedó atrás,
// así que se abre como modal y no como pantalla aparte. La ruta real
// (/facturas/configuracion) sigue existiendo para la entrada directa.
export const dynamic = "force-dynamic";

export default async function ConfigSiiModal() {
  return (
    <Modal titulo="Configuración SII" ancho="2xl">
      <ConfiguracionSii />
    </Modal>
  );
}
