import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { isDemo, demoCotizaciones, demoFacturas, demoEmpresa } from "@/lib/demo";
import { getPeriodo, rangoPeriodo, enRango } from "@/lib/periodo";
import type { Empresa, Factura } from "@/types/db";
import { CotizacionAccordion, type CotRow } from "./cotizacion-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage() {
  let cotizaciones: CotRow[];
  let empresa: Empresa | null;
  let facturas: Factura[];

  // El periodo global (selector de arriba) define el rango de fechas.
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  if (isDemo()) {
    cotizaciones = (demoCotizaciones as unknown as CotRow[]).filter((c) =>
      enRango(c.fecha, periodo),
    );
    empresa = demoEmpresa;
    facturas = demoFacturas;
  } else {
    const supabase = await createClient();
    const [{ data: cData }, { data: emp }, { data: fData }] = await Promise.all([
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
      supabase.from("facturas").select("*"),
    ]);
    cotizaciones = (cData ?? []) as CotRow[];
    empresa = (emp as Empresa) ?? null;
    facturas = (fData ?? []) as Factura[];
  }

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        description="Presupuestos numerados. Haz clic en una para ver el detalle."
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
              empresa={empresa}
              facturas={facturas}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
