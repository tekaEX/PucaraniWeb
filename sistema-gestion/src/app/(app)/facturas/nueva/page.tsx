import { PageHeader } from "@/components/page-header";
import { FacturaForm } from "../factura-form";
import { datosNuevaFactura } from "./datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva factura" };

export default async function NuevaFacturaPage() {
  const { clientes, viajesDisponibles } = await datosNuevaFactura();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Nueva factura"
        description="Elige el cliente, marca los viajes que cubre este documento y emítelo con su folio."
      />
      <FacturaForm clientes={clientes} viajesDisponibles={viajesDisponibles} />
    </div>
  );
}
