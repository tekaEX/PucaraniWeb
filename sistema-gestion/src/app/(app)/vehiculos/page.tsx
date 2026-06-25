import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, Bus, Settings } from "lucide-react";
import { isDemo, demoVehiculos, demoGastos } from "@/lib/demo";
import type { Vehiculo } from "@/types/db";
import { SincronizarSiiButton } from "./sincronizar-sii";
import { VehiculoRow } from "./vehiculo-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vehículos" };

export default async function VehiculosPage() {
  let vehiculos: Vehiculo[];
  const totales = new Map<string, number>();

  if (isDemo()) {
    vehiculos = demoVehiculos;
    for (const g of demoGastos) {
      if (g.vehiculo_id)
        totales.set(
          g.vehiculo_id,
          (totales.get(g.vehiculo_id) ?? 0) + Number(g.monto_total),
        );
    }
  } else {
    const supabase = await createClient();
    const [{ data: vData }, { data: gData }] = await Promise.all([
      supabase.from("vehiculos").select("*").order("patente"),
      supabase.from("gastos_vehiculo").select("vehiculo_id, monto_total"),
    ]);
    vehiculos = (vData ?? []) as Vehiculo[];
    for (const g of (gData ?? []) as {
      vehiculo_id: string | null;
      monto_total: number;
    }[]) {
      if (g.vehiculo_id)
        totales.set(
          g.vehiculo_id,
          (totales.get(g.vehiculo_id) ?? 0) + Number(g.monto_total),
        );
    }
  }

  return (
    <div>
      <PageHeader
        title="Vehículos"
        description="Flota, gastos por vehículo y vencimiento de documentos."
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Patente</th>
                  <th className="px-4 py-3 font-medium">Vehículo</th>
                  <th className="px-4 py-3 font-medium text-center">Cap.</th>
                  <th className="px-4 py-3 font-medium">Rev. técnica</th>
                  <th className="px-4 py-3 font-medium">SOAP</th>
                  <th className="px-4 py-3 font-medium">Permiso circ.</th>
                  <th className="px-4 py-3 font-medium text-right">Gastos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehiculos.map((v) => (
                  <VehiculoRow key={v.id} v={v} total={totales.get(v.id) ?? 0} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
