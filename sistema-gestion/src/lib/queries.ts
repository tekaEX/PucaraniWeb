import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  VIAJE_ESTADOS,
  facturaEstadoDerivado,
  type Empresa,
  type Cotizacion,
  type CotizacionItem,
  type Cliente,
  type Factura,
  type ViajeEstado,
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
// Informe de servicios (viajes del periodo, con su estado de facturación)
// Es el documento que se le envía al cliente: el detalle de los servicios
// prestados y cómo va cada uno (por facturar / facturado / pagado).
// ---------------------------------------------------------------------------
export type InformeFiltros = {
  estado?: string;
  cliente?: string;
  mes?: string;
  q?: string;
};

export type ViajeInformeRow = {
  id: string;
  fecha_inicio: string;
  descripcion: string;
  orden_compra: string | null;
  valor: number;
  clienteNombre: string;
  folio: number | null;
  estadoLabel: string;
};

export type ViajesInforme = {
  empresa: Empresa | null;
  viajes: ViajeInformeRow[];
  periodoLabel: string;
  empresaLabel: string;
  estadoLabel: string;
  total: number;
};

const ESTADOS_VIAJE = Object.keys(VIAJE_ESTADOS) as ViajeEstado[];

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

type FacturaRef = Pick<Factura, "folio" | "estado" | "fecha_pago"> | null;

function estadoViajeLabel(estado: ViajeEstado, factura: FacturaRef): string {
  if (estado === "cancelado") return "Cancelado";
  if (estado === "programado") return "Programado";
  if (!factura) return "Por facturar";
  const fe = facturaEstadoDerivado(factura);
  if (fe === "pagada") return "Pagada";
  if (fe === "por_cobrar") return "Facturada (por pagar)";
  if (fe === "anulada") return "Factura anulada";
  return "Factura en borrador";
}

const FILTRO_LABELS: Record<string, string> = {
  por_facturar: "Por facturar",
  programado: "Programados",
  realizado: "Realizados",
  cancelado: "Cancelados",
};

export async function getViajesInforme(
  filtros: InformeFiltros,
): Promise<ViajesInforme> {
  const estado =
    filtros.estado &&
    (filtros.estado === "por_facturar" ||
      ESTADOS_VIAJE.includes(filtros.estado as ViajeEstado))
      ? filtros.estado
      : undefined;

  let empresa: Empresa | null;
  let filas: ViajeInformeRow[];
  let empresaLabel = "Todas las empresas";

  {
    const supabase = await createClient();
    const { data: emp } = await supabase
      .from("empresa")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    empresa = (emp as Empresa) ?? null;

    let query = supabase
      .from("viajes")
      .select(
        "id, fecha_inicio, descripcion, orden_compra, valor, estado, cliente:clientes(id,nombre), factura:facturas(folio,estado,fecha_pago)",
      )
      .order("fecha_inicio", { ascending: true });

    if (estado === "por_facturar") {
      query = query.eq("estado", "realizado").is("factura_id", null);
    } else if (estado) {
      query = query.eq("estado", estado);
    }
    if (filtros.cliente) query = query.eq("cliente_id", filtros.cliente);
    if (filtros.q) query = query.ilike("descripcion", `%${filtros.q}%`);
    if (filtros.mes && /^\d{4}-\d{2}$/.test(filtros.mes)) {
      const [y, m] = filtros.mes.split("-").map(Number);
      const start = `${filtros.mes}-01`;
      const end = new Date(y, m, 0).toISOString().slice(0, 10);
      query = query.gte("fecha_inicio", start).lte("fecha_inicio", end);
    }

    const { data } = await query;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    filas = ((data ?? []) as any[]).map((v) => ({
      id: v.id,
      fecha_inicio: v.fecha_inicio,
      descripcion: v.descripcion,
      orden_compra: v.orden_compra,
      valor: Number(v.valor),
      clienteNombre: v.cliente?.nombre ?? "—",
      folio: v.factura?.folio ?? null,
      estadoLabel: estadoViajeLabel(v.estado, v.factura ?? null),
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    if (filtros.cliente) {
      const { data: c } = await supabase
        .from("clientes")
        .select("nombre")
        .eq("id", filtros.cliente)
        .maybeSingle();
      if (c?.nombre) empresaLabel = c.nombre;
    }
  }

  const total = filas.reduce((acc, v) => acc + v.valor, 0);

  return {
    empresa,
    viajes: filas,
    periodoLabel: mesLabel(filtros.mes),
    empresaLabel,
    estadoLabel: estado ? (FILTRO_LABELS[estado] ?? estado) : "Todos los estados",
    total,
  };
}
