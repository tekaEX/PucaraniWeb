import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ViajeForm } from "../viaje-form";
import { COLUMNAS_CHOFER_OPT, COLUMNAS_VEHICULO_OPT } from "../nueva/datos";
import { eliminarViaje } from "../actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Trash2, ArrowLeft } from "lucide-react";
import type { ViajeConRelaciones } from "@/types/db";
import { buttonClass } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ViajeDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: via }, { data: cl }, { data: cot }, { data: cho }, { data: veh }] =
    await Promise.all([
      supabase
        .from("viajes")
        .select(
          "*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero), factura:facturas(id,folio,tipo_dte,estado,fecha_pago), asignaciones:viaje_asignaciones(id,viaje_id,chofer_id,vehiculo_id,fecha,notas,created_at, chofer:choferes(id,nombre), vehiculo:vehiculos(patente))",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("clientes").select("id,nombre,codigo").order("nombre"),
      supabase
        .from("cotizaciones")
        .select("id,numero,cliente_id,total")
        .order("numero", { ascending: false }),
      supabase.from("choferes").select(COLUMNAS_CHOFER_OPT).order("nombre"),
      supabase.from("vehiculos").select(COLUMNAS_VEHICULO_OPT).order("patente"),
    ]);
  const viaje = (via as ViajeConRelaciones) ?? null;
  const clientes = cl ?? [];
  const cotizaciones = cot ?? [];
  const choferes = cho ?? [];
  const vehiculos = veh ?? [];

  if (!viaje) notFound();
  const v = viaje;

  return (
    <div className="max-w-4xl">
      <Link
        href="/viajes"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Viajes
      </Link>

      <PageHeader title={v.descripcion}>
        <ConfirmForm
          action={eliminarViaje}
          mensaje="¿Eliminar este viaje? Esta acción no se puede deshacer."
        >
          <input type="hidden" name="id" value={v.id} />
          <button
            type="submit"
            className={buttonClass({ variant: "dangerOutline", size: "sm" })}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </ConfirmForm>
      </PageHeader>

      <ViajeForm
        clientes={clientes}
        cotizaciones={cotizaciones}
        choferes={choferes}
        vehiculos={vehiculos}
        viaje={v}
      />
    </div>
  );
}
