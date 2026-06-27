import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, Bus, Settings } from "lucide-react";
import { isDemo, demoVehiculos, demoGastos } from "@/lib/demo";
import { getPeriodo, rangoPeriodo, enRango } from "@/lib/periodo";
import type { Vehiculo, GastoVehiculo } from "@/types/db";
import { SincronizarSiiButton } from "./sincronizar-sii";
import { VehiculoAccordion } from "./vehiculo-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vehículos" };

export default async function VehiculosPage() {
  let vehiculos: Vehiculo[];
  let gastos: GastoVehiculo[];

  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  if (isDemo()) {
    vehiculos = demoVehiculos;
    gastos = demoGastos.filter((g) => enRango(g.fecha, periodo));
  } else {
    const supabase = await createClient();
    const [{ data: vData }, { data: gData }] = await Promise.all([
      supabase.from("vehiculos").select("*").order("patente"),
      supabase
        .from("gastos_vehiculo")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ]);
    vehiculos = (vData ?? []) as Vehiculo[];
    gastos = (gData ?? []) as GastoVehiculo[];
  }

  return (
    <div>
      <PageHeader
        title="Vehículos"
        description="Flota, gastos y documentos. Haz clic en uno para ver y editar."
      >
        <Link
          href="/combustible/configuracion"
          className={buttonClass({ variant: "secondary" })}
        >
          <Settings className="h-4 w-4" />
          Configurar SII
        </Link>
        <SincronizarSiiButton />
        <Link href="/vehiculos/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo vehículo
        </Link>
      </PageHeader>

      {vehiculos.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Bus className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Aún no hay vehículos registrados.</p>
          <Link href="/vehiculos/nuevo" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Agregar el primero
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <VehiculoAccordion vehiculos={vehiculos} gastos={gastos} />
          </div>
        </Card>
      )}
    </div>
  );
}
