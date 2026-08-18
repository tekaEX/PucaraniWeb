import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { Kpi } from "@/components/ui/kpi";
import { ErrorDatos } from "@/components/ui/error-datos";
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
import { periodoAnterior, etiquetaPeriodo, etiquetaCorta } from "@/lib/periodo";
import { getPeriodo } from "@/lib/periodo-server";
import { delta, resumenFinanciero } from "@/lib/finanzas";
import { cargarDatosFinancieros } from "@/lib/finanzas-server";
import { FinanzasSecciones } from "./finanzas/secciones";

export const dynamic = "force-dynamic";

// El Dashboard no calcula nada por su cuenta: pide los datos a
// lib/finanzas-server.ts y su significado a lib/finanzas.ts. Antes hacía las
// dos cosas acá adentro, con las mismas definiciones que también estaban
// escritas en finanzas/secciones.tsx — dos pantallas derivando por separado
// las mismas cifras. Lo que queda acá es lo que de verdad le toca a una
// página: pedir, y mostrar.
//
// Se pide el resumen dos veces sobre el MISMO conjunto de datos —el periodo y
// el anterior— porque la carga trae los dos rangos de una pasada y las
// funciones del modelo filtran en memoria.
export default async function DashboardPage() {
  const periodo = await getPeriodo();
  const prev = periodoAnterior(periodo);

  const { datos, meses, error } = await cargarDatosFinancieros(periodo);
  if (error) {
    return (
      <div>
        <PageHeader title="Inicio" description={etiquetaPeriodo(periodo)} />
        <ErrorDatos
          titulo="No se pudieron leer los datos del periodo."
          detalle={error.message}
        />
      </div>
    );
  }

  const r = resumenFinanciero(datos, periodo);
  const anterior = resumenFinanciero(datos, prev);

  const dIngresos = delta(r.ingresos, anterior.ingresos);
  const dCostos = delta(r.costos, anterior.costos);
  const vs = etiquetaCorta(prev);
  const plural = (n: number, sing: string, plur = `${sing}s`) => (n === 1 ? sing : plur);

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
      <div className="stagger-in grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Cotizaciones"
          value={formatCLP(r.totalCotizado)}
          sub={`${r.conteos.cotizaciones} ${plural(r.conteos.cotizaciones, "emitida")}`}
          icon={FileText}
          tint="bg-brand-soft text-brand"
        />
        <Kpi
          label="Por facturar"
          value={formatCLP(r.pendienteFacturar)}
          sub={`${r.conteos.porFacturar} ${plural(r.conteos.porFacturar, "viaje")} ${plural(r.conteos.porFacturar, "realizado")}`}
          icon={Clock}
          tint="bg-info-bg text-info"
        />
        <Kpi
          label="Por cobrar"
          value={formatCLP(r.porCobrar)}
          valueClass="text-warn"
          sub={`${r.conteos.porCobrar} ${plural(r.conteos.porCobrar, "factura")} ${plural(r.conteos.porCobrar, "emitida")}`}
          icon={CircleDollarSign}
          tint="bg-warn-bg text-warn"
        />
        <Kpi
          label="Pagado"
          value={formatCLP(r.ingresos)}
          valueClass="text-ok"
          sub={etiquetaPeriodo(periodo).toLowerCase()}
          icon={CheckCircle2}
          tint="bg-ok-bg text-ok"
        />
      </div>

      {/* Fila 2 — mismas cifras que Finanzas */}
      <div className="stagger-in mt-4 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Ingresos"
          value={formatCLP(r.ingresos)}
          sub={
            dIngresos !== null
              ? `${dIngresos >= 0 ? "+" : ""}${dIngresos}% vs. ${vs}`
              : `${r.conteos.pagadas} ${plural(r.conteos.pagadas, "factura")} ${plural(r.conteos.pagadas, "pagada")}`
          }
          subClass={
            dIngresos !== null ? (dIngresos >= 0 ? "text-ok" : "text-danger") : "text-muted"
          }
          icon={TrendingUp}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Costos"
          value={formatCLP(r.costos)}
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
          value={formatCLP(r.utilidad)}
          valueClass={r.utilidad < 0 ? "text-danger" : "text-ok"}
          sub={r.margen !== null ? `margen ${r.margen}%` : "Ingresos − costos"}
          icon={r.utilidad < 0 ? TrendingDown : TrendingUp}
          tint={r.utilidad < 0 ? "bg-danger-bg text-danger" : "bg-ok-bg text-ok"}
        />
      </div>

      {/* Secciones financieras (ex página "Resumen"): tendencia mensual,
          egresos por vehículo/categoría e ingresos por cliente. Reciben los
          MISMOS datos que los KPI de arriba: una sola carga, una sola verdad. */}
      <div className="mt-6">
        <FinanzasSecciones datos={datos} periodo={periodo} meses={meses} />
      </div>
    </div>
  );
}
