import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { DocumentosRow } from "../documentos-row";
import { ArrowLeft } from "lucide-react";
import { isDemo, demoVehiculos } from "@/lib/demo";
import type { Vehiculo } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actualizar documentos" };

export default async function DocumentosPage() {
  let vehiculos: Vehiculo[];
  if (isDemo()) {
    vehiculos = demoVehiculos;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("vehiculos").select("*").order("patente");
    vehiculos = (data ?? []) as Vehiculo[];
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/vehiculos"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Vehículos
      </Link>

      <PageHeader
        title="Actualizar documentos"
        description="Cuando renueves un documento, cambia la fecha y guarda. El sistema actualiza las alertas automáticamente."
      />

      {vehiculos.length === 0 ? (
        <Card className="px-6 py-12 text-center text-sm text-muted">
          No hay vehículos registrados todavía.
        </Card>
      ) : (
        <div className="space-y-4">
          {vehiculos.map((v) => (
            <DocumentosRow key={v.id} vehiculo={v} />
          ))}
        </div>
      )}
    </div>
  );
}
