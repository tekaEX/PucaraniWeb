import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FacturaForm, type ViajeOpt } from "../factura-form";
import { eliminarFactura } from "../actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Trash2, ArrowLeft } from "lucide-react";
import {
  isDemo,
  demoFacturaById,
  demoClientes,
  demoViajesPorFacturar,
} from "@/lib/demo";
import type { FacturaConRelaciones } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function FacturaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let factura: FacturaConRelaciones | null;
  let clientes: { id: string; nombre: string; codigo: string | null }[];
  let porFacturar: ViajeOpt[];

  if (isDemo()) {
    factura = demoFacturaById(id);
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
    porFacturar = demoViajesPorFacturar().map((v) => ({
      id: v.id,
      cliente_id: v.cliente_id,
      descripcion: v.descripcion,
      fecha_inicio: v.fecha_inicio,
      valor: v.valor,
    }));
  } else {
    const supabase = await createClient();
    const [{ data: fac }, { data: cl }, { data: via }] = await Promise.all([
      supabase
        .from("facturas")
        .select("*, cliente:clientes(id,nombre,codigo), viajes:viajes(*)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase
        .from("viajes")
        .select("id,cliente_id,descripcion,fecha_inicio,valor")
        .eq("estado", "realizado")
        .is("factura_id", null)
        .order("fecha_inicio", { ascending: false }),
    ]);
    factura = (fac as FacturaConRelaciones) ?? null;
    clientes = cl ?? [];
    porFacturar = (via ?? []) as ViajeOpt[];
  }

  if (!factura) notFound();
  const f = factura;

  // El formulario ofrece: los viajes ya incluidos en esta factura + los que
  // siguen por facturar.
  const propios: ViajeOpt[] = f.viajes.map((v) => ({
    id: v.id,
    cliente_id: v.cliente_id,
    descripcion: v.descripcion,
    fecha_inicio: v.fecha_inicio,
    valor: Number(v.valor),
  }));
  const viajesDisponibles = [
    ...propios,
    ...porFacturar.filter((v) => !propios.some((p) => p.id === v.id)),
  ];

  return (
    <div className="max-w-4xl">
      <Link
        href="/facturas"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Facturas
      </Link>

      <PageHeader title={f.folio ? `Factura N° ${f.folio}` : "Factura (borrador)"}>
        <ConfirmForm
          action={eliminarFactura}
          mensaje="¿Eliminar esta factura? Sus viajes volverán a quedar como por facturar."
        >
          <input type="hidden" name="id" value={f.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </ConfirmForm>
      </PageHeader>

      <FacturaForm
        clientes={clientes}
        viajesDisponibles={viajesDisponibles}
        factura={f}
      />
    </div>
  );
}
