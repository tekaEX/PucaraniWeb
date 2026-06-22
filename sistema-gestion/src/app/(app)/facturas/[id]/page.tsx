import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FacturaForm } from "../factura-form";
import { guardarFactura, eliminarFactura } from "../actions";
import { Trash2, ArrowLeft } from "lucide-react";
import {
  isDemo,
  demoFacturaById,
  demoClientes,
  demoCotizacionesLite,
  demoChoferes,
  demoVehiculos,
} from "@/lib/demo";
import type { Factura } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function FacturaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let factura: Factura | null;
  let clientes: { id: string; nombre: string; codigo: string | null }[];
  let cotizaciones: {
    id: string;
    numero: number;
    cliente_id: string | null;
    total: number;
  }[];
  let choferes: { id: string; nombre: string }[];
  let vehiculos: { id: string; patente: string }[];

  if (isDemo()) {
    factura = demoFacturaById(id);
    clientes = demoClientes.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo }));
    cotizaciones = demoCotizacionesLite();
    choferes = demoChoferes.map((c) => ({ id: c.id, nombre: c.nombre }));
    vehiculos = demoVehiculos.map((v) => ({ id: v.id, patente: v.patente }));
  } else {
    const supabase = await createClient();
    const [{ data: fac }, { data: cl }, { data: cot }, { data: cho }, { data: veh }] =
      await Promise.all([
        supabase.from("facturas").select("*").eq("id", id).maybeSingle(),
        supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
        supabase
          .from("cotizaciones")
          .select("id,numero,cliente_id,total")
          .order("numero", { ascending: false }),
        supabase.from("choferes").select("id,nombre").order("nombre"),
        supabase.from("vehiculos").select("id,patente").order("patente"),
      ]);
    factura = (fac as Factura) ?? null;
    clientes = cl ?? [];
    cotizaciones = cot ?? [];
    choferes = cho ?? [];
    vehiculos = veh ?? [];
  }

  if (!factura) notFound();
  const f = factura;

  return (
    <div className="max-w-4xl">
      <Link
        href="/facturas"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Facturas
      </Link>

      <PageHeader title={f.numero ? `Factura ${f.numero}` : "Factura sin número"}>
        <form action={eliminarFactura}>
          <input type="hidden" name="id" value={f.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </form>
      </PageHeader>

      <FacturaForm
        action={guardarFactura}
        clientes={clientes ?? []}
        cotizaciones={cotizaciones ?? []}
        choferes={choferes ?? []}
        vehiculos={vehiculos ?? []}
        factura={f}
      />
    </div>
  );
}
