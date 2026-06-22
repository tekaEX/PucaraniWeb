import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmpresaForm } from "./empresa-form";
import { isDemo, demoEmpresa } from "@/lib/demo";
import type { Empresa } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  let data: Empresa | null;
  if (isDemo()) {
    data = demoEmpresa;
  } else {
    const supabase = await createClient();
    const res = await supabase
      .from("empresa")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    data = (res.data as Empresa) ?? null;
  }

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
