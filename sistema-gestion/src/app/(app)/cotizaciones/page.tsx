import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { getPeriodo, rangoPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import type { Empresa, Viaje } from "@/types/db";
import { datosNuevaCotizacion } from "./nueva/datos";
import { CotizacionAccordion, type CotRow } from "./cotizacion-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage() {
  // El periodo global (selector de arriba) define el rango de fechas.
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  const supabase = await createClient();
  const [{ data: cData }, { data: emp }] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("*, cliente:clientes(id,nombre,codigo), items:cotizacion_items(*)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("numero", { ascending: false }),
    supabase
      .from("empresa")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const cotizaciones = (cData ?? []) as CotRow[];
  const empresa = (emp as Empresa) ?? null;

  // Solo los viajes de las cotizaciones visibles (no toda la tabla).
  let viajes: Viaje[] = [];
  if (cotizaciones.length > 0) {
    const { data: vData } = await supabase
      .from("viajes")
      .select("*")
      .in("cotizacion_id", cotizaciones.map((c) => c.id));
    viajes = (vData ?? []) as Viaje[];
  }

  // Para la edición inline en el acordeón.
  const { clientes } = await datosNuevaCotizacion();

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        description={`Presupuestos de ${etiquetaPeriodo(periodo).toLowerCase()}. Haz clic en una para ver y editar.`}
      >
        <Link href="/cotizaciones/nueva" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nueva cotización
        </Link>
      </PageHeader>

      {cotizaciones.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FileText className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Todavía no hay cotizaciones.</p>
          <Link href="/cotizaciones/nueva" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Crear la primera
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <CotizacionAccordion
              cotizaciones={cotizaciones}
              clientes={clientes}
              empresa={empresa}
              viajes={viajes}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
