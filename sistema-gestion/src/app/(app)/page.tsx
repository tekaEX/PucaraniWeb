import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { FacturaBadge } from "@/components/ui/badge";
import { Kpi } from "@/components/ui/kpi";
import { formatCLP, formatDate } from "@/lib/format";
import {
  FileText,
  Receipt,
  Plus,
  Clock,
  CircleDollarSign,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import {
  isDemo,
  demoCotizaciones,
  demoFacturas,
  demoGastos,
  demoChoferes,
  demoVehiculos,
} from "@/lib/demo";
import { construirAlertas } from "@/lib/vencimientos";
import {
  getPeriodo,
  rangoPeriodo,
  periodoAnterior,
  enRango,
  etiquetaPeriodo,
  etiquetaCorta,
  type Periodo,
} from "@/lib/periodo";
import {
  montoFactura,
  type Factura,
  type FacturaConRelaciones,
  type FacturaEstado,
  type GastoVehiculo,
  type Chofer,
  type Vehiculo,
} from "@/types/db";

export const dynamic = "force-dynamic";

// Tinte de fila sutil según estado (mismo criterio del sistema de diseño).
function rowTone(estado: FacturaEstado) {
  if (estado === "facturada") return "bg-[#fffdf8]";
  if (estado === "por_facturar") return "bg-[#fcfdff]";
  return "";
}

function delta(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export default async function DashboardPage() {
  const periodo = await getPeriodo();
  const prev = periodoAnterior(periodo);
  const { desde, hasta } = rangoPeriodo(periodo);
  const { desde: prevDesde } = rangoPeriodo(prev);

  let cotPeriodo: { total: number }[];
  let facturas: Factura[];
  let gastos: GastoVehiculo[];
  let recientes: FacturaConRelaciones[];
  let choferes: Chofer[];
  let vehiculos: Vehiculo[];

  if (isDemo()) {
    cotPeriodo = demoCotizaciones
      .filter((c) => enRango(c.fecha, periodo))
      .map((c) => ({ total: c.total }));
    facturas = demoFacturas;
    gastos = demoGastos;
    recientes = demoFacturas
      .filter((f) => enRango(f.fecha, periodo))
      .slice(0, 8);
    choferes = demoChoferes;
    vehiculos = demoVehiculos;
  } else {
    const supabase = await createClient();
    const [
      { data: cotData },
      { data: factData },
      { data: gastosData },
      { data: recientesData },
      { data: choData },
      { data: vehData },
    ] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select("total")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase.from("facturas").select("*"),
      supabase
        .from("gastos_vehiculo")
        .select("*")
        .gte("fecha", prevDesde)
        .lte("fecha", hasta),
      supabase
        .from("facturas")
        .select("*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero)")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false })
        .limit(8),
      supabase.from("choferes").select("*"),
      supabase.from("vehiculos").select("*"),
    ]);
    cotPeriodo = cotData ?? [];
    facturas = (factData ?? []) as Factura[];
    gastos = (gastosData ?? []) as GastoVehiculo[];
    recientes = (recientesData ?? []) as FacturaConRelaciones[];
    choferes = (choData ?? []) as Chofer[];
    vehiculos = (vehData ?? []) as Vehiculo[];
  }

  // Fila 1 — todo referido al periodo global (pagadas por fecha de pago,
  // el resto por fecha del servicio).
  const totalCotizado = cotPeriodo.reduce((a, c) => a + Number(c.total), 0);
  const pendientes = facturas.filter(
    (f) =>
      (f.estado === "en_proceso" || f.estado === "por_facturar") &&
      enRango(f.fecha, periodo),
  );
  const pendienteFacturar = pendientes.reduce((a, f) => a + montoFactura(f), 0);
  const porCobrarArr = facturas.filter(
    (f) => f.estado === "facturada" && enRango(f.fecha, periodo),
  );
  const porCobrar = porCobrarArr.reduce((a, f) => a + montoFactura(f), 0);

  const pagadasEn = (p: Periodo) =>
    facturas.filter((f) => f.estado === "pagada" && enRango(f.fecha_pago, p));
  const pagadasPeriodo = pagadasEn(periodo);
  const ingresos = pagadasPeriodo.reduce((a, f) => a + montoFactura(f), 0);
  const ingresosPrev = pagadasEn(prev).reduce((a, f) => a + montoFactura(f), 0);

  // Fila 2 — mismas definiciones que Finanzas: cobrado vs gastos del periodo
  const gastosPeriodo = gastos.filter((g) => enRango(g.fecha, periodo));
  const costos = gastosPeriodo.reduce((a, g) => a + Number(g.monto_total), 0);
  const costosPrev = gastos
    .filter((g) => enRango(g.fecha, prev))
    .reduce((a, g) => a + Number(g.monto_total), 0);
  const utilidad = ingresos - costos;
  const margen = ingresos > 0 ? Math.round((utilidad / ingresos) * 100) : null;

  const dIngresos = delta(ingresos, ingresosPrev);
  const dCostos = delta(costos, costosPrev);
  const vs = etiquetaCorta(prev);

  const alertas = construirAlertas(choferes, vehiculos);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Resumen del negocio · ${etiquetaPeriodo(periodo)}`}
      >
        <Link href="/cotizaciones/nueva" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Cotización
        </Link>
        <Link
          href="/facturas/nueva"
          className={buttonClass({ variant: "secondary" })}
        >
          <Plus className="h-4 w-4" />
          Factura
        </Link>
      </PageHeader>

      {/* Fila 1 — KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Cotizaciones"
          value={formatCLP(totalCotizado)}
          sub={`${cotPeriodo.length} emitida${cotPeriodo.length === 1 ? "" : "s"}`}
          icon={FileText}
          tint="bg-brand-soft text-brand"
        />
        <Kpi
          label="Pendiente de facturar"
          value={formatCLP(pendienteFacturar)}
          sub={`${pendientes.length} servicio${pendientes.length === 1 ? "" : "s"}`}
          icon={Clock}
          tint="bg-info-bg text-info"
        />
        <Kpi
          label="Por cobrar"
          value={formatCLP(porCobrar)}
          valueClass="text-warn"
          sub={`${porCobrarArr.length} factura${porCobrarArr.length === 1 ? "" : "s"}`}
          icon={CircleDollarSign}
          tint="bg-warn-bg text-warn"
        />
        <Kpi
          label="Pagado"
          value={formatCLP(ingresos)}
          valueClass="text-ok"
          sub={etiquetaPeriodo(periodo).toLowerCase()}
          icon={CheckCircle2}
          tint="bg-ok-bg text-ok"
        />
      </div>

      {/* Fila 2 — mismas cifras que Finanzas */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Ingresos"
          value={formatCLP(ingresos)}
          sub={
            dIngresos !== null
              ? `${dIngresos >= 0 ? "+" : ""}${dIngresos}% vs. ${vs}`
              : `${pagadasPeriodo.length} factura${pagadasPeriodo.length === 1 ? "" : "s"} pagada${pagadasPeriodo.length === 1 ? "" : "s"}`
          }
          subClass={
            dIngresos !== null
              ? dIngresos >= 0
                ? "text-ok"
                : "text-danger"
              : "text-muted"
          }
          icon={TrendingUp}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Costos"
          value={formatCLP(costos)}
          sub={
            dCostos !== null
              ? `${dCostos >= 0 ? "+" : ""}${dCostos}% vs. ${vs}`
              : `${gastosPeriodo.length} gasto${gastosPeriodo.length === 1 ? "" : "s"}`
          }
          icon={TrendingDown}
          tint="bg-[#ececef] text-[#6e6e73]"
        />
        <Kpi
          label="Utilidad"
          value={formatCLP(utilidad)}
          valueClass={utilidad < 0 ? "text-danger" : "text-ok"}
          sub={margen !== null ? `margen ${margen}%` : "Ingresos − costos"}
          icon={utilidad < 0 ? TrendingDown : TrendingUp}
          tint={utilidad < 0 ? "bg-danger-bg text-danger" : "bg-ok-bg text-ok"}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Alertas de documentos</CardTitle>
          <Link href="/vehiculos" className="text-sm font-medium text-brand hover:underline">
            Ver flota
          </Link>
        </CardHeader>
        <CardBody>
          {alertas.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <CheckCircle2 className="h-4 w-4 text-ok" />
              Toda la documentación está al día.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alertas.map((a, i) => (
                <li
                  key={`${a.refId}-${a.documento}-${i}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle
                      className={`h-4 w-4 ${a.estado === "vencido" ? "text-danger" : "text-warn"}`}
                    />
                    <span className="font-medium">{a.nombre}</span>
                    <span className="text-muted">· {a.documento}</span>
                  </div>
                  <span
                    className={`text-xs font-medium ${a.estado === "vencido" ? "text-danger" : "text-warn"}`}
                  >
                    {a.estado === "vencido"
                      ? `Vencido hace ${Math.abs(a.dias)} día(s)`
                      : `Vence en ${a.dias} día(s)`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Últimos servicios</CardTitle>
          <Link
            href="/facturas"
            className="text-sm font-medium text-brand hover:underline"
          >
            Ver todo
          </Link>
        </CardHeader>
        {recientes.length === 0 ? (
          <CardBody>
            <p className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted">
              <Receipt className="h-7 w-7" />
              Aún no hay facturas registradas.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recientes.map((f) => (
                  <tr key={f.id} className={`${rowTone(f.estado)} hover:bg-gray-100/60`}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {formatDate(f.fecha)}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate">
                      {f.descripcion ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {f.cliente?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatCLP(montoFactura(f))}
                    </td>
                    <td className="px-4 py-2.5">
                      <FacturaBadge estado={f.estado} />
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
