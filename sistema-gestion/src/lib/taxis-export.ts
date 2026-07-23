// Carga compartida para las exportaciones de taxis (vales PDF y Excel):
// servicios del periodo global (cookie), con filtro opcional por nombre de
// empresa — el mismo que aplica la tabla en pantalla.
import { createClient } from "@/lib/supabase/server";
import { isDemo, demoServiciosTaxi, demoEmpresa } from "@/lib/demo";
import { getPeriodo, rangoPeriodo, enRango, type Periodo } from "@/lib/periodo";
import {
  taxiNombreCliente,
  type Empresa,
  type ServicioTaxiConRelaciones,
} from "@/types/db";

export async function cargarServiciosExport(clienteFiltro: string | null): Promise<{
  servicios: ServicioTaxiConRelaciones[];
  empresa: Empresa | null;
  periodo: Periodo;
}> {
  const periodo = await getPeriodo();

  let servicios: ServicioTaxiConRelaciones[];
  let empresa: Empresa | null;

  if (isDemo()) {
    servicios = demoServiciosTaxi
      .filter((s) => enRango(s.fecha, periodo))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    empresa = demoEmpresa;
  } else {
    const supabase = await createClient();
    const { desde, hasta } = rangoPeriodo(periodo);
    const [{ data: sData }, { data: eData }] = await Promise.all([
      supabase
        .from("servicios_taxi")
        .select("*, cliente:clientes(id,nombre,codigo), chofer:choferes(id,nombre)")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha"),
      supabase.from("empresa").select("*").limit(1).maybeSingle(),
    ]);
    servicios = (sData ?? []) as ServicioTaxiConRelaciones[];
    empresa = (eData ?? null) as Empresa | null;
  }

  if (clienteFiltro) {
    servicios = servicios.filter((s) => taxiNombreCliente(s) === clienteFiltro);
  }

  return { servicios, empresa, periodo };
}
