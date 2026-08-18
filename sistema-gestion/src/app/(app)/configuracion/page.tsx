import { PageHeader } from "@/components/page-header";
import { EmpresaForm } from "./empresa-form";
import { empresaActual } from "@/lib/empresa-server";
import type { Empresa } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const data = await empresaActual();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configuración"
        description="Datos del emisor que aparecen en cotizaciones (PDF y Excel)."
      />
      <EmpresaForm empresa={(data as Empresa) ?? undefined} />
    </div>
  );
}
