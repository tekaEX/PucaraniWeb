import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { CotizacionForm } from "../../cotizacion-form";
import { actualizarCotizacion } from "../../actions";
import type { Cotizacion, CotizacionItem } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar cotización" };

export default async function EditarCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const [{ data }, { data: cl }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("*, items:cotizacion_items(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
  ]);
  const cot = (data as Cotizacion & { items: CotizacionItem[] }) ?? null;
  const clientes = cl ?? [];

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
