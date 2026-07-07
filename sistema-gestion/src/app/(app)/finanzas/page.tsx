import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
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
type Mov = { fecha: string; monto: number };

const MES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const catChip: Record<GastoCategoria, string> = {
  combustible: "bg-warn-bg text-warn",
  mantencion: "bg-info-bg text-info",
  seguros: "bg-[#ece8f8] text-[#5b3aa8]",
  otros: "bg-[#ececef] text-[#6e6e73]",
};

export default async function FinanzasPage() {
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  // Ventana del gráfico: 6 meses terminando en el periodo elegido (o en el
  // mes en curso si se ve el año completo).
  const hoy = new Date();
  const finMes =
    periodo.mes ??
    (periodo.anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12);
  const mesesChart: { anio: number; mes: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(periodo.anio, finMes - 1 - i, 1);
    mesesChart.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
  }
  const chartDesde = rangoPeriodo(mesesChart[0]).desde;
  const chartHasta = rangoPeriodo(mesesChart[5]).hasta;

  let ingresosArr: Ingreso[];
  let gastos: GastoVehiculo[];
  let patentePorId: Map<string, string>;
  let histIngresos: Mov[];
  let histGastos: Mov[];

  if (isDemo()) {
    ingresosArr = demoFacturas
      .filter((f) => f.estado === "pagada" && enRango(f.fecha_pago, periodo))
      .map((f) => ({ monto: montoFactura(f), cliente: f.cliente?.nombre ?? "—" }));
    gastos = demoGastos.filter((g) => enRango(g.fecha, periodo));
    patentePorId = new Map(demoVehiculos.map((v) => [v.id, v.patente]));
    histIngresos = demoFacturas
      .filter(
        (f) =>
          f.estado === "pagada" &&
          f.fecha_pago &&
          f.fecha_pago >= chartDesde &&
          f.fecha_pago <= chartHasta,
      )
      .map((f) => ({ fecha: f.fecha_pago!, monto: montoFactura(f) }));
    histGastos = demoGastos
      .filter((g) => g.fecha >= chartDesde && g.fecha <= chartHasta)
      .map((g) => ({ fecha: g.fecha, monto: Number(g.monto_total) }));
  } else {
    const supabase = await createClient();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [{ data: fData }, { data: gData }, { data: vData }, { data: hiData }, { data: hgData }] =
      await Promise.all([
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
        supabase
          .from("facturas")
          .select("valor_a_pagar, valor_servicio, fecha_pago")
          .eq("estado", "pagada")
          .gte("fecha_pago", chartDesde)
          .lte("fecha_pago", chartHasta),
        supabase
          .from("gastos_vehiculo")
          .select("fecha, monto_total")
          .gte("fecha", chartDesde)
          .lte("fecha", chartHasta),
      ]);
    ingresosArr = ((fData ?? []) as any[]).map((f) => ({
      monto: Number(f.valor_a_pagar ?? f.valor_servicio),
      cliente: f.cliente?.nombre ?? "—",
    }));
    gastos = (gData ?? []) as GastoVehiculo[];
    patentePorId = new Map(
      ((vData ?? []) as any[]).map((v) => [v.id as string, v.patente as string]),
    );
    histIngresos = ((hiData ?? []) as any[]).map((f) => ({
      fecha: f.fecha_pago as string,
      monto: Number(f.valor_a_pagar ?? f.valor_servicio),
    }));
    histGastos = ((hgData ?? []) as any[]).map((g) => ({
      fecha: g.fecha as string,
      monto: Number(g.monto_total),
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  const serie = mesesChart.map(({ anio, mes }) => {
    const pref = `${anio}-${String(mes).padStart(2, "0")}`;
    return {
      anio,
      mes,
      label: MES_CORTO[mes - 1],
      activo: periodo.mes === mes && periodo.anio === anio,
      ingresos: histIngresos
        .filter((x) => x.fecha.startsWith(pref))
        .reduce((a, x) => a + x.monto, 0),
      egresos: histGastos
        .filter((x) => x.fecha.startsWith(pref))
        .reduce((a, x) => a + x.monto, 0),
    };
  });
  const maxSerie = Math.max(1, ...serie.flatMap((s) => [s.ingresos, s.egresos]));

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
        <Kpi
          label="Ingresos (cobrado)"
          value={formatCLP(ingresos)}
          valueClass="text-ok"
          sub={`${ingresosArr.length} factura${ingresosArr.length === 1 ? "" : "s"} pagada${ingresosArr.length === 1 ? "" : "s"}`}
          icon={ArrowDownLeft}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Egresos (gastos)"
          value={formatCLP(egresos)}
          valueClass="text-warn"
          sub={`${gastos.length} gasto${gastos.length === 1 ? "" : "s"}`}
          icon={ArrowUpRight}
          tint="bg-warn-bg text-warn"
        />
        <div className="rounded-[18px] bg-brand p-6 text-brand-foreground shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/80">Balance</span>
          </div>
          <div className="mt-1 text-[26px] font-semibold tracking-[-0.02em] tabular-nums">
            {formatCLP(balance)}
          </div>
          <div className="mt-1 text-xs font-medium text-white/75">
            Ingresos − egresos
          </div>
        </div>
      </div>

      {/* Tendencia últimos 6 meses */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Últimos 6 meses</CardTitle>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand" />
              Ingresos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-warn/80" />
              Egresos
            </span>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex items-end gap-2 sm:gap-4">
            {serie.map((s) => (
              <div
                key={`${s.anio}-${s.mes}`}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-36 w-full items-end justify-center gap-1.5">
                  <div
                    title={`Ingresos: ${formatCLP(s.ingresos)}`}
                    className="w-4 rounded-t-md bg-brand sm:w-6"
                    style={{
                      height: `${Math.max(2, Math.round((s.ingresos / maxSerie) * 100))}%`,
                    }}
                  />
                  <div
                    title={`Egresos: ${formatCLP(s.egresos)}`}
                    className="w-4 rounded-t-md bg-warn/80 sm:w-6"
                    style={{
                      height: `${Math.max(2, Math.round((s.egresos / maxSerie) * 100))}%`,
                    }}
                  />
                </div>
                <span
                  className={
                    s.activo
                      ? "text-xs font-semibold text-foreground"
                      : "text-xs text-muted"
                  }
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

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
