import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { CircleDollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCLP } from "@/lib/format";
import { isDemo, demoFacturas } from "@/lib/demo";
import { montoFactura, type FacturaConRelaciones } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cobranzas" };

const DIAS_VENCE = 30;

function diasDesde(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  d.setHours(0, 0, 0, 0);
  return Math.round((hoy.getTime() - d.getTime()) / 86400000);
}

type Agg = {
  clienteId: string;
  nombre: string;
  pendienteFacturar: number;
  porCobrar: number;
  vencido: number;
  pagado: number;
};

export default async function CobranzasPage() {
  let facturas: FacturaConRelaciones[];
  if (isDemo()) {
    facturas = demoFacturas;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("facturas")
      .select("*, cliente:clientes(id,nombre,codigo)")
      .order("fecha", { ascending: false });
    facturas = (data ?? []) as FacturaConRelaciones[];
  }

  const map = new Map<string, Agg>();
  for (const f of facturas) {
    const key = f.cliente?.id ?? "sin-cliente";
    const nombre = f.cliente?.nombre ?? "Sin cliente";
    if (!map.has(key)) {
      map.set(key, {
        clienteId: key,
        nombre,
        pendienteFacturar: 0,
        porCobrar: 0,
        vencido: 0,
        pagado: 0,
      });
    }
    const a = map.get(key)!;
    const monto = montoFactura(f);
    if (f.estado === "pagada") a.pagado += monto;
    else if (f.estado === "facturada") {
      a.porCobrar += monto;
      if (diasDesde(f.fecha) > DIAS_VENCE) a.vencido += monto;
    } else {
      a.pendienteFacturar += monto;
    }
  }

  const filas = [...map.values()].sort((x, y) => y.porCobrar - x.porCobrar);
  const totPorCobrar = filas.reduce((s, f) => s + f.porCobrar, 0);
  const totVencido = filas.reduce((s, f) => s + f.vencido, 0);
  const totPagado = filas.reduce((s, f) => s + f.pagado, 0);

  return (
    <div>
      <PageHeader
        title="Cobranzas"
        description="Cuánto te debe cada empresa y qué está vencido."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Por cobrar</span>
              <CircleDollarSign className="h-5 w-5 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatCLP(totPorCobrar)}
            </div>
            <div className="mt-1 text-xs text-muted">Facturado, sin pago</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Vencido</span>
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-red-600">
              {formatCLP(totVencido)}
            </div>
            <div className="mt-1 text-xs text-muted">+{DIAS_VENCE} días sin pago</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Pagado (histórico)</span>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatCLP(totPagado)}
            </div>
            <div className="mt-1 text-xs text-muted">Total cobrado</div>
          </CardBody>
        </Card>
      </div>

      {filas.length === 0 ? (
        <Card className="px-6 py-16 text-center text-sm text-muted">
          No hay facturas registradas todavía.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium text-right">Por facturar</th>
                  <th className="px-4 py-3 font-medium text-right">Por cobrar</th>
                  <th className="px-4 py-3 font-medium text-right">Vencido</th>
                  <th className="px-4 py-3 font-medium text-right">Pagado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.clienteId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {f.clienteId === "sin-cliente" ? (
                        f.nombre
                      ) : (
                        <Link href={`/cobranzas/${f.clienteId}`} className="text-brand hover:underline">
                          {f.nombre}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {f.pendienteFacturar ? formatCLP(f.pendienteFacturar) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {f.porCobrar ? formatCLP(f.porCobrar) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {f.vencido ? (
                        <span className="text-red-600 font-medium">{formatCLP(f.vencido)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {f.pagado ? formatCLP(f.pagado) : "—"}
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
