import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { VehiculoForm } from "../vehiculo-form";
import { eliminarVehiculo } from "../actions";
import { isDemo, demoVehiculoById } from "@/lib/demo";
import { Trash2 } from "lucide-react";
import type { Vehiculo } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EditarVehiculoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let vehiculo: Vehiculo | null;
  if (isDemo()) {
    vehiculo = demoVehiculoById(id);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("vehiculos")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    vehiculo = (data as Vehiculo) ?? null;
  }

  if (!vehiculo) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={vehiculo.patente} description="Editar vehículo">
        <form action={eliminarVehiculo}>
          <input type="hidden" name="id" value={vehiculo.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </form>
      </PageHeader>
      <VehiculoForm vehiculo={vehiculo} />
    </div>
  );
}
