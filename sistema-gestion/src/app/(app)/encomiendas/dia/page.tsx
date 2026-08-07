import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ErrorDatos } from "@/components/ui/error-datos";
import { buttonClass } from "@/components/ui/button";
import { Package, BarChart3 } from "lucide-react";
import { hoyChile } from "@/lib/format";
import { DiaNav } from "@/components/encomiendas/dia-nav";
import {
  agruparPorDia,
  reglaVigente,
  valorPedido,
  type EventoActividad,
} from "@/lib/encomiendas/pago";
import { ActividadDia, type EventoDia } from "../actividad-dia";
import type { EncomiendaPago, EncomiendaReglaPago } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actividad del día — Encomiendas" };

type Fila = EventoActividad & EventoDia & { chofer: { id: string; nombre: string } | null };

// Vista de UN día: qué hizo cada conductor y su liquidación. Vive aparte de
// /encomiendas porque esa pantalla responde otra pregunta — cuánto entró y
// cuánto hay que pagar en el mes.
//
// Ya no muestra la ruta ni la cola de pedidos por rutear: los pedidos, sus
// direcciones y el orden de visita viven en el teléfono del conductor y no
// pasan por el servidor (ver la cabecera de la migración 0026).
export default async function EncomiendasDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { fecha: fechaParam } = await searchParams;
  const hoy = hoyChile();
  const fecha = fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam) ? fechaParam : hoy;

  const supabase = await createClient();

  const [
    { data: actividadData, error: errorActividad },
    { data: pagosData, error: errorPagos },
    { data: reglasData, error: errorReglas },
  ] = await Promise.all([
    supabase
      .from("encomienda_actividad")
      .select("id, chofer_id, fecha, tipo, origen, hora, created_at, chofer:choferes(id,nombre)")
      .eq("fecha", fecha)
      .returns<Fila[]>(),
    supabase.from("encomienda_pagos").select("*").eq("fecha", fecha),
    // Para saber a cuánto se valora cada entrega ese día (0029): el valor vive
    // en la regla vigente, así que sin las reglas no se puede mostrar el
    // ingreso del día.
    supabase.from("encomienda_reglas_pago").select("*"),
  ]);

  const errorCarga = errorActividad ?? errorPagos ?? errorReglas;
  const pagos = (pagosData ?? []) as EncomiendaPago[];
  const reglas = (reglasData ?? []) as EncomiendaReglaPago[];
  const porConductor = agruparPorDia(actividadData ?? []);

  return (
    <div>
      <PageHeader
        title="Actividad del día"
        description="Despacho de encomiendas — área aislada, no toca viajes ni facturas."
      >
        <Link href="/encomiendas" className={buttonClass({ variant: "secondary" })}>
          <BarChart3 className="h-4 w-4" />
          Ingresos y pagos
        </Link>
      </PageHeader>

      <div className="mb-5">
        <DiaNav fecha={fecha} basePath="/encomiendas/dia" />
      </div>

      {/* Un error de lectura no puede verse como "el conductor no salió": ver
          components/ui/error-datos.tsx. */}
      {errorCarga ? (
        <ErrorDatos titulo="No se pudo leer la actividad de este día." detalle={errorCarga.message} />
      ) : porConductor.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Package className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            {fecha === hoy
              ? "Todavía no hay actividad registrada hoy."
              : "Ningún conductor registró actividad este día."}
          </p>
          <p className="max-w-sm text-xs text-muted">
            Los pedidos y la ruta los maneja el conductor en su teléfono. Acá aparece cada
            entrega en cuanto su teléfono la envía.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {porConductor.map((d) => (
            <ActividadDia
              key={d.choferId ?? "sin"}
              choferId={d.choferId}
              choferNombre={d.eventos[0]?.chofer?.nombre ?? "Conductor eliminado"}
              fecha={fecha}
              eventos={d.eventos}
              pago={pagos.find((p) => p.chofer_id === d.choferId) ?? null}
              valorPorEntrega={valorPedido(reglaVigente(reglas, d.choferId, fecha))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
