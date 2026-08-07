"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Phone,
  Check,
  X,
  PackageCheck,
  ArrowLeft,
  LocateFixed,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistancia } from "@/lib/format";
import { BottomSheet } from "@/components/encomiendas/bottom-sheet";
import { Seccion } from "@/components/encomiendas/seccion";
import type { PreviaRuta, PuntoMapa } from "./ruta-mapa";
import { rumboDelCamino } from "@/lib/rutas";
import { useUbicacionActual } from "./use-ubicacion-actual";
import { useNavegacion } from "./use-navegacion";
import { useVozNavegacion } from "./use-voz";
import { InstruccionNavegacion } from "./instruccion-navegacion";
import type {
  EstadoEntregaLocal,
  EstadoLlamadaLocal,
  PedidoLocal,
} from "@/lib/encomiendas/local/almacen";

// mapbox-gl toca `window` apenas se importa — aunque este archivo ya es "use
// client", Next.js igual lo renderiza una vez en el servidor antes de
// hidratar, donde `window` no existe. ssr:false lo deja cargar solo en el
// navegador. (Además es un paquete grande: así no entra en el primer bulto.)
const RutaMapa = dynamic(() => import("./ruta-mapa").then((m) => m.RutaMapa), {
  ssr: false,
});

/** Una parada lista para mostrar: el pedido (que vive en el teléfono, ver
 *  lib/encomiendas/local) más cómo le fue en el día. El armado lo hace la
 *  pantalla contenedora; acá solo se dibuja. */
export type ParadaVista = {
  /** Orden de visita, empezando en 1. */
  secuencia: number;
  pedido: PedidoLocal;
  llamada: EstadoLlamadaLocal;
  entrega: EstadoEntregaLocal;
};

// Fase del flujo de la parada activa:
//   antes_llamar        → se muestra el botón "Llamar"
//   esperando_resultado  → tras llamar, se muestra "Contestó" / "No contestó"
//   confirmado           → contestó: se muestra "Pedido finalizado"
type Fase = "antes_llamar" | "esperando_resultado" | "confirmado";

function telHref(telefono: string): string {
  return `tel:${telefono.replace(/[^\d+]/g, "")}`;
}

// Botones de la tarjeta de la parada activa. Se usan a mano (y no el <Button>
// del sistema) porque acá van a ancho completo y con 48px de alto: es la
// acción que el chofer aprieta manejando, con el pulgar y sin mirar mucho.
const BOTON_PRINCIPAL =
  "flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-[0_1px_2px_rgba(11,93,86,0.3)] transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
const BOTON_RESULTADO =
  "flex h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

// Mensaje centrado para los casos en que no hay nada que hacer (sin ruta ese
// día, o ruta terminada).
function Aviso({
  titulo,
  texto,
  icono,
}: {
  titulo: string;
  texto?: string;
  icono?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card px-6 py-7 text-center shadow-soft">
      {icono}
      <p className="font-semibold">{titulo}</p>
      {texto ? <p className="mt-0.5 text-sm text-muted">{texto}</p> : null}
    </div>
  );
}

export function RutaConductor({
  paradas,
  geometria,
  soloLectura,
  sinRutaMensaje,
  previa,
  panelPrevia,
  onLlamada,
  onEntrega,
  children,
}: {
  /** En orden de visita. Vacío = no hay ruta armada para ese día. */
  paradas: ParadaVista[];
  /** Trazado por calles de la ruta completa, [lng, lat] por punto. */
  geometria: [number, number][] | null;
  /** true para días pasados: no se puede llamar/marcar entrega, solo ver
   *  cómo quedó esa ruta. */
  soloLectura: boolean;
  /** Qué mostrar dentro de la hoja cuando no hay ruta generada ese día — el
   *  mapa y la ubicación GPS igual se muestran (a eso venimos). */
  sinRutaMensaje?: { titulo: string; texto: string };
  /** Ruta recién calculada y sin guardar: mientras esté puesta, el mapa la
   *  muestra encuadrada completa en vez de seguir al chofer. */
  previa?: PreviaRuta | null;
  /** El panel con el detalle de esa ruta y los botones de aceptar/descartar
   *  (ver vista-previa-ruta.tsx). Lo arma la pantalla contenedora, que es la
   *  dueña del guardado; acá solo se ubica sobre la hoja. */
  panelPrevia?: React.ReactNode;
  /** Las escrituras las hace la pantalla contenedora, que es la dueña del
   *  guardado local: acá solo se avisa qué apretó el chofer. Si la promesa
   *  falla, el mensaje se muestra en la tarjeta. */
  onLlamada: (pedidoId: string, resultado: "contesto" | "no_contesto") => Promise<void>;
  onEntrega: (pedidoId: string, resultado: "entregado" | "omitido") => Promise<void>;
  /** Contenido de la página (nav de día, pendientes, agregar pedido) — se
   *  muestra dentro de la misma hoja deslizable, debajo de la lista. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Único estado de flujo que NO se puede deducir de los datos: ya se marcó el
  // número y falta que el chofer diga si contestó. Todo lo demás sale de la
  // propia parada (ver "fase" más abajo), así que un re-render con datos
  // frescos no puede dejar la tarjeta mostrando algo que ya no corresponde —
  // que era el motivo del ajuste-de-estado-en-render que había antes acá.
  const [esperandoResultadoDe, setEsperandoResultadoDe] = useState<string | null>(null);

  // Solo se rastrea la ubicación en el día activo — un día pasado no
  // necesita saber dónde está el chofer ahora.
  const {
    ubicacion: miUbicacion,
    error: errorUbicacion,
    pedirAhora: pedirUbicacion,
  } = useUbicacionActual(!soloLectura);
  // Modo navegación (seguir la ubicación). Vive acá y no dentro del mapa
  // porque el botón para retomarlo se dibuja fuera del mapa: dentro quedaba
  // atrapado bajo la hoja deslizable (el contenedor del mapa es z-0 para
  // encerrar los z-index internos de Leaflet, así que nada de adentro puede
  // quedar por encima de la hoja, z-20).
  const [siguiendo, setSiguiendo] = useState(true);

  const hayRuta = paradas.length > 0;

  // La parada activa es siempre la primera pendiente en orden de visita — no
  // hay que guardar un "puntero" aparte: se recalcula solo al actualizar.
  const activa = useMemo(() => paradas.find((p) => p.entrega === "pendiente") ?? null, [paradas]);

  // Derivada, no guardada: si el chofer ya llamó y le contestaron, la fase es
  // "confirmado" venga de donde venga el render.
  const fase: Fase =
    activa == null
      ? "antes_llamar"
      : esperandoResultadoDe === activa.pedido.id
        ? "esperando_resultado"
        : activa.llamada === "contesto"
          ? "confirmado"
          : "antes_llamar";

  // Instrucción paso a paso (tipo Waze) hacia la parada activa — ver
  // use-navegacion.ts para cuándo se vuelve a pedir el tramo.
  const destinoActivo = useMemo(() => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return null;
    return { lat: activa.pedido.lat, lng: activa.pedido.lng };
  }, [activa]);
  const navegacion = useNavegacion(!soloLectura && !!destinoActivo, miUbicacion, destinoActivo);
  // Los avisos los dice el teléfono en voz alta (Mapbox los entrega ya escritos
  // en español). Solo en el día activo: en un día pasado no hay nada que decir.
  // Con una ruta propuesta a la vista tampoco: el chofer está parado decidiendo
  // si la usa, y las indicaciones que sonarían son de la ruta anterior.
  const voz = useVozNavegacion(
    !soloLectura && !previa,
    navegacion.paso,
    navegacion.metrosAManiobra,
  );

  // Hacia dónde orientar la vista: el camino que viene por delante en la
  // propia ruta. Se prefiere eso antes que el rumbo del GPS —que solo existe
  // yendo en movimiento— y, sobre todo, antes que la brújula del teléfono,
  // que apunta hacia donde quedó apoyado el aparato en el auto y no hacia
  // donde va el camino.
  const rumbo = useMemo(() => {
    if (miUbicacion && navegacion.geometria) {
      const delCamino = rumboDelCamino(miUbicacion, navegacion.geometria);
      if (delCamino != null) return delCamino;
    }
    return miUbicacion?.heading ?? null;
  }, [miUbicacion, navegacion.geometria]);

  // La flecha de arriba a la izquierda deshace el último paso, como el botón de
  // atrás del navegador: si el chofer venía mirando el día de ayer, vuelve a
  // hoy; si entró desde el inicio, vuelve al inicio. Antes iba SIEMPRE a
  // /conductor, así que revisar tres días atrás y querer volver obligaba a
  // rehacer el camino hacia adelante.
  //
  // El resguardo es para cuando no hay a dónde volver: la app instalada abierta
  // desde el ícono, o esta URL abierta directo, arrancan con un solo paso en el
  // historial y back() no haría nada — el botón parecería roto.
  function volver() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/conductor");
  }

  // Envuelve una escritura del chofer: apaga los botones mientras corre y deja
  // el mensaje a la vista si falla. Devuelve si salió bien, para poder seguir
  // con la acción encadenada (marcar el número del que sigue, por ejemplo).
  async function correr(accion: () => Promise<void>): Promise<boolean> {
    setError(null);
    setCargando(true);
    try {
      await accion();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.");
      return false;
    } finally {
      setCargando(false);
    }
  }

  function onLlamar() {
    if (!activa) return;
    window.location.href = telHref(activa.pedido.telefono);
    setEsperandoResultadoDe(activa.pedido.id);
  }

  async function onResultadoLlamada(resultado: "contesto" | "no_contesto") {
    if (!activa) return;
    const pedidoId = activa.pedido.id;

    const ok = await correr(() => onLlamada(pedidoId, resultado));
    if (!ok) return;
    setEsperandoResultadoDe(null);

    // No contestó: la parada queda omitida por hoy y se avanza a la siguiente,
    // que arranca desde cero (sin llamar todavía).
    if (resultado === "no_contesto") {
      await correr(() => onEntrega(pedidoId, "omitido"));
    }
  }

  async function onPedidoFinalizado() {
    if (!activa) return;

    // Antes de escribir (lo que recalcula "activa") ubicamos a quién sigue,
    // para poder marcar su número de una vez.
    const siguiente = paradas.find(
      (p) => p.secuencia > activa.secuencia && p.entrega === "pendiente",
    );

    const ok = await correr(() => onEntrega(activa.pedido.id, "entregado"));
    if (!ok) return;

    if (siguiente) {
      window.location.href = telHref(siguiente.pedido.telefono);
      setEsperandoResultadoDe(siguiente.pedido.id);
    } else {
      setEsperandoResultadoDe(null);
    }
  }

  // Memorizado a propósito: el mapa usa esta lista como dependencia de sus
  // efectos, y si se recreara en cada render (la ubicación GPS re-renderiza
  // seguido) volvería a re-encuadrar el mapa una y otra vez, arrancándole el
  // zoom al chofer.
  const puntos: PuntoMapa[] = useMemo(
    () =>
      paradas
        .filter((p) => p.pedido.lat != null && p.pedido.lng != null)
        .map((p) => ({
          id: p.pedido.id,
          lat: p.pedido.lat!,
          lng: p.pedido.lng!,
          label: String(p.secuencia),
          activa: p.pedido.id === activa?.pedido.id,
          completada: p.entrega === "entregado",
        })),
    [paradas, activa],
  );

  const entregadas = paradas.filter((p) => p.entrega === "entregado").length;
  const porcentaje = paradas.length > 0 ? Math.round((entregadas / paradas.length) * 100) : 0;

  // Lo único que se ve con la hoja cerrada, así que muestra exactamente lo que
  // el chofer necesita de un vistazo: a quién va y a dónde.
  const resumenColapsado = !hayRuta ? (
    <p className="truncate text-sm font-medium">{sinRutaMensaje?.titulo ?? "Sin ruta"}</p>
  ) : !activa ? (
    <p className="truncate text-sm font-medium">
      {soloLectura ? "Ver ruta de este día" : "¡Ruta completa!"}
    </p>
  ) : (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold tabular-nums text-brand-foreground">
        {activa.secuencia}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{activa.pedido.nombre}</p>
        <p className="truncate text-xs text-muted">{activa.pedido.direccion}</p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0">
      {/* z-0 encierra los z-index internos de Leaflet (hasta 1000 en los
          controles de zoom) dentro de su propio contexto de apilamiento —
          si no, se escapan por encima de la hoja y el botón "Inicio". */}
      <div className="absolute inset-0 z-0">
        <RutaMapa
          puntos={puntos}
          miUbicacion={miUbicacion}
          rumbo={rumbo}
          geometria={geometria}
          geometriaNavegacion={navegacion.geometria}
          previa={previa}
          // Con una ruta propuesta a la vista el mapa NO sigue al chofer: se
          // queda quieto mostrándola entera. Al aceptarla o descartarla vuelve
          // solo al modo manejo, con su acercamiento de entrada.
          siguiendo={siguiendo && !previa}
          // Mover el mapa para mirar bien la ruta propuesta NO es "quiero mirar
          // otra cosa mientras manejo": si contara como tal, el chofer aceptaría
          // la ruta y el mapa habría dejado de seguirlo sin que se entienda por
          // qué.
          onArrastre={() => {
            if (!previa) setSiguiendo(false);
          }}
        />
      </div>

      <div className="absolute inset-x-3 top-3 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={volver}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {/* Con una ruta propuesta encima, la indicación de manejo es de la
              parada de la ruta vieja: distrae y no corresponde. */}
          {navegacion.paso && !previa ? (
            <InstruccionNavegacion
              paso={navegacion.paso}
              siguiente={navegacion.siguiente}
              metros={navegacion.metrosAManiobra}
            />
          ) : null}
        </div>

        {/* Sin ubicación no hay modo navegación posible (ni flecha, ni giro
            del mapa, ni indicaciones) — antes esto fallaba en silencio y no
            había forma de saber que el problema era el permiso. */}
        {!soloLectura && errorUbicacion ? (
          <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn shadow-md">
            {errorUbicacion}
          </p>
        ) : null}
      </div>

      {/* Fuera del contenedor del mapa (z-0) para que no quede atrapado bajo
          la hoja deslizable. Además de retomar el seguimiento, vuelve a pedir
          la ubicación: si el permiso nunca se concedió, esto dispara el
          diálogo del navegador en vez de no hacer nada. */}
      {!soloLectura && !previa ? (
        <div className="absolute bottom-24 right-3 z-10 flex flex-col gap-2">
          {/* Silenciar la voz. Manejando, una indicación que no se puede callar
              es peor que no tener voz — y la preferencia queda guardada, así que
              el chofer decide una vez y no vuelve a pensar en esto. */}
          {voz.disponible ? (
            <button
              onClick={voz.alternar}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
              aria-label={voz.activa ? "Silenciar indicaciones" : "Activar indicaciones por voz"}
            >
              {voz.activa ? (
                <Volume2 className="h-5 w-5 text-brand" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted" />
              )}
            </button>
          ) : null}

          <button
            onClick={() => {
              setSiguiendo(true);
              pedirUbicacion();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md"
            aria-label="Centrar y seguir mi ubicación"
          >
            <LocateFixed
              className={`h-5 w-5 ${siguiendo && miUbicacion ? "text-brand" : "text-muted"}`}
            />
          </button>
        </div>
      ) : null}

      <BottomSheet resumenColapsado={resumenColapsado} senalCerrar={previa ?? null}>
        {error ? (
          <p className="mb-3 rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}

        {/* Avance del día: de un vistazo, cuánto queda. */}
        {hayRuta && !soloLectura ? (
          <div className="mb-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#ececef]">
              <div
                className="h-full rounded-full bg-ok transition-[width] duration-500"
                style={{ width: `${porcentaje}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
              {entregadas} de {paradas.length}
            </span>
          </div>
        ) : null}

        {!hayRuta ? (
          <Aviso titulo={sinRutaMensaje?.titulo ?? "Sin ruta"} texto={sinRutaMensaje?.texto} />
        ) : soloLectura ? null : !activa ? (
          <Aviso
            titulo="¡Ruta completa!"
            texto="No quedan más paradas pendientes por hoy."
            icono={<PackageCheck className="mx-auto mb-2 h-8 w-8 text-ok" />}
          />
        ) : (
          <div className="rounded-2xl bg-card p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold tabular-nums text-brand-foreground">
                {activa.secuencia}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-tight">{activa.pedido.nombre}</p>
                <p className="mt-0.5 text-sm text-muted">{activa.pedido.direccion}</p>
              </div>
              {navegacion.metrosAManiobra != null && navegacion.metrosAManiobra > 0 ? (
                <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold tabular-nums text-brand">
                  {formatDistancia(navegacion.metrosAManiobra)}
                </span>
              ) : null}
            </div>

            {/* La nota del pedido ("dejar en portería", "llamar al llegar") es
                justo lo que el chofer necesita ver antes de bajarse. */}
            {activa.pedido.notas ? (
              <p className="mt-3 rounded-xl bg-background px-3 py-2 text-xs text-muted">
                {activa.pedido.notas}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2">
              {fase === "antes_llamar" ? (
                <button onClick={onLlamar} className={BOTON_PRINCIPAL}>
                  <Phone className="h-4 w-4" />
                  Llamar
                </button>
              ) : null}

              {fase === "esperando_resultado" ? (
                // El botón de llamar queda en el medio para poder reintentar
                // sin tener que decidir todavía si contestó o no (suena
                // ocupado, se cortó, etc.).
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <button
                    disabled={cargando}
                    onClick={() => onResultadoLlamada("contesto")}
                    className={cn(BOTON_RESULTADO, "bg-ok text-white")}
                  >
                    <Check className="h-4 w-4 shrink-0" />
                    Contestó
                  </button>
                  <button
                    onClick={onLlamar}
                    aria-label="Volver a llamar"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-separator bg-card text-brand transition-transform active:scale-[0.97]"
                  >
                    <Phone className="h-5 w-5" />
                  </button>
                  <button
                    disabled={cargando}
                    onClick={() => onResultadoLlamada("no_contesto")}
                    className={cn(BOTON_RESULTADO, "bg-danger text-white")}
                  >
                    <X className="h-4 w-4 shrink-0" />
                    No contestó
                  </button>
                </div>
              ) : null}

              {fase === "confirmado" ? (
                <button disabled={cargando} onClick={onPedidoFinalizado} className={BOTON_PRINCIPAL}>
                  <PackageCheck className="h-4 w-4" />
                  Pedido finalizado
                </button>
              ) : null}
            </div>
          </div>
        )}

        {hayRuta ? (
          <Seccion titulo="Ruta del día">
            <ol className="overflow-hidden rounded-2xl bg-card shadow-soft">
              {paradas.map((p, i) => {
                const esActiva = p.pedido.id === activa?.pedido.id;
                return (
                  <li
                    key={p.pedido.id}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-2.5 text-sm",
                      i > 0 && "border-t border-divider",
                      esActiva && "bg-brand-soft",
                    )}
                  >
                    <span
                      className={cn(
                        "w-5 shrink-0 text-center text-xs font-semibold tabular-nums",
                        esActiva ? "text-brand" : "text-muted",
                      )}
                    >
                      {p.secuencia}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        p.entrega === "entregado" && "text-muted",
                      )}
                    >
                      {p.pedido.nombre}
                    </span>
                    {p.entrega === "entregado" ? (
                      <Check className="h-4 w-4 shrink-0 text-ok" />
                    ) : p.entrega === "omitido" ? (
                      <X className="h-4 w-4 shrink-0 text-danger" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Seccion>
        ) : null}

        {children}
      </BottomSheet>

      {/* Por encima de la hoja (z-20): mientras haya una ruta propuesta, decidir
          si se usa o no es lo único que hay que hacer en esta pantalla. */}
      {panelPrevia ? <div className="fixed inset-x-0 bottom-0 z-30">{panelPrevia}</div> : null}
    </div>
  );
}
