import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { Kpi } from "@/components/ui/kpi";
import { formatCLP } from "@/lib/format";
import {
  FileText,
  Plus,
  Clock,
  CircleDollarSign,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  isDemo,
  demoCotizaciones,
  demoViajes,
  demoFacturas,
  demoGastos,
} from "@/lib/demo";
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
  viajePorFacturar,
  costoTotalViaje,
  facturaPagada,
  type Factura,
  type Viaje,
  type GastoVehiculo,
} from "@/types/db";
import { FinanzasSecciones } from "./finanzas/secciones";

export const dynamic = "force-dynamic";

function delta(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export default async function DashboardPage() {
  const periodo = await getPeriodo();
  const prev = periodoAnterior(periodo);
  const { desde, hasta } = rangoPeriodo(periodo);

  let cotPeriodo: { total: number }[];
  let viajes: Viaje[];
  let facturas: Factura[];
  let gastos: GastoVehiculo[];

  if (isDemo()) {
    cotPeriodo = demoCotizaciones
      .filter((c) => enRango(c.fecha, periodo))
      .map((c) => ({ total: c.total }));
    viajes = demoViajes;
    facturas = demoFacturas;
    gastos = demoGastos;
  } else {
    const supabase = await createClient();
    const [
      { data: cotData },
      { data: viajesData },
      { data: factData },
      { data: gastosData },
    ] = await Promise.all([
      supabase
        .from("cotizaciones")
        .select("total")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase.from("viajes").select("*"),
      supabase.from("facturas").select("*"),
      supabase
        .from("gastos_vehiculo")
        .select("*")
        .gte("fecha", rangoPeriodo(prev).desde)
        .lte("fecha", hasta),
    ]);
    cotPeriodo = cotData ?? [];
    viajes = (viajesData ?? []) as Viaje[];
    facturas = (factData ?? []) as Factura[];
    gastos = (gastosData ?? []) as GastoVehiculo[];
  }

  // Fila 1 — KPIs del periodo. Todos los estados son DERIVADOS:
  // "por facturar" = viaje realizado sin factura; "por cobrar" = emitida sin
  // fecha de pago; "pagado" = fecha de pago dentro del periodo.
  const totalCotizado = cotPeriodo.reduce((a, c) => a + Number(c.total), 0);

  const pendientes = viajes.filter(
    (v) => viajePorFacturar(v) && enRango(v.fecha_inicio, periodo),
  );
  const pendienteFacturar = pendientes.reduce((a, v) => a + Number(v.valor), 0);

  const porCobrarArr = facturas.filter(
    (f) => f.estado === "emitida" && !facturaPagada(f) && enRango(f.fecha_emision, periodo),
  );
  const porCobrar = porCobrarArr.reduce((a, f) => a + Number(f.total), 0);

  const pagadasEn = (p: Periodo) =>
    facturas.filter((f) => f.estado === "emitida" && enRango(f.fecha_pago, p));
  const pagadasPeriodo = pagadasEn(periodo);
  const ingresos = pagadasPeriodo.reduce((a, f) => a + Number(f.total), 0);
  const ingresosPrev = pagadasEn(prev).reduce((a, f) => a + Number(f.total), 0);

  // Fila 2 — mismas definiciones que Finanzas: cobrado vs egresos del periodo
  // (gastos de flota + costos directos de los viajes: peajes, viáticos, etc.)
  const costosViajesEn = (p: Periodo) =>
    viajes
      .filter((v) => v.estado !== "cancelado" && enRango(v.fecha_inicio, p))
      .reduce((a, v) => a + costoTotalViaje(v), 0);
  const gastosPeriodo = gastos.filter((g) => enRango(g.fecha, periodo));
  const costos =
    gastosPeriodo.reduce((a, g) => a + Number(g.monto_total), 0) + costosViajesEn(periodo);
  const costosPrev =
    gastos.filter((g) => enRango(g.fecha, prev)).reduce((a, g) => a + Number(g.monto_total), 0) +
    costosViajesEn(prev);
  const utilidad = ingresos - costos;
  const margen = ingresos > 0 ? Math.round((utilidad / ingresos) * 100) : null;

  const dIngresos = delta(ingresos, ingresosPrev);
  const dCostos = delta(costos, costosPrev);
  const vs = etiquetaCorta(prev);

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
        <Link href="/viajes/nueva" className={buttonClass({ variant: "secondary" })}>
          <Plus className="h-4 w-4" />
          Viaje
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
          label="Por facturar"
          value={formatCLP(pendienteFacturar)}
          sub={`${pendientes.length} viaje${pendientes.length === 1 ? "" : "s"} realizado${pendientes.length === 1 ? "" : "s"}`}
          icon={Clock}
          tint="bg-info-bg text-info"
        />
        <Kpi
          label="Por cobrar"
          value={formatCLP(porCobrar)}
          valueClass="text-warn"
          sub={`${porCobrarArr.length} factura${porCobrarArr.length === 1 ? "" : "s"} emitida${porCobrarArr.length === 1 ? "" : "s"}`}
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
            dIngresos !== null ? (dIngresos >= 0 ? "text-ok" : "text-danger") : "text-muted"
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
              : "Flota + costos de viajes"
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

      {/* Secciones financieras (ex página "Resumen"): gráfico de 6 meses,
          egresos por vehículo/categoría e ingresos por cliente. */}
      <div className="mt-6">
        <FinanzasSecciones />
      </div>
    </div>
  );
}
