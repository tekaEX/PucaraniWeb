import { createClient } from "@/lib/supabase/server";
import {
  isDemo,
  demoEmpresa,
  demoCotizaciones,
  demoFacturas,
  demoClientes,
} from "@/lib/demo";
import {
  FACTURA_ESTADOS,
  type Empresa,
  type Cotizacion,
  type CotizacionItem,
  type Cliente,
  type FacturaConRelaciones,
  type FacturaEstado,
} from "@/types/db";

export type CotizacionDocumento = {
  empresa: Empresa | null;
  cotizacion: Cotizacion & {
    cliente: Cliente | null;
    items: CotizacionItem[];
  };
};

// Carga todos los datos necesarios para generar el PDF/Excel de una cotización.
export async function getCotizacionParaDocumento(
  id: string,
): Promise<CotizacionDocumento | null> {
  if (isDemo()) {
    const c = demoCotizaciones.find((x) => x.id === id) ?? demoCotizaciones[0];
    if (!c) return null;
    return { empresa: demoEmpresa, cotizacion: c };
  }

  const supabase = await createClient();

  const [{ data: empresa }, { data: cot }] = await Promise.all([
    supabase
      .from("empresa")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cotizaciones")
      .select("*, cliente:clientes(*), items:cotizacion_items(*)")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!cot) return null;

  const cotizacion = cot as Cotizacion & {
    cliente: Cliente | null;
    items: CotizacionItem[];
  };
  cotizacion.items = [...(cotizacion.items ?? [])].sort(
    (a, b) => a.orden - b.orden,
  );

  return { empresa: (empresa as Empresa) ?? null, cotizacion };
}

// ---------------------------------------------------------------------------
// Informe de facturas/servicios (lista por mes/empresa con total)
// ---------------------------------------------------------------------------
export type InformeFiltros = {
  estado?: string;
  cliente?: string;
  mes?: string;
  q?: string;
};

export type FacturasInforme = {
  empresa: Empresa | null;
  facturas: FacturaConRelaciones[];
  periodoLabel: string;
  empresaLabel: string;
  estadoLabel: string;
  total: number;
};

const ESTADOS = Object.keys(FACTURA_ESTADOS) as FacturaEstado[];

function mesLabel(mes?: string): string {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return "Todos los meses";
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function getFacturasInforme(
  filtros: InformeFiltros,
): Promise<FacturasInforme> {
  const estado =
    filtros.estado && ESTADOS.includes(filtros.estado as FacturaEstado)
      ? (filtros.estado as FacturaEstado)
      : undefined;

  let empresa: Empresa | null;
  let facturas: FacturaConRelaciones[];
  let empresaLabel = "Todas las empresas";

  if (isDemo()) {
    empresa = demoEmpresa;
    facturas = demoFacturas.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (filtros.cliente && f.cliente_id !== filtros.cliente) return false;
      if (
        filtros.q &&
        !(f.descripcion ?? "").toLowerCase().includes(filtros.q.toLowerCase())
      )
        return false;
      if (
        filtros.mes &&
        /^\d{4}-\d{2}$/.test(filtros.mes) &&
        !f.fecha.startsWith(filtros.mes)
      )
        return false;
      return true;
    });
    if (filtros.cliente) {
      const c = demoClientes.find((x) => x.id === filtros.cliente);
      if (c) empresaLabel = c.nombre;
    }
  } else {
    const supabase = await createClient();
    const [{ data: emp }] = await Promise.all([
      supabase
        .from("empresa")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    empresa = (emp as Empresa) ?? null;

    let query = supabase
      .from("facturas")
      .select(
        "*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero)",
      )
      .order("fecha", { ascending: true });

    if (estado) query = query.eq("estado", estado);
    if (filtros.cliente) query = query.eq("cliente_id", filtros.cliente);
    if (filtros.q) query = query.ilike("descripcion", `%${filtros.q}%`);
    if (filtros.mes && /^\d{4}-\d{2}$/.test(filtros.mes)) {
      const [y, m] = filtros.mes.split("-").map(Number);
      const start = `${filtros.mes}-01`;
      const end = new Date(y, m, 0).toISOString().slice(0, 10);
      query = query.gte("fecha", start).lte("fecha", end);
    }

    const { data } = await query;
    facturas = (data ?? []) as FacturaConRelaciones[];

    if (filtros.cliente) {
      const { data: c } = await supabase
        .from("clientes")
        .select("nombre")
        .eq("id", filtros.cliente)
        .maybeSingle();
      if (c?.nombre) empresaLabel = c.nombre;
    }
  }

  const total = facturas.reduce(
    (acc, f) => acc + Number(f.valor_a_pagar ?? f.valor_servicio),
    0,
  );

  return {
    empresa,
    facturas,
    periodoLabel: mesLabel(filtros.mes),
    empresaLabel,
    estadoLabel: estado ? FACTURA_ESTADOS[estado] : "Todos los estados",
    total,
  };
}
