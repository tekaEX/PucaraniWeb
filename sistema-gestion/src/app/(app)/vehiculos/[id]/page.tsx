import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehiculoForm } from "../vehiculo-form";
import { GastoForm } from "../gasto-form";
import { eliminarVehiculo, eliminarGasto } from "../actions";
import { isDemo, demoVehiculoById, demoGastos } from "@/lib/demo";
import { Trash2 } from "lucide-react";
import { formatCLP, formatDate } from "@/lib/format";
import {
  GASTO_CATEGORIAS,
  type GastoCategoria,
  type GastoVehiculo,
  type Vehiculo,
} from "@/types/db";

export const dynamic = "force-dynamic";

const catTone: Record<GastoCategoria, "amber" | "blue" | "violet" | "gray"> = {
  combustible: "amber",
  mantencion: "blue",
  seguros: "violet",
  otros: "gray",
};

export default async function VehiculoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let vehiculo: Vehiculo | null;
  let gastos: GastoVehiculo[];

  if (isDemo()) {
    vehiculo = demoVehiculoById(id);
    gastos = demoGastos.filter((g) => g.vehiculo_id === id);
  } else {
    const supabase = await createClient();
    const [{ data: v }, { data: g }] = await Promise.all([
      supabase.from("vehiculos").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("gastos_vehiculo")
        .select("*")
        .eq("vehiculo_id", id)
        .order("fecha", { ascending: false }),
    ]);
    vehiculo = (v as Vehiculo) ?? null;
    gastos = (g ?? []) as GastoVehiculo[];
  }

  if (!vehiculo) notFound();

  const total = gastos.reduce((a, gx) => a + Number(gx.monto_total), 0);
  const porCategoria = (Object.keys(GASTO_CATEGORIAS) as GastoCategoria[])
    .map((cat) => ({
      cat,
      total: gastos
        .filter((gx) => gx.categoria === cat)
        .reduce((a, gx) => a + Number(gx.monto_total), 0),
    }))
    .filter((x) => x.total > 0);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={vehiculo.patente}
        description={
          [vehiculo.marca, vehiculo.modelo].filter(Boolean).join(" ") || "Vehículo"
        }
      >
        <form action={eliminarVehiculo}>
          <input type="hidden" name="id" value={vehiculo.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </form>
      </PageHeader>

      <Card className="mb-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Gastos del vehículo</CardTitle>
          <span className="text-lg font-semibold tabular-nums">
            {formatCLP(total)}
          </span>
        </CardHeader>
        <CardBody className="space-y-5">
          {porCategoria.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {porCategoria.map((x) => (
                <span
                  key={x.cat}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium"
                >
                  {GASTO_CATEGORIAS[x.cat]}
                  <span className="tabular-nums text-muted">
                    {formatCLP(x.total)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}

          {gastos.length === 0 ? (
            <p className="text-sm text-muted">
              Aún no hay gastos registrados para este vehículo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2 font-medium">Fecha</th>
                    <th className="py-2 font-medium">Categoría</th>
                    <th className="py-2 font-medium">Descripción</th>
                    <th className="py-2 font-medium text-right">Monto</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {gastos.map((gx) => (
                    <tr key={gx.id}>
                      <td className="py-2.5 whitespace-nowrap text-muted">
                        {formatDate(gx.fecha)}
                      </td>
                      <td className="py-2.5">
                        <Badge tone={catTone[gx.categoria]}>
                          {GASTO_CATEGORIAS[gx.categoria]}
                        </Badge>
                      </td>
                      <td className="py-2.5">
                        {gx.descripcion ?? gx.proveedor_razon_social ?? "—"}
                        {gx.origen === "sii" ? (
                          <span className="ml-2 text-xs text-muted">· SII</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-right tabular-nums font-medium">
                        {formatCLP(Number(gx.monto_total))}
                      </td>
                      <td className="py-2.5 text-right">
                        <form action={eliminarGasto}>
                          <input type="hidden" name="id" value={gx.id} />
                          <input
                            type="hidden"
                            name="vehiculo_id"
                            value={vehiculo.id}
                          />
                          <button
                            type="submit"
                            className="text-muted hover:text-red-600"
                            title="Eliminar gasto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="rounded-xl border border-border bg-gray-50/60 p-4">
            <p className="mb-3 text-sm font-medium">Agregar gasto</p>
            <GastoForm vehiculoId={vehiculo.id} />
          </div>
        </CardBody>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-muted">Datos del vehículo</h2>
      <VehiculoForm vehiculo={vehiculo} />
    </div>
  );
}
