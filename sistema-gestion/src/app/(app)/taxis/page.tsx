import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { buttonClass } from "@/components/ui/button";
import { Plus, Car, CircleDollarSign } from "lucide-react";
import { isDemo, demoServiciosTaxi } from "@/lib/demo";
import { getPeriodo, rangoPeriodo, enRango, etiquetaPeriodo } from "@/lib/periodo";
import { formatCLP } from "@/lib/format";
import type { ServicioTaxiConRelaciones } from "@/types/db";
import { TaxisTabla } from "./taxis-tabla";
import { ImportarRespaldo } from "./importar-respaldo";
import { datosNuevoTaxi } from "./nuevo/datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taxis" };

// Área de taxis: servicios que se gestionan aislados (no tocan viajes ni
// facturas) pero suman a los ingresos por cliente. Empresa y chofer salen de
// las tablas de la app (clientes/choferes).
export default async function TaxisPage() {
  const periodo = await getPeriodo();

  let servicios: ServicioTaxiConRelaciones[];
  if (isDemo()) {
    servicios = demoServiciosTaxi
      .filter((s) => enRango(s.fecha, periodo))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  } else {
    const supabase = await createClient();
    const { desde, hasta } = rangoPeriodo(periodo);
    const { data } = await supabase
      .from("servicios_taxi")
      .select("*, cliente:clientes(id,nombre,codigo), chofer:choferes(id,nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha");
    servicios = (data ?? []) as ServicioTaxiConRelaciones[];
  }

  const { clientes, choferes } = await datosNuevoTaxi();

  const total = servicios.reduce((a, s) => a + Number(s.monto), 0);
  const etiqueta = etiquetaPeriodo(periodo);

  return (
    <div>
      <PageHeader
        title="Taxis"
        description="Servicios del área de taxis. Suman a los ingresos por empresa, sin pasar por cotizaciones ni facturas."
      >
        <ImportarRespaldo />
        <Link href="/taxis/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo servicio
        </Link>
      </PageHeader>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Kpi
          label="Monto del periodo"
          value={formatCLP(total)}
          sub={etiqueta}
          icon={CircleDollarSign}
          tint="bg-ok-bg text-ok"
        />
        <Kpi
          label="Servicios"
          value={String(servicios.length)}
          sub={etiqueta}
          icon={Car}
          tint="bg-brand-soft text-brand"
        />
      </div>

      {servicios.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Car className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            Sin servicios de taxi en {etiqueta}.
          </p>
          <Link href="/taxis/nuevo" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Registrar el primero
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <TaxisTabla servicios={servicios} clientes={clientes} choferes={choferes} />
        </Card>
      )}
    </div>
  );
}
