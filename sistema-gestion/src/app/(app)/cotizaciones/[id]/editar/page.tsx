import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CotizacionForm } from "../../cotizacion-form";
import { actualizarCotizacion } from "../../actions";
import { isDemo, demoCotizacionConItems, demoClientes } from "@/lib/demo";
import type { Cotizacion, CotizacionItem } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar cotización" };

export default async function EditarCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let cot: (Cotizacion & { items: CotizacionItem[] }) | null;
  let clientes: { id: string; nombre: string; codigo: string | null }[];

  if (isDemo()) {
    cot = demoCotizacionConItems(id);
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
  } else {
    const supabase = await createClient();
    const [{ data }, { data: cl }] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select("*, items:cotizacion_items(*)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
    ]);
    cot = (data as Cotizacion & { items: CotizacionItem[] }) ?? null;
    clientes = cl ?? [];
  }

  if (!cot) notFound();
  const cotizacion = cot;
  const items = [...(cotizacion.items ?? [])].sort((a, b) => a.orden - b.orden);

  return (
    <div className="max-w-4xl">
      <PageHeader title={`Editar cotización N° ${cotizacion.numero}`} />
      <CotizacionForm
        action={actualizarCotizacion}
        clientes={clientes ?? []}
        cotizacion={cotizacion}
        items={items}
      />
    </div>
  );
}
