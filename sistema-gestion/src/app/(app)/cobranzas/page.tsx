import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { CircleDollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCLP } from "@/lib/format";
import { isDemo, demoFacturas, demoViajes } from "@/lib/demo";
import { getPeriodo, enRango, etiquetaPeriodo } from "@/lib/periodo";
import {
  facturaEstadoDerivado,
  viajePorFacturar,
  type FacturaConRelaciones,
} from "@/types/db";
import {
  CobranzaAccordion,
  type CobranzaCliente,
  type ViajePendiente,
} from "./cobranza-accordion";

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

type ViajePendRaw = ViajePendiente & {
  cliente: { id: string; nombre: string } | null;
  cliente_id: string;
};

export default async function CobranzasPage() {
  const periodo = await getPeriodo();

  let facturas: FacturaConRelaciones[];
  let viajesPend: ViajePendRaw[];

  if (isDemo()) {
    facturas = demoFacturas;
    viajesPend = demoViajes
      .filter((v) => viajePorFacturar(v))
      .map((v) => ({
        id: v.id,
        fecha_inicio: v.fecha_inicio,
        descripcion: v.descripcion,
        valor: Number(v.valor),
        cliente_id: v.cliente_id,
        cliente: v.cliente ? { id: v.cliente.id, nombre: v.cliente.nombre } : null,
      }));
  } else {
    const supabase = await createClient();
    const [{ data: fData }, { data: vData }] = await Promise.all([
      supabase
        .from("facturas")
        .select("*, cliente:clientes(id,nombre,codigo), viajes:viajes(id,descripcion,fecha_inicio,valor)")
        .order("fecha_emision", { ascending: false, nullsFirst: true }),
      supabase
        .from("viajes")
        .select("id, fecha_inicio, descripcion, valor, cliente_id, cliente:clientes(id,nombre)")
        .eq("estado", "realizado")
        .is("factura_id", null)
        .order("fecha_inicio", { ascending: false }),
    ]);
    facturas = (fData ?? []) as FacturaConRelaciones[];
    viajesPend = (vData ?? []) as unknown as ViajePendRaw[];
  }

  // Periodo global: las pagadas cuentan por fecha de pago, las emitidas por
  // fecha de emisión; los borradores y los viajes sin facturar se muestran
  // siempre (son trabajo pendiente, no historia).
  facturas = facturas.filter((f) => {
    const derivado = facturaEstadoDerivado(f);
    if (derivado === "pagada") return enRango(f.fecha_pago, periodo);
    if (derivado === "por_cobrar" || derivado === "anulada")
      return enRango(f.fecha_emision, periodo);
    return true; // borradores
  });

  const map = new Map<string, CobranzaCliente>();
  const entrada = (key: string, nombre: string): CobranzaCliente => {
    if (!map.has(key)) {
      map.set(key, {
        clienteId: key,
        nombre,
        pendienteFacturar: 0,
        porCobrar: 0,
        vencido: 0,
        pagado: 0,
        facturas: [],
        viajesPendientes: [],
      });
    }
    return map.get(key)!;
  };

  for (const v of viajesPend) {
    if (!enRango(v.fecha_inicio, periodo)) continue;
    const a = entrada(v.cliente?.id ?? v.cliente_id, v.cliente?.nombre ?? "Sin cliente");
    a.viajesPendientes.push(v);
    a.pendienteFacturar += Number(v.valor);
  }

  for (const f of facturas) {
    const a = entrada(f.cliente?.id ?? "sin-cliente", f.cliente?.nombre ?? "Sin cliente");
    a.facturas.push(f);
    const derivado = facturaEstadoDerivado(f);
    const monto = Number(f.total);
    if (derivado === "pagada") a.pagado += monto;
    else if (derivado === "por_cobrar") {
      a.porCobrar += monto;
      if (f.fecha_emision && diasDesde(f.fecha_emision) > DIAS_VENCE) a.vencido += monto;
    } else if (derivado === "borrador") {
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
          No hay facturas ni viajes por facturar todavía.
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
