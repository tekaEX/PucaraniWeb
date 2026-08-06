"use client";

// Lo que hizo un conductor en un día, visto desde la oficina. Reemplaza a
// RutaResumen: la ruta y las direcciones ya no existen en el servidor (viven en
// el teléfono, ver 0026), así que lo que se puede mostrar acá es la actividad
// registrada — cuántas entregas, a qué hora, y la liquidación del día.
//
// Tampoco hay botón de generar ruta: eso lo hace el conductor en su teléfono.
// Desde la oficina no había forma de que una ruta generada acá le llegara.

import { useState, useTransition } from "react";
import { Check, X, Phone, Wallet, Truck, CloudOff, Trash2 } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCLP, formatNumber, formatTime } from "@/lib/format";
import { ingresoEstimado } from "@/lib/encomiendas/pago";
import { calcularPagoChofer, eliminarDiaManual } from "./actions";
import type {
  EncomiendaActividadOrigen,
  EncomiendaActividadTipo,
  EncomiendaPago,
} from "@/types/db";

export type EventoDia = {
  id: string;
  tipo: EncomiendaActividadTipo;
  /** Cuándo ocurrió según el teléfono. */
  hora: string;
  /** Cuándo llegó al servidor. */
  created_at: string;
  /** 'app' = lo mandó el teléfono · 'manual' = lo cargó la oficina (0028). */
  origen: EncomiendaActividadOrigen;
};

// A partir de acá la diferencia entre "cuándo pasó" y "cuándo llegó" deja de ser
// latencia normal y pasa a ser una zona sin cobertura, que es información útil:
// dice dónde el conductor trabaja a ciegas sin tener que preguntárselo.
const MINUTOS_RETRASO_NOTABLE = 10;

const PRESENTACION: Record<
  EncomiendaActividadTipo,
  { etiqueta: string; icono: React.ReactNode }
> = {
  entrega: { etiqueta: "Entregado", icono: <Check className="h-4 w-4 text-ok" /> },
  omision: { etiqueta: "No entregado", icono: <X className="h-4 w-4 text-danger" /> },
  llamada: { etiqueta: "Salió a repartir", icono: <Phone className="h-4 w-4 text-muted" /> },
};

function minutosEntre(desde: string, hasta: string): number {
  return (new Date(hasta).getTime() - new Date(desde).getTime()) / 60_000;
}

export function ActividadDia({
  choferId,
  choferNombre,
  fecha,
  eventos,
  pago,
}: {
  /** null si el conductor fue eliminado: el día se ve, pero no se liquida. */
  choferId: string | null;
  choferNombre: string;
  fecha: string;
  eventos: EventoDia[];
  pago: EncomiendaPago | null;
}) {
  const [pendingPago, startTransitionPago] = useTransition();
  const [errorPago, setErrorPago] = useState<string | null>(null);
  const [pendingBorrar, startTransitionBorrar] = useTransition();
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  function onCalcularPago() {
    if (!choferId) return;
    setErrorPago(null);
    startTransitionPago(async () => {
      const res = await calcularPagoChofer(choferId, fecha);
      if (res.error) setErrorPago(res.error);
    });
  }

  function onBorrarManual() {
    if (!choferId) return;
    setErrorBorrar(null);
    startTransitionBorrar(async () => {
      const res = await eliminarDiaManual(choferId, fecha);
      if (res.error) setErrorBorrar(res.error);
      setConfirmandoBorrado(false);
    });
  }

  const entregados = eventos.filter((e) => e.tipo === "entrega").length;
  const omitidos = eventos.filter((e) => e.tipo === "omision").length;
  // Ingreso estimado (no real): Starken maneja el valor de cada envío en su
  // propio sistema, Pucarani no lo conoce. Ver VALOR_APROXIMADO_PEDIDO.
  const ingresos = ingresoEstimado(entregados);

  // La bitácora de abajo solo lista lo que vino del TELÉFONO. Los eventos
  // cargados a mano no tienen hora real —la columna es `not null`, así que
  // llevan un relleno (ver horaRelleno en actions.ts)— y ponerlos en la línea
  // de tiempo sería inventar: aparecerían treinta filas idénticas a la misma
  // hora, y encima con el aviso de "sin señal" encendido, porque entre esa hora
  // de relleno y el momento en que la oficina cargó el día pueden pasar
  // semanas. Van resumidos en su propio bloque, que es todo lo que se sabe.
  const delTelefono = eventos
    .filter((e) => e.origen === "app")
    .sort((a, b) => a.hora.localeCompare(b.hora));
  const manuales = eventos.filter((e) => e.origen === "manual");
  const manualEntregados = manuales.filter((e) => e.tipo === "entrega").length;
  const manualOmitidos = manuales.filter((e) => e.tipo === "omision").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{choferNombre}</CardTitle>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Truck className="h-3.5 w-3.5" />
          {formatNumber(eventos.length)} registro{eventos.length === 1 ? "" : "s"}
        </span>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-semibold tabular-nums">{entregados}</p>
            <p className="text-xs text-muted">Entregados</p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums">{omitidos}</p>
            <p className="text-xs text-muted">No entregados</p>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums">{formatCLP(ingresos)}</p>
            <p className="text-xs text-muted">Ingresos del día</p>
          </div>
        </div>

        {manuales.length > 0 ? (
          <div className="rounded-xl border border-[#ece8f8] bg-[#faf9fe] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="violet">Carga manual</Badge>
              <span className="text-xs text-muted">
                Cargado desde la oficina, sin registro de horas
              </span>
            </div>
            <p className="mt-2 text-sm">
              {formatNumber(manualEntregados)} entregado
              {manualEntregados === 1 ? "" : "s"} · {formatNumber(manualOmitidos)} no entregado
              {manualOmitidos === 1 ? "" : "s"}
              {manualEntregados + manualOmitidos === 0 ? " (solo día trabajado)" : ""}
            </p>
            {choferId ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {confirmandoBorrado ? (
                  <>
                    <span className="text-xs text-danger">
                      ¿Borrar esta carga manual?
                      {delTelefono.length === 0
                        ? " El día completo desaparece del panel, junto con su liquidación si estaba confirmada."
                        : " Lo que mandó el teléfono se conserva."}
                    </span>
                    <Button
                      onClick={onBorrarManual}
                      disabled={pendingBorrar}
                      size="sm"
                      variant="danger"
                    >
                      {pendingBorrar ? "Borrando…" : "Sí, borrar"}
                    </Button>
                    <Button
                      onClick={() => setConfirmandoBorrado(false)}
                      disabled={pendingBorrar}
                      size="sm"
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => setConfirmandoBorrado(true)}
                    size="sm"
                    variant="dangerOutline"
                  >
                    <Trash2 className="h-4 w-4" />
                    Borrar carga manual
                  </Button>
                )}
              </div>
            ) : null}
            {errorBorrar ? (
              <p className="mt-2 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
                {errorBorrar}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Un día íntegramente manual no tiene bitácora que mostrar: el bloque
            de arriba ya dice todo lo que se sabe de él. */}
        {delTelefono.length === 0 ? null : (
        <ol className="max-h-72 space-y-1 overflow-y-auto">
          {delTelefono.map((e) => {
            const retraso = minutosEntre(e.hora, e.created_at);
            const presentacion = PRESENTACION[e.tipo];
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 rounded-lg border border-[#f0f0f2] px-3 py-2 text-sm"
              >
                <span className="w-11 shrink-0 text-xs tabular-nums text-muted">
                  {formatTime(e.hora)}
                </span>
                {presentacion.icono}
                <span className="min-w-0 flex-1 truncate">{presentacion.etiqueta}</span>
                {retraso >= MINUTOS_RETRASO_NOTABLE ? (
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs text-warn"
                    title={`Marcado a las ${formatTime(e.hora)}, recibido a las ${formatTime(e.created_at)}: el conductor estuvo sin señal.`}
                  >
                    <CloudOff className="h-3.5 w-3.5" />
                    {Math.round(retraso)} min
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-[#f0f0f2] pt-3">
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="h-4 w-4 shrink-0 text-muted" />
            {pago ? (
              <span>
                Pago del conductor:{" "}
                <span className="font-semibold tabular-nums">{formatCLP(pago.pago_total)}</span>
                <span className="block text-xs text-muted">
                  {formatCLP(pago.pago_dia)} por el día · {formatCLP(pago.pago_base)} por{" "}
                  {formatNumber(pago.pedidos_entregados)} pedido
                  {pago.pedidos_entregados === 1 ? "" : "s"}
                  {pago.pago_bono > 0 ? ` · ${formatCLP(pago.pago_bono)} de bono` : ""}
                </span>
              </span>
            ) : (
              <span className="text-muted">Liquidación de este día aún sin confirmar</span>
            )}
          </div>
          {choferId ? (
            <Button onClick={onCalcularPago} disabled={pendingPago} size="sm" variant="secondary">
              {pendingPago ? "Confirmando…" : pago ? "Recalcular" : "Confirmar pago"}
            </Button>
          ) : null}
        </div>
        {errorPago ? (
          <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
            {errorPago}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
