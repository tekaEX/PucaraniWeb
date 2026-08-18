import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, Bus } from "lucide-react";
import { rangoPeriodo } from "@/lib/periodo";
import { getPeriodo } from "@/lib/periodo-server";
import { DocsResumen } from "@/components/docs-resumen";
import { documentosVehiculo, enUso, resumenDocumentos } from "@/lib/vencimientos";
import type { Vehiculo, GastoVehiculo } from "@/types/db";
import { VehiculoAccordion } from "./vehiculo-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vehículos" };

export default async function VehiculosPage() {
  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  const supabase = await createClient();
  const [{ data: vData }, { data: gData }] = await Promise.all([
    supabase.from("vehiculos").select("*").order("patente"),
    supabase
      .from("gastos_vehiculo")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta),
  ]);
  const vehiculos = (vData ?? []) as Vehiculo[];
  const gastos = (gData ?? []) as GastoVehiculo[];

  return (
    <div>
      <PageHeader
        title="Vehículos"
        description="Flota, gastos y documentos. Haz clic en uno para ver y editar."
      >
        <Link href="/vehiculos/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo vehículo
        </Link>
      </PageHeader>

      {/* Solo de la flota EN USO: los papeles de un vehículo dado de baja son
          historia, no una tarea (misma regla que la campana). Sin vehículos no
          se muestra nada: un "documentación al día" con la flota vacía sería
          una afirmación sobre nada. */}
      {vehiculos.length > 0 ? (
        <DocsResumen
          resumen={resumenDocumentos(
            vehiculos.filter(enUso).map((v) => documentosVehiculo(v)),
          )}
        />
      ) : null}

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
