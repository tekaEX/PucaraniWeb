import { PageHeader } from "@/components/page-header";
import { ServicioTaxiForm } from "../servicio-form";
import { datosNuevoTaxi } from "./datos";

export const metadata = { title: "Nuevo servicio de taxi" };

export default async function NuevoTaxiPage() {
  const { clientes, choferes } = await datosNuevoTaxi();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nuevo servicio de taxi" />
      <ServicioTaxiForm clientes={clientes} choferes={choferes} />
    </div>
  );
}
