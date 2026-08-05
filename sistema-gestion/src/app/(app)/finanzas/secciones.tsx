import { Truck, Wallet, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Vacio } from "@/components/ui/vacio";
import { formatCLP } from "@/lib/format";
import { getPeriodo, rangoPeriodo } from "@/lib/periodo";
import {
  GASTO_CATEGORIAS,
  costoTotalViaje,
  type GastoCategoria,
  type GastoVehiculo,
} from "@/types/db";

// Secciones financieras del Dashboard (ex página "Resumen" de Finanzas):
// gráfico de 6 meses + egresos por vehículo/categoría + ingresos por cliente.

type Ingreso = { monto: number; cliente: string };
type Mov = { fecha: string; monto: number };
type ViajeCosto = { fecha_inicio: string; estado: string; costo: number };

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

export async function FinanzasSecciones() {
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

  const supabase = await createClient();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [
    { data: fData },
    { data: gData },
    { data: hiData },
    { data: hgData },
    { data: vcData },
    { data: txData },
    { data: htData },
  ] = await Promise.all([
      supabase
        .from("facturas")
        .select("total, fecha_pago, cliente:clientes(nombre)")
        .eq("estado", "emitida")
        .gte("fecha_pago", desde)
        .lte("fecha_pago", hasta),
      supabase
        .from("gastos_vehiculo")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("facturas")
        .select("total, fecha_pago")
        .eq("estado", "emitida")
        .gte("fecha_pago", chartDesde)
        .lte("fecha_pago", chartHasta),
      supabase
        .from("gastos_vehiculo")
        .select("fecha, monto_total")
        .gte("fecha", chartDesde)
        .lte("fecha", chartHasta),
      supabase
        .from("viajes")
        .select("fecha_inicio, estado, costo_combustible, costo_peajes, costo_viaticos, costo_otros")
        .neq("estado", "cancelado")
        .gte("fecha_inicio", chartDesde)
        .lte("fecha_inicio", chartHasta),
      supabase
        .from("servicios_taxi")
        .select("monto, cliente_texto, cliente:clientes(nombre)")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("servicios_taxi")
        .select("fecha, monto")
        .gte("fecha", chartDesde)
        .lte("fecha", chartHasta),
    ]);
  const ingresosArr: Ingreso[] = ((fData ?? []) as any[]).map((f) => ({
    monto: Number(f.total),
    cliente: f.cliente?.nombre ?? "—",
  }));
  // Los servicios de taxi también son ingresos por cliente.
  ingresosArr.push(
    ...((txData ?? []) as any[]).map((t) => ({
      monto: Number(t.monto),
      cliente: t.cliente?.nombre ?? t.cliente_texto ?? "Taxis (particular)",
    })),
  );
  const gastos = (gData ?? []) as GastoVehiculo[];
  const histIngresos: Mov[] = ((hiData ?? []) as any[]).map((f) => ({
    fecha: f.fecha_pago as string,
    monto: Number(f.total),
  }));
  histIngresos.push(
    ...((htData ?? []) as any[]).map((t) => ({
      fecha: t.fecha as string,
      monto: Number(t.monto),
    })),
  );
  let histGastos: Mov[] = ((hgData ?? []) as any[]).map((g) => ({
    fecha: g.fecha as string,
    monto: Number(g.monto_total),
  }));
  const viajesCostos: ViajeCosto[] = ((vcData ?? []) as any[]).map((v) => ({
    fecha_inicio: v.fecha_inicio as string,
    estado: v.estado as string,
    costo: costoTotalViaje(v),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Los costos directos de los viajes (peajes, viáticos, etc.) también son
  // egresos: entran al gráfico.
  histGastos = [
    ...histGastos,
    ...viajesCostos.filter((v) => v.costo > 0).map((v) => ({ fecha: v.fecha_inicio, monto: v.costo })),
  ];

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
  // g.vehiculo_id ES la patente (PK del vehículo).
  const porVehiculo = [...porVehMap.entries()]
    .map(([patente, total]) => ({
      patente: patente === "sin" ? "Sin asignar" : patente,
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
    <div className="space-y-4">
      {/* Tendencia últimos 6 meses */}
      <Card>
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Egresos por vehículo</CardTitle>
          </CardHeader>
          <CardBody>
            {porVehiculo.length === 0 ? (
              <Vacio titulo="Sin egresos en el periodo." icono={<Truck className="h-7 w-7" />} />
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
                    <div className="h-1.5 rounded-full bg-border/40">
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
              <Vacio titulo="Sin egresos en el periodo." icono={<Wallet className="h-7 w-7" />} />
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
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Ingresos cobrados por cliente</CardTitle>
        </CardHeader>
        {porCliente.length === 0 ? (
          <CardBody>
            <Vacio
              titulo="No hay facturas pagadas en este periodo."
              icono={<FileText className="h-7 w-7" />}
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {porCliente.map((c) => (
                  <tr key={c.cliente} className="hover:bg-background">
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
