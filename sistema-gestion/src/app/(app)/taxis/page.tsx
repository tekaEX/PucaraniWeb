import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { Car, CircleDollarSign } from "lucide-react";
import { rangoPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import { getPeriodo } from "@/lib/periodo-server";
import { formatCLP } from "@/lib/format";
import type { ServicioTaxiConRelaciones } from "@/types/db";
import { TaxisTabla } from "./taxis-tabla";
import { ImportarRespaldo } from "./importar-respaldo";
import { NuevoServicioTaxi } from "./nuevo-servicio";
import { datosNuevoTaxi } from "./datos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taxis" };

// Área de taxis: servicios que se gestionan aislados (no tocan viajes ni
// facturas) pero suman a los ingresos por cliente. Empresa y chofer salen de
// las tablas de la app (clientes/choferes).
//
// La pantalla sigue el orden del sistema anterior, que es el que la gente que
// carga los servicios tiene aprendido: los dos números arriba, el formulario de
// alta a la vista, y abajo la tabla del periodo con su total y sus
// exportaciones. No hay "Nuevo servicio" que lleve a otra parte: se carga acá.
export default async function TaxisPage() {
  const periodo = await getPeriodo();

  const supabase = await createClient();
  const { desde, hasta } = rangoPeriodo(periodo);
  const { data } = await supabase
    .from("servicios_taxi")
    .select("*, cliente:clientes(id,nombre,codigo), chofer:choferes(id,nombre)")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha");
  const servicios = (data ?? []) as ServicioTaxiConRelaciones[];

  const { clientes, choferes } = await datosNuevoTaxi();

  const total = servicios.reduce((a, s) => a + Number(s.monto), 0);
  const etiqueta = etiquetaPeriodo(periodo);

  return (
    <>
      <PageHeader
        title="Taxis"
        description="Servicios del área de taxis. Suman a los ingresos por empresa, sin pasar por cotizaciones ni facturas."
      >
        <ImportarRespaldo />
      </PageHeader>

      <div className="stagger-in mb-4 grid gap-4 sm:grid-cols-2">
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

      <NuevoServicioTaxi clientes={clientes} choferes={choferes} />

      {/* La tabla se muestra SIEMPRE, aunque el periodo esté vacío: en el
          sistema anterior el "sin servicios" iba dentro de la tabla, con el
          total y los botones a la vista. Una tarjeta vacía que reemplaza todo
          esconde dónde van a aparecer las filas que se están cargando. */}
      <Card className="overflow-hidden">
        <TaxisTabla
          servicios={servicios}
          clientes={clientes}
          choferes={choferes}
          etiquetaPeriodo={etiqueta}
        />
      </Card>
    </>
  );
}
