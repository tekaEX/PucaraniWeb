import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CotizacionForm } from "../cotizacion-form";
import { crearCotizacion } from "../actions";
import { isDemo, demoClientes, demoEmpresa } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva cotización" };

export default async function NuevaCotizacionPage() {
  let clientes: { id: string; nombre: string; codigo: string | null }[];
  let empresa: { representante: string | null } | null;
  if (isDemo()) {
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
    empresa = { representante: demoEmpresa.representante };
  } else {
    const supabase = await createClient();
    const [{ data: cl }, { data: emp }] = await Promise.all([
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase.from("empresa").select("representante").limit(1).maybeSingle(),
    ]);
    clientes = cl ?? [];
    empresa = emp ?? null;
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Nueva cotización"
        description="El número correlativo se asigna automáticamente al guardar."
      />
      <CotizacionForm
        action={crearCotizacion}
        clientes={clientes ?? []}
        defaultAutor={empresa?.representante ?? ""}
      />
    </div>
  );
}
