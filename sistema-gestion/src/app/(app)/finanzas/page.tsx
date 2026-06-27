import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCLP } from "@/lib/format";
import { getPeriodo, rangoPeriodo, etiquetaPeriodo, enRango } from "@/lib/periodo";
import {
  isDemo,
  demoFacturas,
  demoGastos,
  demoVehiculos,
} from "@/lib/demo";
import {
  GASTO_CATEGORIAS,
  montoFactura,
  type GastoCategoria,
  type GastoVehiculo,
} from "@/types/db";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Finanzas" };

type Ingreso = { monto: number; cliente: string };

const catChip: Record<GastoCategoria, string> = {
  combustible: "bg-warn-bg text-warn",
  mantencion: "bg-info-bg text-info",
  seguros: "bg-[#ece8f8] text-[#5b3aa8]",
  otros: "bg-[#ececef] text-[#6e6e73]",
};

export default async function FinanzasPage() {
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  let ingresosArr: Ingreso[];
  let gastos: GastoVehiculo[];
  let patentePorId: Map<string, string>;

  if (isDemo()) {
    ingresosArr = demoFacturas
      .filter((f) => f.estado === "pagada" && enRango(f.fecha_pago, periodo))
      .map((f) => ({ monto: montoFactura(f), cliente: f.cliente?.nombre ?? "—" }));
    gastos = demoGastos.filter((g) => enRango(g.fecha, periodo));
    patentePorId = new Map(demoVehiculos.map((v) => [v.id, v.patente]));
  } else {
    const supabase = await createClient();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [{ data: fData }, { data: gData }, { data: vData }] = await Promise.all([
      supabase
        .from("facturas")
        .select("valor_a_pagar, valor_servicio, fecha_pago, cliente:clientes(nombre)")
        .eq("estado", "pagada")
        .gte("fecha_pago", desde)
        .lte("fecha_pago", hasta),
      supabase
        .from("gastos_vehiculo")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase.from("vehiculos").select("id, patente"),
    ]);
    ingresosArr = ((fData ?? []) as any[]).map((f) => ({
      monto: Number(f.valor_a_pagar ?? f.valor_servicio),
      cliente: f.cliente?.nombre ?? "—",
    }));
    gastos = (gData ?? []) as GastoVehiculo[];
    patentePorId = new Map(
      ((vData ?? []) as any[]).map((v) => [v.id as string, v.patente as string]),
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  const ingresos = ingresosArr.reduce((a, x) => a + x.monto, 0);
  const egresos = gastos.reduce((a, g) => a + Number(g.monto_total), 0);
  const balance = ingresos - egresos;

  const porCategoria = (Object.keys(GASTO_CATEGORIAS) as GastoCategoria[])
    .map((cat) => ({
      cat,
      total: gastos
        .filter((g) => g.categoria === cat)
        .reduce((a, g) => a + Number(g.monto_total), 0),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const porVehMap = new Map<string, number>();
  for (const g of gastos) {
    const key = g.vehiculo_id ?? "sin";
    porVehMap.set(key, (porVehMap.get(key) ?? 0) + Number(g.monto_total));
  }
  const porVehiculo = [...porVehMap.entries()]
    .map(([id, total]) => ({
      patente: id === "sin" ? "Sin asignar" : (patentePorId.get(id) ?? "—"),
      total,
    }))
    .sort((a, b) => b.total - a.total);

  const porClienteMap = new Map<string, number>();
  for (const x of ingresosArr) {
    porClienteMap.set(x.cliente, (porClienteMap.get(x.cliente) ?? 0) + x.monto);
  }
  const porCliente = [...porClienteMap.entries()]
    .map(([cliente, total]) => ({ cliente, total }))
    .sort((a, b) => b.total - a.total);

  const maxVeh = Math.max(1, ...porVehiculo.map((x) => x.total));

  return (
    <div>
      <PageHeader
        title="Finanzas"
        description={`Ingresos cobrados vs egresos · ${etiquetaPeriodo(periodo)}`}
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Ingresos (cobrado)</span>
              <ArrowDownLeft className="h-5 w-5 text-ok" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-ok">
              {formatCLP(ingresos)}
            </div>
            <div className="mt-1 text-xs text-muted">
              {ingresosArr.length} factura{ingresosArr.length === 1 ? "" : "s"} pagada
              {ingresosArr.length === 1 ? "" : "s"}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Egresos (gastos)</span>
              <ArrowUpRight className="h-5 w-5 text-warn" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-warn">
              {formatCLP(egresos)}
            </div>
            <div className="mt-1 text-xs text-muted">{gastos.length} gastos</div>
          </CardBody>
        </Card>
        <div className="rounded-[18px] bg-brand p-6 text-brand-foreground shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/80">Balance</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums">
            {formatCLP(balance)}
          </div>
          <div className="mt-1 text-xs text-white/75">Ingresos − egresos</div>
        </div>
      </div>

      {/* Egresos por vehículo y por categoría */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Egresos por vehículo</CardTitle>
          </CardHeader>
          <CardBody>
            {porVehiculo.length === 0 ? (
              <p className="text-sm text-muted">Sin egresos en el periodo.</p>
            ) : (
              <div className="space-y-3">
                {porVehiculo.map((v) => (
                  <div key={v.patente}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-mono">{v.patente}</span>
                      <span className="tabular-nums text-muted">
                        {formatCLP(v.total)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div
                        className="h-1.5 rounded-full bg-brand"
                        style={{ width: `${Math.round((v.total / maxVeh) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Egresos por categoría</CardTitle>
          </CardHeader>
          <CardBody>
            {porCategoria.length === 0 ? (
              <p className="text-sm text-muted">Sin egresos en el periodo.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {porCategoria.map((x) => (
                  <div
                    key={x.cat}
                    className={`flex items-center justify-between rounded-full px-3.5 py-2 text-sm font-medium ${catChip[x.cat]}`}
                  >
                    <span>{GASTO_CATEGORIAS[x.cat]}</span>
                    <span className="tabular-nums">{formatCLP(x.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Ingresos por cliente */}
      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Ingresos cobrados por cliente</CardTitle>
        </CardHeader>
        {porCliente.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">
              No hay facturas pagadas en este periodo.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {porCliente.map((c) => (
                  <tr key={c.cliente} className="hover:bg-gray-50">
                    <td className="px-5 py-3">{c.cliente}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-ok">
                      {formatCLP(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
