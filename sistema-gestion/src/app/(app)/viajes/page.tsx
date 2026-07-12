import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { Plus, Route, Filter, CheckCircle2 } from "lucide-react";
import { isDemo, demoClientes, demoViajes } from "@/lib/demo";
import {
  VIAJE_ESTADOS,
  viajePorFacturar,
  costoTotalViaje,
  type Cliente,
  type ViajeConRelaciones,
  type ViajeEstado,
} from "@/types/db";
import { formatCLP, formatDate } from "@/lib/format";
import { getPeriodo, rangoPeriodo, enRango } from "@/lib/periodo";
import { actualizarEstadoViaje } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Viajes" };

const ESTADOS = Object.keys(VIAJE_ESTADOS) as ViajeEstado[];

function EstadoChip({ v }: { v: ViajeConRelaciones }) {
  if (v.estado === "cancelado") {
    return <span className="rounded-full bg-[#ececef] px-2 py-0.5 text-xs font-medium text-[#6e6e73]">Cancelado</span>;
  }
  if (v.estado === "programado") {
    return <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">Programado</span>;
  }
  // realizado: el sub-estado se deriva de la factura.
  if (viajePorFacturar(v)) {
    return <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">Por facturar</span>;
  }
  return (
    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-xs font-medium text-ok">
      Realizado
    </span>
  );
}

export default async function ViajesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; cliente?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  let clientes: Cliente[];
  let viajes: ViajeConRelaciones[];

  if (isDemo()) {
    clientes = demoClientes;
    viajes = demoViajes.filter((v) => {
      if (sp.estado === "por_facturar" && !viajePorFacturar(v)) return false;
      if (sp.estado && sp.estado !== "por_facturar" && ESTADOS.includes(sp.estado as ViajeEstado) && v.estado !== sp.estado)
        return false;
      if (sp.cliente && v.cliente_id !== sp.cliente) return false;
      if (sp.q && !v.descripcion.toLowerCase().includes(sp.q.toLowerCase())) return false;
      if (!enRango(v.fecha_inicio, periodo)) return false;
      return true;
    });
    viajes = [...viajes].sort((a, b) => (a.fecha_inicio < b.fecha_inicio ? 1 : -1));
  } else {
    const supabase = await createClient();
    const { data: clientesData } = await supabase.from("clientes").select("*").order("nombre");
    clientes = (clientesData ?? []) as Cliente[];

    let query = supabase
      .from("viajes")
      .select(
        "*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero), factura:facturas(id,folio,tipo_dte,estado,fecha_pago), asignaciones:viaje_asignaciones(id,viaje_id,chofer_id,vehiculo_id,fecha,notas,created_at, chofer:choferes(id,nombre), vehiculo:vehiculos(id,patente))",
      )
      .order("fecha_inicio", { ascending: false });

    if (sp.estado === "por_facturar") {
      query = query.eq("estado", "realizado").is("factura_id", null);
    } else if (sp.estado && ESTADOS.includes(sp.estado as ViajeEstado)) {
      query = query.eq("estado", sp.estado);
    }
    if (sp.cliente) query = query.eq("cliente_id", sp.cliente);
    if (sp.q) query = query.ilike("descripcion", `%${sp.q}%`);
    query = query.gte("fecha_inicio", desde).lte("fecha_inicio", hasta);

    const { data } = await query;
    viajes = (data ?? []) as ViajeConRelaciones[];
  }

  return (
    <div>
      <PageHeader
        title="Viajes"
        description="La operación diaria: servicios realizados y programados, con sus choferes, buses y costos."
      >
        <Link href="/viajes/nueva" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo viaje
        </Link>
      </PageHeader>

      <Card className="mb-4">
        <form className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-40">
            <label className="mb-1 block text-xs font-medium text-muted">Estado</label>
            <Select name="estado" defaultValue={sp.estado ?? ""}>
              <option value="">Todos</option>
              <option value="por_facturar">Por facturar</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {VIAJE_ESTADOS[e]}
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
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Descripción…" />
          </div>
          <button type="submit" className={buttonClass({ variant: "secondary" })}>
            <Filter className="h-4 w-4" />
            Filtrar
          </button>
          {sp.estado || sp.cliente || sp.q ? (
            <Link href="/viajes" className={buttonClass({ variant: "ghost" })}>
              Limpiar
            </Link>
          ) : null}
        </form>
      </Card>

      {viajes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Route className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">No hay viajes con esos filtros.</p>
          <Link href="/viajes/nueva" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Registrar un viaje
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Servicio</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Chofer / Bus</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 text-right font-medium">Costos</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Factura</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {viajes.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-background/60">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">
                      {formatDate(v.fecha_inicio)}
                      {v.fecha_fin ? ` – ${formatDate(v.fecha_fin)}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/viajes/${v.id}`} className="font-medium text-foreground hover:underline">
                        {v.descripcion}
                      </Link>
                      {v.orden_compra ? (
                        <span className="ml-2 text-xs text-muted">OC {v.orden_compra}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{v.cliente?.nombre ?? "—"}</td>
                    <td className="px-4 py-3">
                      {v.asignaciones.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {v.asignaciones.map((a) => (
                            <span
                              key={a.id}
                              className="rounded-full bg-[#ececef] px-2 py-0.5 text-xs text-[#6e6e73]"
                            >
                              {[a.chofer?.nombre, a.vehiculo?.patente].filter(Boolean).join(" · ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                      {formatCLP(v.valor)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted">
                      {formatCLP(costoTotalViaje(v))}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoChip v={v} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {v.factura ? (
                        <Link href={`/facturas/${v.factura.id}`} className="text-brand hover:underline">
                          {v.factura.folio ? `N° ${v.factura.folio}` : "Borrador"}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {v.estado === "programado" ? (
                        <form action={actualizarEstadoViaje}>
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="estado" value="realizado" />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-ok hover:underline"
                            title="Marcar como realizado"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Realizado
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
