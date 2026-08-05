import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCLP, formatDate } from "@/lib/format";
import type { EncomiendaReglaPago } from "@/types/db";
import { ReglaPagoForm } from "./regla-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reglas de pago — Encomiendas" };

export default async function ConfiguracionEncomiendasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("encomienda_reglas_pago")
    .select("*")
    .order("vigente_desde", { ascending: false })
    .order("created_at", { ascending: false });
  const reglas = (data ?? []) as EncomiendaReglaPago[];

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        title="Reglas de pago — Encomiendas"
        description="Cuánto se le paga al conductor por día trabajado y por pedido entregado. La regla más nueva es la vigente; las anteriores se conservan para no alterar pagos ya confirmados."
      />

      <ReglaPagoForm />

      <Card className="divide-y divide-border">
        {reglas.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">
            Aún no hay reglas de pago configuradas.
          </p>
        ) : (
          reglas.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="text-sm font-medium">
                  {r.monto_dia > 0 ? `${formatCLP(r.monto_dia)} por día trabajado + ` : ""}
                  {r.tipo_pago === "porcentaje"
                    ? `${r.valor_pago}% por pedido entregado`
                    : `${formatCLP(r.valor_pago)} por pedido entregado`}
                </p>
                {r.meta_entregas_dia ? (
                  // "al alcanzar", no "al superar": el cálculo usa >=, así que
                  // llegar justo a la meta ya paga el bono.
                  <p className="text-xs text-muted">
                    Bono de {formatCLP(r.bono_monto ?? 0)} al alcanzar {r.meta_entregas_dia}{" "}
                    entregas/día
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted">Vigente desde {formatDate(r.vigente_desde)}</p>
              </div>
              {i === 0 ? <Badge tone="green">Vigente</Badge> : null}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
