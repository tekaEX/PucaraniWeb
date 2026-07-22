import { PageHeader } from "@/components/page-header";
import { CotizacionForm } from "../cotizacion-form";
import { crearCotizacion } from "../actions";
import { datosNuevaCotizacion } from "./datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  const { clientes, defaultAutor } = await datosNuevaCotizacion();

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Nueva cotización"
        description="El número correlativo se asigna automáticamente al guardar."
      />
      <CotizacionForm
        action={crearCotizacion}
        clientes={clientes}
        defaultAutor={defaultAutor}
      />
    </div>
  );
}
