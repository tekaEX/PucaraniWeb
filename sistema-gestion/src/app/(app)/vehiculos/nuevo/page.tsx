import { PageHeader } from "@/components/page-header";
import { VehiculoForm } from "../vehiculo-form";

export const metadata = { title: "Nuevo vehículo" };

export default function NuevoVehiculoPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader title="Nuevo vehículo" />
      <VehiculoForm />
    </div>
  );
}
