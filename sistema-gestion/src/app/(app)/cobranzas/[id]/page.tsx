import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { FacturaBadge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { formatCLP, formatDate } from "@/lib/format";
import { isDemo, demoClienteById, demoFacturas } from "@/lib/demo";
import { montoFactura, type Cliente, type FacturaConRelaciones } from "@/types/db";

export const dynamic = "force-dynamic";

const DIAS_VENCE = 30;

function diasDesde(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  d.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - d.getTime()) / 86400000);
}

export default async function EstadoCuentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let cliente: Cliente | null;
  let facturas: FacturaConRelaciones[];

  if (isDemo()) {
    cliente = demoClienteById(id);
    facturas = demoFacturas.filter((f) => f.cliente_id === id);
  } else {
    const supabase = await createClient();
    const [{ data: cli }, { data: fac }] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("facturas")
        .select("*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero)")
        .eq("cliente_id", id)
        .order("fecha", { ascending: false }),
    ]);
    cliente = (cli as Cliente) ?? null;
    facturas = (fac ?? []) as FacturaConRelaciones[];
  }

  if (!cliente) notFound();

  const porCobrar = facturas
    .filter((f) => f.estado === "facturada")
    .reduce((s, f) => s + montoFactura(f), 0);
  const vencido = facturas
    .filter((f) => f.estado === "facturada" && diasDesde(f.fecha) > DIAS_VENCE)
    .reduce((s, f) => s + montoFactura(f), 0);
  const pagado = facturas
    .filter((f) => f.estado === "pagada")
    .reduce((s, f) => s + montoFactura(f), 0);

  return (
    <div className="max-w-4xl">
      <Link
        href="/cobranzas"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Cobranzas
      </Link>

      <PageHeader title={cliente.nombre} description="Estado de cuenta" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Por cobrar</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatCLP(porCobrar)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Vencido</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-red-600">
              {formatCLP(vencido)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">Pagado</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{formatCLP(pagado)}</div>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Descripción</th>
                <th className="px-4 py-3 font-medium">N° Fact.</th>
                <th className="px-4 py-3 font-medium">OC</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Antigüedad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facturas.map((f) => {
                const dias = diasDesde(f.fecha);
                const vencida = f.estado === "facturada" && dias > DIAS_VENCE;
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      <Link href={`/facturas/${f.id}`} className="hover:underline">
                        {formatDate(f.fecha)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 max-w-48 truncate">{f.descripcion ?? "—"}</td>
                    <td className="px-4 py-2.5">{f.numero ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{f.orden_compra ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatCLP(montoFactura(f))}
                    </td>
                    <td className="px-4 py-2.5"><FacturaBadge estado={f.estado} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {f.estado === "facturada" ? (
                        <span className={vencida ? "font-medium text-red-600" : "text-muted"}>
                          {dias} día{dias === 1 ? "" : "s"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
