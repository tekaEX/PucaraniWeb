import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { Plus, Receipt, Filter, Eye, Settings } from "lucide-react";
import {
  FACTURA_ESTADOS_DERIVADOS,
  type Cliente,
  type FacturaConRelaciones,
  type FacturaEstadoDerivado,
} from "@/types/db";
import { rangoPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import { getPeriodo } from "@/lib/periodo-server";
import { datosNuevaFactura } from "./nueva/datos";
import { FacturaAccordion } from "./factura-accordion";
import { configSii } from "./config-sii";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

const ESTADOS = Object.keys(FACTURA_ESTADOS_DERIVADOS) as FacturaEstadoDerivado[];

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; cliente?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  const supabase = await createClient();
  const { data: clientesData } = await supabase.from("clientes").select("*").order("nombre");
  const clientes = (clientesData ?? []) as Cliente[];

  let query = supabase
    .from("facturas")
    .select("*, cliente:clientes(id,nombre,codigo), viajes:viajes(id,cliente_id,descripcion,fecha_inicio,valor)")
    .order("fecha_emision", { ascending: false, nullsFirst: true });

  if (sp.estado === "borrador") query = query.eq("estado", "borrador");
  else if (sp.estado === "anulada") query = query.eq("estado", "anulada");
  else if (sp.estado === "por_cobrar")
    query = query.eq("estado", "emitida").is("fecha_pago", null);
  else if (sp.estado === "pagada")
    query = query.eq("estado", "emitida").not("fecha_pago", "is", null);

  if (sp.cliente) query = query.eq("cliente_id", sp.cliente);
  // Los borradores (sin fecha de emisión) se muestran siempre; el resto
  // respeta el periodo global.
  query = query.or(
    `fecha_emision.is.null,and(fecha_emision.gte.${desde},fecha_emision.lte.${hasta})`,
  );

  const { data } = await query;
  let facturas = (data ?? []) as FacturaConRelaciones[];

  if (sp.q) {
    const q = sp.q.toLowerCase();
    facturas = facturas.filter(
      (f) =>
        String(f.folio ?? "").includes(q) ||
        f.viajes.some((v) => v.descripcion.toLowerCase().includes(q)),
    );
  }

  // Para editar inline en el acordeón: viajes aún por facturar (se suman a
  // los propios de cada factura dentro del acordeón).
  const { viajesDisponibles: porFacturar } = await datosNuevaFactura();

  // Estado de la emisión electrónica. Se resuelve una vez por pantalla y no
  // dentro de cada fila: el motivo es el mismo para todas las facturas.
  const sii = await configSii();

  const informeParams = new URLSearchParams();
  if (sp.cliente) informeParams.set("cliente", sp.cliente);
  if (periodo.mes !== null) {
    informeParams.set("mes", `${periodo.anio}-${String(periodo.mes).padStart(2, "0")}`);
  }
  if (sp.q) informeParams.set("q", sp.q);
  const informeQs = informeParams.toString();
  const informeSuffix = informeQs ? `?${informeQs}` : "";

  return (
    <div>
      <PageHeader
        title="Facturas"
        description={`Documentos emitidos en ${etiquetaPeriodo(periodo).toLowerCase()} (los borradores se muestran siempre). Haz clic en una para editarla.`}
      >
        <Link
          href="/facturas/configuracion"
          className={buttonClass({ variant: "secondary" })}
        >
          <Settings className="h-4 w-4" />
          Configuración SII
        </Link>
        <Link
          href={`/facturas/informe${informeSuffix}`}
          className={buttonClass({ variant: "secondary" })}
        >
          <Eye className="h-4 w-4" />
          Ver informe general
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
                  {FACTURA_ESTADOS_DERIVADOS[e]}
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
          <div className="min-w-44 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Buscar</label>
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Folio o descripción…" />
          </div>
          <button type="submit" className={buttonClass({ variant: "secondary" })}>
            <Filter className="h-4 w-4" />
            Filtrar
          </button>
          {sp.estado || sp.cliente || sp.q ? (
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
            Crear una factura
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <FacturaAccordion
              facturas={facturas}
              clientes={clientes}
              porFacturar={porFacturar}
              sii={sii}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
