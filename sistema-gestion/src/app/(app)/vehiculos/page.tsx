import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Badge, VencimientoBadge } from "@/components/ui/badge";
import { Plus, Bus, CalendarClock } from "lucide-react";
import { isDemo, demoVehiculos } from "@/lib/demo";
import { formatNumber } from "@/lib/format";
import type { Vehiculo } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vehículos" };

export default async function VehiculosPage() {
  let vehiculos: Vehiculo[];
  if (isDemo()) {
    vehiculos = demoVehiculos;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("vehiculos").select("*").order("patente");
    vehiculos = (data ?? []) as Vehiculo[];
  }

  return (
    <div>
      <PageHeader title="Vehículos" description="Flota y vencimiento de documentos.">
        <Link
          href="/vehiculos/documentos"
          className={buttonClass({ variant: "secondary" })}
        >
          <CalendarClock className="h-4 w-4" />
          Actualizar documentos
        </Link>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vehiculos.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/vehiculos/${v.id}`} className="font-semibold text-brand hover:underline">
                        {v.patente}
                      </Link>
                      {!v.activo ? (
                        <Badge tone="gray" className="ml-2">Inactivo</Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {[v.marca, v.modelo].filter(Boolean).join(" ") || "—"}
                      {v.anio ? ` (${v.anio})` : ""}
                      {v.km_actual != null ? ` · ${formatNumber(v.km_actual)} km` : ""}
                    </td>
                    <td className="px-4 py-3 text-center">{v.capacidad ?? "—"}</td>
                    <td className="px-4 py-3"><VencimientoBadge fecha={v.revision_tecnica_venc} /></td>
                    <td className="px-4 py-3"><VencimientoBadge fecha={v.soap_venc} /></td>
                    <td className="px-4 py-3"><VencimientoBadge fecha={v.permiso_circulacion_venc} /></td>
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
