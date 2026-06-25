import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { EstadoFacturaSelect } from "./estado-select";
import { Plus, Receipt, Paperclip, Filter, Eye } from "lucide-react";
import { formatCLP, formatDate } from "@/lib/format";
import { isDemo, demoClientes, demoFacturas } from "@/lib/demo";
import {
  FACTURA_ESTADOS,
  type Cliente,
  type FacturaConRelaciones,
  type FacturaEstado,
} from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas" };

const ESTADOS = Object.keys(FACTURA_ESTADOS) as FacturaEstado[];

function rowTone(estado: FacturaEstado) {
  if (estado === "pagada") return "bg-green-50";
  if (estado === "facturada") return "bg-amber-50";
  return "";
}

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

  if (isDemo()) {
    clientes = demoClientes;
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
    const { data: clientesData } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre");
    clientes = (clientesData ?? []) as Cliente[];

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
      const end = new Date(y, m, 0).toISOString().slice(0, 10); // último día del mes
      query = query.gte("fecha", start).lte("fecha", end);
    }

    const { data } = await query;
    facturas = (data ?? []) as FacturaConRelaciones[];
  }

  const totalAPagar = facturas.reduce(
    (acc, f) => acc + Number(f.valor_a_pagar ?? f.valor_servicio),
    0,
  );

  // Filtros actuales para el informe (mismas condiciones que la tabla)
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
        description="Registra los servicios, su orden de compra y su estado de pago."
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Descripción</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium text-center">Buses</th>
                  <th className="px-3 py-3 font-medium text-right">Valor</th>
                  <th className="px-3 py-3 font-medium text-right">A pagar</th>
                  <th className="px-3 py-3 font-medium">OC</th>
                  <th className="px-3 py-3 font-medium">Coti</th>
                  <th className="px-3 py-3 font-medium">N° Fact.</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {facturas.map((f) => (
                  <tr key={f.id} className={`${rowTone(f.estado)} hover:bg-gray-100/60`}>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                      <Link href={`/facturas/${f.id}`} className="hover:underline">
                        {formatDate(f.fecha)}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 max-w-48 truncate">
                      <Link href={`/facturas/${f.id}`} className="hover:underline">
                        {f.descripcion ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {f.cliente?.codigo?.toUpperCase() ?? f.cliente?.nombre ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {f.n_buses ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatCLP(f.valor_servicio)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                      {f.valor_a_pagar != null ? formatCLP(f.valor_a_pagar) : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                      {f.orden_compra ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {f.cotizacion ? (
                        <Link
                          href={`/cotizaciones/${f.cotizacion.id}`}
                          className="text-brand hover:underline"
                        >
                          {f.cotizacion.numero}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{f.numero ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <EstadoFacturaSelect id={f.id} estado={f.estado} />
                    </td>
                    <td className="px-3 py-2.5">
                      {f.archivo_url ? (
                        <a
                          href={f.archivo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Ver adjunto"
                          className="text-muted hover:text-brand"
                        >
                          <Paperclip className="h-4 w-4" />
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-border bg-gray-50 font-medium">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 text-right text-muted">
                    Total a pagar ({facturas.length})
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatCLP(totalAPagar)}
                  </td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
