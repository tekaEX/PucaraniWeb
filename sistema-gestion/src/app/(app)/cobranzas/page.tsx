import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { CircleDollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCLP } from "@/lib/format";
import { isDemo, demoFacturas } from "@/lib/demo";
import { getPeriodo, enRango, etiquetaPeriodo } from "@/lib/periodo";
import { montoFactura, type FacturaConRelaciones } from "@/types/db";
import { CobranzaAccordion, type CobranzaCliente } from "./cobranza-accordion";

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

export default async function CobranzasPage() {
  const periodo = await getPeriodo();

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

  // Periodo global: las pagadas cuentan por fecha de pago; el resto por
  // fecha del servicio.
  facturas = facturas.filter((f) =>
    f.estado === "pagada"
      ? enRango(f.fecha_pago, periodo)
      : enRango(f.fecha, periodo),
  );

  const map = new Map<string, CobranzaCliente>();
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
        facturas: [],
      });
    }
    const a = map.get(key)!;
    a.facturas.push(f);
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
        description={`Cuánto te debe cada empresa · ${etiquetaPeriodo(periodo)}. Haz clic en una para ver su estado de cuenta.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Por cobrar"
          value={formatCLP(totPorCobrar)}
          valueClass="text-warn"
          sub="Facturado, sin pago"
          icon={CircleDollarSign}
          tint="bg-warn-bg text-warn"
        />
        <Kpi
          label="Vencido"
          value={formatCLP(totVencido)}
          valueClass={totVencido ? "text-danger" : ""}
          sub={`+${DIAS_VENCE} días sin pago`}
          icon={AlertTriangle}
          tint="bg-danger-bg text-danger"
        />
        <Kpi
          label="Pagado"
          value={formatCLP(totPagado)}
          valueClass={totPagado ? "text-ok" : ""}
          sub={etiquetaPeriodo(periodo).toLowerCase()}
          icon={CheckCircle2}
          tint="bg-ok-bg text-ok"
        />
      </div>

      {filas.length === 0 ? (
        <Card className="px-6 py-16 text-center text-sm text-muted">
          No hay facturas registradas todavía.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <CobranzaAccordion filas={filas} />
          </div>
        </Card>
      )}
    </div>
  );
}
