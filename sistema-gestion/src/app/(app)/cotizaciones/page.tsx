import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { CotizacionBadge } from "@/components/ui/badge";
import { Plus, FileText } from "lucide-react";
import { formatCLP, formatDate } from "@/lib/format";
import { isDemo, demoCotizacionesConCliente } from "@/lib/demo";
import type { CotizacionConCliente } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage() {
  let cotizaciones: CotizacionConCliente[];
  if (isDemo()) {
    cotizaciones = demoCotizacionesConCliente();
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("cotizaciones")
      .select("*, cliente:clientes(id,nombre,codigo)")
      .order("numero", { ascending: false });
    cotizaciones = (data ?? []) as CotizacionConCliente[];
  }

  return (
    <div>
      <PageHeader
        title="Cotizaciones"
        description="Presupuestos numerados para tus clientes."
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">N°</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cotizaciones.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/cotizaciones/${c.id}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        {c.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(c.fecha)}</td>
                    <td className="px-4 py-3">{c.cliente?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-muted">
                      {c.titulo ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCLP(c.total)}
                    </td>
                    <td className="px-4 py-3">
                      <CotizacionBadge estado={c.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
