import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { buttonClass } from "@/components/ui/button";
import { Plus, Route, Filter } from "lucide-react";
import { isDemo, demoClientes, demoViajes } from "@/lib/demo";
import {
  VIAJE_ESTADOS,
  viajePorFacturar,
  type Cliente,
  type ViajeConRelaciones,
  type ViajeEstado,
} from "@/types/db";
import { getPeriodo, rangoPeriodo, enRango, etiquetaPeriodo } from "@/lib/periodo";
import { datosNuevoViaje } from "./nueva/datos";
import { ViajeAccordion } from "./viaje-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Viajes" };

const ESTADOS = Object.keys(VIAJE_ESTADOS) as ViajeEstado[];

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
        "*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero), factura:facturas(id,folio,tipo_dte,estado,fecha_pago), asignaciones:viaje_asignaciones(id,viaje_id,chofer_id,vehiculo_id,fecha,notas,created_at, chofer:choferes(id,nombre), vehiculo:vehiculos(patente))",
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

  // Catálogos para la edición inline en el acordeón (mismo cargador que
  // usa el modal de "Nuevo viaje").
  const { cotizaciones, choferes, vehiculos } = await datosNuevoViaje();

  return (
    <div>
      <PageHeader
        title="Viajes"
        description={`Servicios de ${etiquetaPeriodo(periodo).toLowerCase()} (cámbialo en el selector de arriba). Haz clic en uno para editarlo.`}
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
            <ViajeAccordion
              viajes={viajes}
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
