"use client";

// Dueña del guardado local del chofer: lee los pedidos y la ruta del teléfono,
// se los pasa armados a RutaConductor (que solo dibuja) y aplica lo que el
// chofer marca. Antes esta orquestación la hacía page.tsx en el servidor; ahora
// los datos no están en el servidor, así que tiene que pasar acá.
//
// Consecuencia visible: aparece un instante de "cargando" que antes no existía,
// porque la pantalla ya no llega armada desde el servidor. A cambio, las
// aperturas siguientes no esperan a nadie y todo funciona sin señal.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CloudOff, MapPinOff, Plus, X } from "lucide-react";
import { DiaNav } from "@/components/encomiendas/dia-nav";
import { Seccion } from "@/components/encomiendas/seccion";
import {
  cerrarRuta,
  leerPedidos,
  leerRuta,
  marcarEntrega,
  marcarLlamada,
  rutaTerminada,
  type PedidoLocal,
  type RutaLocal,
} from "@/lib/encomiendas/local/almacen";
import { useEnvioActividad } from "@/lib/encomiendas/local/enviar";
import {
  confirmarRutaLocal,
  type PropuestaRuta,
} from "@/lib/encomiendas/local/generar-ruta";
import { RutaConductor, type ParadaVista } from "./ruta-conductor";
import type { PreviaRuta } from "./ruta-mapa";
import { PedidoFormLocal } from "./pedido-form-local";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { VistaPreviaRuta } from "./vista-previa-ruta";

function PantallaMensaje({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="text-lg font-semibold">{titulo}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{texto}</p>
      <Link href="/conductor" className="mt-4 text-sm text-brand hover:underline">
        Volver al inicio
      </Link>
    </div>
  );
}

/** Fila de un pedido que todavía no entró en la ruta. Tocarla abre la edición:
 *  es la única forma de arreglar una dirección que no se pudo ubicar. */
function FilaPedido({
  pedido,
  primera,
  onEditar,
}: {
  pedido: PedidoLocal;
  primera: boolean;
  onEditar: () => void;
}) {
  const sinUbicar = pedido.lat == null || pedido.lng == null;
  return (
    <li className={primera ? "" : "border-t border-divider"}>
      <button
        type="button"
        onClick={onEditar}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors active:bg-background"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{pedido.nombre}</p>
          <p className="truncate text-xs text-muted">{pedido.direccion}</p>
        </div>
        {sinUbicar ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn">
            <MapPinOff className="h-3 w-3" />
            Sin ubicar
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function PantallaEncomiendas({
  choferId,
  nombreChofer,
  fecha,
  esHoy,
  direccionEmpresa,
}: {
  choferId: string;
  nombreChofer: string;
  fecha: string;
  /** false para días pasados: solo se puede mirar cómo quedó esa jornada. */
  esHoy: boolean;
  direccionEmpresa: string | null;
}) {
  const [ruta, setRuta] = useState<RutaLocal | null>(null);
  const [pedidos, setPedidos] = useState<PedidoLocal[]>([]);
  // Qué fecha corresponde a lo que hay ahora en "ruta"/"pedidos". "Cargando" se
  // deduce de acá en vez de guardarse aparte: al cambiar de día, los datos en
  // memoria son del día anterior y no hay que mostrarlos como si fueran de este.
  const [fechaCargada, setFechaCargada] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [editando, setEditando] = useState<PedidoLocal | null>(null);
  // Ruta calculada esperando el visto bueno del chofer. Mientras esté acá no se
  // guardó nada: la ruta que rige sigue siendo la de "ruta".
  const [propuesta, setPropuesta] = useState<PropuestaRuta | null>(null);

  const { pendientes: sinEnviar, enviando, intentar } = useEnvioActividad(esHoy, choferId, fecha);

  // Separada de recargar() a propósito: no escribe estado, así que el efecto de
  // abajo puede llamarla y recién después aplicar el resultado. Mezclar las dos
  // cosas hace que cualquier lectura desde un efecto parezca un setState
  // sincrónico, aunque ocurra después de esperar al teléfono.
  const leerTodo = useCallback(
    () => Promise.all([leerRuta(fecha), leerPedidos()]),
    [fecha],
  );

  const recargar = useCallback(async () => {
    const [rutaGuardada, pedidosGuardados] = await leerTodo();
    setRuta(rutaGuardada);
    setPedidos(pedidosGuardados);
  }, [leerTodo]);

  // Una propuesta es de un día concreto: al cambiar de día no tiene nada que
  // hacer en pantalla. Ajustado durante el render (mismo patrón que
  // use-navegacion.ts), así no se alcanza a dibujar el panel de una ruta que
  // era de ayer.
  if (propuesta && propuesta.fecha !== fecha) setPropuesta(null);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const [rutaGuardada, pedidosGuardados] = await leerTodo();
        if (cancelado) return;
        setRuta(rutaGuardada);
        setPedidos(pedidosGuardados);
        setErrorCarga(null);
      } catch (e) {
        if (cancelado) return;
        // ErrorAlmacenLocal ya trae un mensaje accionable (instalar la app,
        // salir del modo privado); cualquier otro se muestra tal cual.
        setErrorCarga(
          e instanceof Error ? e.message : "No se pudo leer lo guardado en el teléfono.",
        );
      } finally {
        // Marca el intento como terminado, bien o mal: sin esto la pantalla
        // quedaría en "Cargando…" para siempre si el teléfono no puede guardar.
        if (!cancelado) setFechaCargada(fecha);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [leerTodo, fecha]);

  // Acá vivía el traspaso de transición (el botón "Cargar tus N pedidos
  // pendientes" y lib/encomiendas/local/importar.ts), que copiaba a este
  // teléfono lo que quedaba en encomienda_pedidos. Esa tabla la retiró la
  // migración 0027, así que el botón ya no podía traer nada.

  const onLlamada = useCallback(
    async (pedidoId: string, resultado: "contesto" | "no_contesto") => {
      await marcarLlamada({ fecha, pedidoId, choferId }, resultado);
      await recargar();
      intentar();
    },
    [fecha, choferId, recargar, intentar],
  );

  const onEntrega = useCallback(
    async (pedidoId: string, resultado: "entregado" | "omitido") => {
      await marcarEntrega({ fecha, pedidoId, choferId }, resultado);

      // Si esa era la última parada, la jornada terminó. Cerrarla es lo que le
      // dice al servidor que ya puede valorar el día (0032): mientras siga
      // abierta no se calcula ni un peso, justamente para que el panel no
      // muestre la liquidación de una ruta que todavía está pasando.
      //
      // Se relee del teléfono en vez de mirar el estado de React: `recargar` es
      // asíncrono y el estado de esta pasada todavía no incluye la parada que
      // se acaba de cerrar.
      const [rutaGuardada] = await leerTodo();
      if (rutaTerminada(rutaGuardada)) await cerrarRuta(fecha);

      await recargar();
      intentar();
    },
    [fecha, choferId, leerTodo, recargar, intentar],
  );

  const onPedidoGuardado = useCallback(() => void recargar(), [recargar]);

  // Guardar la ruta propuesta. El panel de la previsualización se encarga de
  // mostrar el error si algo falla, así que acá se deja subir.
  const onUsarPropuesta = useCallback(async () => {
    if (!propuesta) return;
    await confirmarRutaLocal(propuesta);
    // Primero se recarga y recién después se saca la propuesta de pantalla: al
    // revés, el mapa se quedaría un instante sin ninguna ruta dibujada.
    await recargar();
    setPropuesta(null);
  }, [propuesta, recargar]);

  // Las paradas propuestas, numeradas para el mapa (ver PreviaRuta). La cuenta
  // arranca después de las que ya se cerraron hoy —que al guardar quedan
  // primero, ver guardarRuta— para que el número del mapa sea el mismo que
  // tendrá la parada en la ruta del día, y el mismo que muestra el panel.
  const previa = useMemo<PreviaRuta | null>(
    () =>
      propuesta
        ? {
            puntos: propuesta.paradas.map((p, i) => ({
              id: p.id,
              lat: p.lat,
              lng: p.lng,
              label: String(propuesta.cerradas + i + 1),
              activa: false,
              completada: false,
            })),
            geometria: propuesta.geometria,
          }
        : null,
    [propuesta],
  );

  // Las paradas ya vienen guardadas en orden de visita (lo cerrado primero, ver
  // guardarRuta), así que el número de orden es la posición en la lista. Un
  // pedido borrado a mano simplemente no aparece.
  //
  // Memoizado y ARRIBA de los retornos tempranos (los hooks no pueden quedar
  // después): de esta lista sale la de marcadores del mapa, y si cambiara de
  // identidad en cada render, el mapa borraría y volvería a poner los treinta
  // marcadores cada vez que se re-dibuja esta pantalla — que pasa sola cada
  // minuto, cuando el reintento de envío de actividad toca su estado.
  const paradas = useMemo<ParadaVista[]>(() => {
    const porId = new Map(pedidos.map((p) => [p.id, p] as const));
    return (ruta?.paradas ?? []).flatMap((parada, i) => {
      const pedido = porId.get(parada.pedidoId);
      return pedido
        ? [{ secuencia: i + 1, pedido, llamada: parada.llamada, entrega: parada.entrega }]
        : [];
    });
  }, [ruta, pedidos]);

  if (fechaCargada !== fecha) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted">
        Cargando tu ruta…
      </div>
    );
  }

  if (errorCarga) {
    return <PantallaMensaje titulo="No se pudo abrir tu ruta" texto={errorCarga} />;
  }

  const enRuta = new Set((ruta?.paradas ?? []).map((p) => p.pedidoId));
  const pendientes = pedidos.filter((p) => p.estado === "pendiente");
  const sinRutear = pendientes.filter((p) => !enRuta.has(p.id));
  const sinUbicar = sinRutear.filter((p) => p.lat == null || p.lng == null);

  const extras = (
    <>
      {/* Lo primero de la hoja cuando corresponde: para el chofer, la diferencia
          entre "mi trabajo está registrado" y "lo tengo anotado y nadie más lo
          sabe" es lo único de esta pantalla que le toca el sueldo. */}
      {esHoy && sinEnviar > 0 ? (
        <Seccion titulo="Sin enviar">
          <div className="flex items-start gap-2.5 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">
            <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {sinEnviar === 1 ? "1 registro sin enviar" : `${sinEnviar} registros sin enviar`}
              </p>
              <p className="text-xs opacity-90">
                Está guardado en tu teléfono. Se envía solo en cuanto haya señal.
              </p>
            </div>
            <button
              type="button"
              onClick={intentar}
              disabled={enviando}
              className="shrink-0 text-xs font-semibold underline disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Reintentar"}
            </button>
          </div>
        </Seccion>
      ) : null}

      {esHoy && editando ? (
        <Seccion titulo="Editar pedido">
          <div className="rounded-2xl bg-card p-4 shadow-soft">
            <PedidoFormLocal
              pedido={editando}
              onGuardado={() => {
                setEditando(null);
                void recargar();
              }}
              onCancelar={() => setEditando(null)}
            />
          </div>
        </Seccion>
      ) : esHoy ? (
        <Seccion titulo="Pedidos">
          <div className="space-y-2">
            {sinRutear.length > 0 ? (
              <>
                <ul className="overflow-hidden rounded-2xl bg-card shadow-soft">
                  {sinRutear.map((p, i) => (
                    <FilaPedido
                      key={p.id}
                      pedido={p}
                      primera={i === 0}
                      onEditar={() => {
                        setAgregando(false);
                        setEditando(p);
                      }}
                    />
                  ))}
                </ul>
                <p className="px-1 text-xs text-muted">
                  {sinRutear.length === 1
                    ? "1 pedido todavía no entró en la ruta."
                    : `${sinRutear.length} pedidos todavía no entraron en la ruta.`}{" "}
                  {sinUbicar.length > 0
                    ? `${sinUbicar.length === 1 ? "Uno no se pudo ubicar" : `${sinUbicar.length} no se pudieron ubicar`} en el mapa: tócalo para corregir la dirección.`
                    : "Rehazla para incluirlos."}
                </p>
              </>
            ) : null}

            {agregando ? (
              <div className="rounded-2xl bg-card p-4 shadow-soft">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Nuevo pedido</p>
                  <button
                    type="button"
                    onClick={() => setAgregando(false)}
                    className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                    Cerrar
                  </button>
                </div>
                {/* Se queda abierto tras guardar: los pedidos se cargan en
                    tanda, uno atrás del otro. */}
                <PedidoFormLocal
                  onGuardado={onPedidoGuardado}
                  onCancelar={() => setAgregando(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAgregando(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-separator bg-card py-3.5 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft active:scale-[0.99]"
              >
                <Plus className="h-4 w-4" />
                Agregar pedido
              </button>
            )}
          </div>
        </Seccion>
      ) : null}

      {esHoy ? (
        <Seccion titulo={paradas.length > 0 ? "Rehacer la ruta" : "Armar la ruta"}>
          <GenerarRutaLocal
            fecha={fecha}
            direccionEmpresa={direccionEmpresa}
            regenerar={paradas.length > 0}
            autoGenerar={paradas.length === 0 && pendientes.length > 0}
            onPropuesta={setPropuesta}
          />
        </Seccion>
      ) : null}

      <Seccion titulo="Ver otro día">
        <DiaNav fecha={fecha} basePath="/conductor/encomiendas" />
      </Seccion>
    </>
  );

  return (
    <RutaConductor
      paradas={paradas}
      geometria={ruta?.geometria ?? null}
      soloLectura={!esHoy}
      previa={previa}
      panelPrevia={
        propuesta ? (
          <VistaPreviaRuta
            propuesta={propuesta}
            onUsar={onUsarPropuesta}
            onDescartar={() => setPropuesta(null)}
          />
        ) : null
      }
      onLlamada={onLlamada}
      onEntrega={onEntrega}
      sinRutaMensaje={{
        titulo: esHoy ? `Hola, ${nombreChofer.split(" ")[0]}` : "Sin ruta ese día",
        texto: esHoy
          ? "Todavía no hay ruta armada para hoy. Agrega pedidos abajo y ármala."
          : "No se armó ninguna ruta para esta fecha.",
      }}
    >
      {extras}
    </RutaConductor>
  );
}
