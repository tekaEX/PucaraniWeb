import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { Plus, Receipt, Filter, Eye } from "lucide-react";
import {
  isDemo,
  demoClientes,
  demoFacturas,
  demoCotizacionesLite,
  demoChoferes,
  demoVehiculos,
} from "@/lib/demo";
import {
  FACTURA_ESTADOS,
  type Cliente,
  type FacturaConRelaciones,
  type FacturaEstado,
} from "@/types/db";
import { FacturaAccordion } from "./factura-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

const ESTADOS = Object.keys(FACTURA_ESTADOS) as FacturaEstado[];

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    cliente?: string;
    q?: string;
    mes?: string;
  }>;
}) {
  const sp = await searchParams;

  let clientes: Cliente[];
  let facturas: FacturaConRelaciones[];
  let cotizaciones: { id: string; numero: number; cliente_id: string | null; total: number }[];
  let choferes: { id: string; nombre: string }[];
  let vehiculos: { id: string; patente: string }[];

  if (isDemo()) {
    clientes = demoClientes;
    cotizaciones = demoCotizacionesLite();
    choferes = demoChoferes.map((c) => ({ id: c.id, nombre: c.nombre }));
    vehiculos = demoVehiculos.map((v) => ({ id: v.id, patente: v.patente }));
    facturas = demoFacturas.filter((f) => {
      if (
        sp.estado &&
        ESTADOS.includes(sp.estado as FacturaEstado) &&
        f.estado !== sp.estado
      )
        return false;
      if (sp.cliente && f.cliente_id !== sp.cliente) return false;
      if (
        sp.q &&
        !(f.descripcion ?? "").toLowerCase().includes(sp.q.toLowerCase())
      )
        return false;
      if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) && !f.fecha.startsWith(sp.mes))
        return false;
      return true;
    });
  } else {
    const supabase = await createClient();
    const [
      { data: clientesData },
      { data: cotData },
      { data: choData },
      { data: vehData },
    ] = await Promise.all([
      supabase.from("clientes").select("*").order("nombre"),
      supabase.from("cotizaciones").select("id,numero,cliente_id,total").order("numero", { ascending: false }),
      supabase.from("choferes").select("id,nombre").order("nombre"),
      supabase.from("vehiculos").select("id,patente").order("patente"),
    ]);
    clientes = (clientesData ?? []) as Cliente[];
    cotizaciones = cotData ?? [];
    choferes = choData ?? [];
    vehiculos = vehData ?? [];

    let query = supabase
      .from("facturas")
      .select(
        "*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero)",
      )
      .order("fecha", { ascending: false });

    if (sp.estado && ESTADOS.includes(sp.estado as FacturaEstado)) {
      query = query.eq("estado", sp.estado);
    }
    if (sp.cliente) query = query.eq("cliente_id", sp.cliente);
    if (sp.q) query = query.ilike("descripcion", `%${sp.q}%`);
    if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
      const [y, m] = sp.mes.split("-").map(Number);
      const start = `${sp.mes}-01`;
      const end = new Date(y, m, 0).toISOString().slice(0, 10);
      query = query.gte("fecha", start).lte("fecha", end);
    }

    const { data } = await query;
    facturas = (data ?? []) as FacturaConRelaciones[];
  }

  const informeParams = new URLSearchParams();
  if (sp.estado) informeParams.set("estado", sp.estado);
  if (sp.cliente) informeParams.set("cliente", sp.cliente);
  if (sp.mes) informeParams.set("mes", sp.mes);
  if (sp.q) informeParams.set("q", sp.q);
  const informeQs = informeParams.toString();
  const informeSuffix = informeQs ? `?${informeQs}` : "";

  return (
    <div>
      <PageHeader
        title="Facturas y seguimiento"
        description="Servicios y estado de pago. Haz clic en la descripción para ver y editar."
      >
        <Link
          href={`/facturas/informe${informeSuffix}`}
          className={buttonClass({ variant: "secondary" })}
        >
          <Eye className="h-4 w-4" />
          Ver informe
        </Link>
        <Link href="/facturas/nueva" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nueva factura
        </Link>
      </PageHeader>

      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-40">
            <label className="mb-1 block text-xs font-medium text-muted">Estado</label>
            <Select name="estado" defaultValue={sp.estado ?? ""}>
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {FACTURA_ESTADOS[e]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-44">
            <label className="mb-1 block text-xs font-medium text-muted">Cliente</label>
            <Select name="cliente" defaultValue={sp.cliente ?? ""}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Mes</label>
            <Input type="month" name="mes" defaultValue={sp.mes ?? ""} className="w-40" />
          </div>
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Buscar</label>
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Descripción…" />
          </div>
          <button type="submit" className={buttonClass({ variant: "secondary" })}>
            <Filter className="h-4 w-4" />
            Filtrar
          </button>
          {sp.estado || sp.cliente || sp.mes || sp.q ? (
            <Link href="/facturas" className={buttonClass({ variant: "ghost" })}>
              Limpiar
            </Link>
          ) : null}
        </form>
      </Card>

      {facturas.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Receipt className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">No hay facturas con esos filtros.</p>
          <Link href="/facturas/nueva" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Registrar una factura
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <FacturaAccordion
              facturas={facturas}
              clientes={clientes}
              cotizaciones={cotizaciones}
              choferes={choferes}
              vehiculos={vehiculos}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
