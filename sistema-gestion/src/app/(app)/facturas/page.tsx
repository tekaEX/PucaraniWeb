import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { Plus, Receipt, Filter, Eye, HandCoins } from "lucide-react";
import { isDemo, demoClientes, demoFacturas } from "@/lib/demo";
import {
  FACTURA_ESTADOS_DERIVADOS,
  TIPOS_DTE,
  facturaEstadoDerivado,
  type Cliente,
  type FacturaConRelaciones,
  type FacturaEstadoDerivado,
} from "@/types/db";
import { formatCLP, formatDate } from "@/lib/format";
import { getPeriodo, rangoPeriodo, enRango } from "@/lib/periodo";
import { marcarPagada } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

const ESTADOS = Object.keys(FACTURA_ESTADOS_DERIVADOS) as FacturaEstadoDerivado[];

const estadoChip: Record<FacturaEstadoDerivado, string> = {
  borrador: "bg-[#ececef] text-[#6e6e73]",
  por_cobrar: "bg-warn-bg text-warn",
  pagada: "bg-ok-bg text-ok",
  anulada: "bg-red-50 text-red-700",
};

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; cliente?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  let clientes: Cliente[];
  let facturas: FacturaConRelaciones[];

  if (isDemo()) {
    clientes = demoClientes;
    facturas = demoFacturas.filter((f) => {
      const derivado = facturaEstadoDerivado(f);
      if (sp.estado && ESTADOS.includes(sp.estado as FacturaEstadoDerivado) && derivado !== sp.estado)
        return false;
      if (sp.cliente && f.cliente_id !== sp.cliente) return false;
      if (
        sp.q &&
        !String(f.folio ?? "").includes(sp.q) &&
        !f.viajes.some((v) => v.descripcion.toLowerCase().includes(sp.q!.toLowerCase()))
      )
        return false;
      // Los borradores (sin fecha de emisión) se muestran siempre.
      if (f.fecha_emision && !enRango(f.fecha_emision, periodo)) return false;
      return true;
    });
    facturas = [...facturas].sort((a, b) =>
      (b.fecha_emision ?? "9999") < (a.fecha_emision ?? "9999") ? -1 : 1,
    );
  } else {
    const supabase = await createClient();
    const { data: clientesData } = await supabase.from("clientes").select("*").order("nombre");
    clientes = (clientesData ?? []) as Cliente[];

    let query = supabase
      .from("facturas")
      .select("*, cliente:clientes(id,nombre,codigo), viajes:viajes(id,descripcion,fecha_inicio,valor)")
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
    facturas = (data ?? []) as FacturaConRelaciones[];

    if (sp.q) {
      const q = sp.q.toLowerCase();
      facturas = facturas.filter(
        (f) =>
          String(f.folio ?? "").includes(q) ||
          f.viajes.some((v) => v.descripcion.toLowerCase().includes(q)),
      );
    }
  }

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
        description="Los documentos que emites: cada factura puede cubrir uno o varios viajes."
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Emisión</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Viajes incluidos</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {facturas.map((f) => {
                  const derivado = facturaEstadoDerivado(f);
                  return (
                    <tr key={f.id} className="border-b border-border last:border-0 hover:bg-background/60">
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/facturas/${f.id}`} className="font-medium text-foreground hover:underline">
                          {f.folio ? `N° ${f.folio}` : "Borrador"}
                        </Link>
                        <span className="ml-2 text-xs text-muted">
                          {TIPOS_DTE[f.tipo_dte] ?? `DTE ${f.tipo_dte}`}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {f.fecha_emision ? formatDate(f.fecha_emision) : "—"}
                      </td>
                      <td className="px-4 py-3">{f.cliente?.nombre ?? "—"}</td>
                      <td className="px-4 py-3">
                        {f.viajes.length === 0 ? (
                          <span className="text-muted">Sin viajes</span>
                        ) : f.viajes.length === 1 ? (
                          f.viajes[0].descripcion
                        ) : (
                          <span>
                            {f.viajes.length} viajes
                            <span className="ml-1 text-xs text-muted">
                              ({f.viajes[0].descripcion}…)
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {formatCLP(f.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoChip[derivado]}`}>
                          {FACTURA_ESTADOS_DERIVADOS[derivado]}
                          {derivado === "pagada" && f.fecha_pago ? ` · ${formatDate(f.fecha_pago)}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {derivado === "por_cobrar" ? (
                          <form action={marcarPagada}>
                            <input type="hidden" name="id" value={f.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-ok hover:underline"
                              title="Registrar pago con fecha de hoy"
                            >
                              <HandCoins className="h-3.5 w-3.5" />
                              Registrar pago
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
