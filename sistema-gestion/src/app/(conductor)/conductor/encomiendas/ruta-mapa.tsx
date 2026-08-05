"use client";

// Mapa de navegación del conductor, con Mapbox GL JS.
//
// Antes esto era Leaflet + leaflet-rotate. Leaflet no sabe girar: leaflet-rotate
// es un complemento abandonado que le parchea las tripas, y el giro había que
// animarlo a mano cuadro a cuadro con requestAnimationFrame, reposicionando
// todos los marcadores en cada paso. De ahí venían los dos problemas que se
// veían en terreno: el arrastre y el zoom peleaban con la animación del giro, y
// los nombres de las calles se daban vuelta junto con el mapa.
//
// Con GL JS el giro es nativo: easeTo() desplaza, gira e inclina en UNA sola
// animación sobre la placa de video, y las etiquetas de calle se quedan
// derechas. Se fueron ~90 líneas: el bucle de animación del giro, la
// transición del marcador y el cálculo a mano del ángulo del cono.

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type PuntoMapa = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  activa: boolean;
  completada: boolean;
};

export type Ubicacion = {
  lat: number;
  lng: number;
  /** Rumbo en grados (0-360, 0 = norte), o null si todavía no se conoce
   *  (recién montado, o el chofer está detenido y nunca se movió). */
  heading: number | null;
};

// Estilo pensado para manejar: calles más gruesas, menos ruido de puntos de
// interés y mejor contraste que el estilo genérico.
const ESTILO = "mapbox://styles/mapbox/navigation-day-v1";

// Este estilo trae, ENCIMA de cada calle, las capas de tráfico de Mapbox
// (source-layer "traffic"), que colorean la congestión. El nivel "low" —tráfico
// fluido— lo pinta de hsl(120, 70%, 60%): un verde fosforescente. En Arica casi
// nunca hay atasco, así que "low" es prácticamente toda la ciudad y el mapa
// terminaba forrado en ese verde, que además no tiene nada que ver con la
// paleta de la app.
//
// La solución no es cambiar de estilo (el resto de navigation-day-v1 —calles
// gruesas, pocos POI— es justo lo que sirve para manejar), sino repintar esas
// capas: el verde se apaga del todo y quedan solo los tres niveles que sí son
// información, con los colores de la app.
const COLOR_CONGESTION: [string, ...unknown[]] = [
  "match",
  ["get", "congestion"],
  "moderate",
  "#b45309", // --warn
  "heavy",
  "#c0362c", // --danger
  "severe",
  "#7a1f18", // --danger, más oscuro
  "transparent",
];

// "low" no se dibuja: que la ciudad entera esté pintada de "acá se puede
// circular bien" no le dice nada al chofer, solo ensucia el mapa.
const OPACIDAD_CONGESTION: [string, ...unknown[]] = [
  "match",
  ["get", "congestion"],
  ["moderate", "heavy", "severe"],
  0.8,
  0,
];

function apagarVerdeDelTrafico(mapa: mapboxgl.Map): void {
  for (const capa of mapa.getStyle()?.layers ?? []) {
    if (capa.type !== "line" || capa["source-layer"] !== "traffic") continue;

    // Las capas de congestión traen el color como expresión (un "match" sobre
    // la propiedad congestion); las de contorno lo traen como color fijo —esas
    // son el reborde blanco de las autopistas y no hay que recolorearlas, solo
    // que desaparezcan junto con la línea que envuelven.
    if (Array.isArray(capa.paint?.["line-color"])) {
      mapa.setPaintProperty(capa.id, "line-color", COLOR_CONGESTION);
    }
    mapa.setPaintProperty(capa.id, "line-opacity", OPACIDAD_CONGESTION);
  }
}

// Arica, como centro de respaldo cuando todavía no hay ni paradas ni
// ubicación GPS (recién montado el mapa, o permiso de ubicación pendiente).
const CENTRO_ARICA: [number, number] = [-70.3126, -18.4783];

// Zoom e inclinación al ENTRAR a modo navegación — nivel calle y vista
// inclinada, como Google Maps/Waze al arrancar un viaje. La inclinación es lo
// que hace que se vea "hacia adelante" y no desde arriba. Después de eso el
// zoom queda en manos del chofer.
const ZOOM_NAVEGACION = 17;
const PITCH_NAVEGACION = 50;

// El GPS avisa cada uno o dos segundos, así que animar cerca de un segundo hace
// que el mapa "fluya" en vez de dar saltos de una posición a la otra.
const MS_DESPLAZAMIENTO = 1000;

const FUENTE_DIA = "ruta-dia";
const FUENTE_NAV = "ruta-navegacion";
// Ruta propuesta y todavía no guardada (ver vista-previa-ruta.tsx). Se dibuja
// cortada y en color de marca: es una ruta "en borrador", distinta a la línea
// azul de "por acá tienes que ir ahora".
const FUENTE_PREVIA = "ruta-previa";

// Se lee a nivel de módulo (Next.js reemplaza las NEXT_PUBLIC_* al compilar):
// así la falta del token se puede mostrar en el dibujado, sin estado ni efectos.
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Mapbox necesita WebGL. Se comprueba ANTES de intentar crear el mapa: si no
// está, `new mapboxgl.Map` explota y el chofer se queda con una pantalla gris
// sin explicación.
function soportaWebGL(): boolean {
  if (typeof document === "undefined") return true; // en el servidor no se sabe
  try {
    const lienzo = document.createElement("canvas");
    return Boolean(lienzo.getContext("webgl2") ?? lienzo.getContext("webgl"));
  } catch {
    return false;
  }
}

const TAMANO_MARCADOR = 72; // el cono de visión necesita espacio alrededor del punto

function colorPunto(p: PuntoMapa, previa: boolean): string {
  // En una ruta propuesta ninguna parada es "la que sigue" todavía: van todas
  // del mismo color, el de marca, igual que su línea.
  if (previa) return "#0f766e";
  if (p.activa) return "#c0362c";
  if (p.completada) return "#2e9e5b";
  return "#6e6e73";
}

type LineaGeoJSON = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

function linea(coordenadas?: [number, number][] | null): LineaGeoJSON {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coordenadas ?? [] },
  };
}

function elementoParada(p: PuntoMapa, previa = false): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `background:${colorPunto(p, previa)};color:#fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
  el.textContent = p.label;
  return el;
}

// Punto de ubicación con cono de visión, como el de Mapas de iPhone: el punto
// azul marca dónde estás y el cono translúcido hacia dónde vas.
//
// El cono se dibuja apuntando hacia ARRIBA y ya no hay que girarlo a mano: el
// marcador se crea con rotationAlignment "map", así que Mapbox lo mantiene
// alineado con el terreno y basta con darle el rumbo real. Con leaflet-rotate
// había que calcular (rumbo + giro del mapa) en cada dibujado.
function elementoUbicacion(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `position:relative;width:${TAMANO_MARCADOR}px;height:${TAMANO_MARCADOR}px;pointer-events:none`;
  const c = TAMANO_MARCADOR / 2;
  el.innerHTML = `
<div data-cono style="position:absolute;inset:0;opacity:0;transition:opacity .3s ease-out">
  <svg width="${TAMANO_MARCADOR}" height="${TAMANO_MARCADOR}" viewBox="0 0 ${TAMANO_MARCADOR} ${TAMANO_MARCADOR}">
    <defs>
      <radialGradient id="cono-ubicacion-chofer" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#1d3a8f" stop-opacity=".55"/>
        <stop offset="70%" stop-color="#1d3a8f" stop-opacity=".12"/>
        <stop offset="100%" stop-color="#1d3a8f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <path d="M${c} ${c} L18 7.2 A34 34 0 0 1 54 7.2 Z" fill="url(#cono-ubicacion-chofer)"/>
  </svg>
</div>
<div style="position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:9999px;background:#1d3a8f;border:3px solid #fff;box-shadow:0 0 0 2px rgba(29,58,143,.35),0 1px 5px rgba(0,0,0,.45)"></div>`;
  return el;
}

/** Ruta calculada y todavía sin guardar, para que el chofer la vea antes de
 *  aceptarla. Mientras esté puesta, el mapa muestra ESTA ruta —encuadrada
 *  completa, de norte y sin inclinación, como un mapa de papel— en vez de la
 *  vista de manejo. */
export type PreviaRuta = {
  puntos: PuntoMapa[];
  geometria: [number, number][] | null;
};

export function RutaMapa({
  puntos,
  miUbicacion,
  rumbo,
  geometria,
  geometriaNavegacion,
  previa,
  siguiendo,
  onArrastre,
}: {
  puntos: PuntoMapa[];
  /** Posición GPS actual del chofer (ver useUbicacionActual) — mientras
   *  "siguiendo" esté activo, centra el mapa en modo navegación (como Google
   *  Maps/Waze); no afecta el orden de las paradas. */
  miUbicacion?: Ubicacion | null;
  /** Hacia dónde va el chofer, en grados horarios desde el norte: con esto se
   *  GIRA el mapa para que esa dirección quede siempre "arriba", y se orienta
   *  el cono de visión. Sale del camino que viene por delante en la ruta (ver
   *  rumboDelCamino) y, si no hay ruta, del rumbo del GPS. */
  rumbo?: number | null;
  /** Trazado de la ruta completa del día ([lng, lat] por punto). Se dibuja
   *  apagado, como referencia. */
  geometria?: [number, number][] | null;
  /** Trazado desde la posición actual hasta la parada activa (ver
   *  useNavegacion): esta es la línea que el chofer tiene que seguir ahora,
   *  así que va destacada por encima de la anterior. */
  geometriaNavegacion?: [number, number][] | null;
  /** Ruta propuesta a la vista (ver PreviaRuta). Reemplaza los marcadores de la
   *  ruta del día mientras está puesta. */
  previa?: PreviaRuta | null;
  /** Modo navegación: el mapa sigue y orienta según la ubicación del chofer.
   *  El estado vive en el componente padre porque el botón para retomarlo
   *  también (ver ruta-conductor.tsx). */
  siguiendo: boolean;
  /** El chofer arrastró el mapa a mano: quiere mirar otra cosa, así que hay
   *  que dejar de seguirlo hasta que toque "centrar". */
  onArrastre: () => void;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  // El estilo se carga de forma ASÍNCRONA y hasta que termine no se pueden
  // agregar fuentes ni capas. Sin avisar por estado, los efectos que dibujan
  // encima corrían una sola vez, encontraban el mapa sin estilo, se iban sin
  // hacer nada y nunca volvían: el mapa quedaba vacío para siempre.
  const [mapaListo, setMapaListo] = useState(false);
  // Solo se escribe desde el manejador asíncrono de errores de Mapbox (token
  // rechazado, estilo que no carga). Los otros dos casos —sin token, sin
  // WebGL— se saben antes de dibujar y no necesitan estado.
  const [errorMapa, setErrorMapa] = useState<string | null>(null);
  const [soportaMapa] = useState(soportaWebGL);

  const entroModoNavegacionRef = useRef(false);
  const encuadreInicialRef = useRef(false);
  const usuarioMovioRef = useRef(false);
  // El chofer tiene el dedo en el mapa: el código no toca la vista hasta que
  // suelte, o el movimiento por GPS pelea con el gesto.
  const gestoRef = useRef(false);
  const marcadorUbicacionRef = useRef<mapboxgl.Marker | null>(null);
  const marcadoresParadasRef = useRef<mapboxgl.Marker[]>([]);
  // El handler de arrastre se registra una sola vez, al crear el mapa, así
  // que lee la última versión del callback desde un ref en vez de quedarse
  // con la primera.
  const onArrastreRef = useRef(onArrastre);

  useEffect(() => {
    onArrastreRef.current = onArrastre;
  }, [onArrastre]);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor || mapaRef.current || !TOKEN || !soportaMapa) return;

    mapboxgl.accessToken = TOKEN;
    const mapa = new mapboxgl.Map({
      container: contenedor,
      style: ESTILO,
      center: CENTRO_ARICA,
      zoom: 13,
      // Los controles por defecto no se montan: en el celular se hace zoom
      // con los dedos, y la esquina de arriba a la izquierda la ocupan el
      // botón "Inicio" y el cartel de navegación.
      attributionControl: false,
    });
    mapaRef.current = mapa;

    // La atribución es obligatoria por licencia, pero compacta: abajo a la
    // derecha ocupa lo mínimo y no tapa el botón de centrar.
    mapa.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    mapa.on("load", () => {
      apagarVerdeDelTrafico(mapa);

      // La ruta del día va primero para que la de navegación quede ENCIMA.
      mapa.addSource(FUENTE_DIA, { type: "geojson", data: linea() });
      mapa.addLayer({
        id: FUENTE_DIA,
        type: "line",
        source: FUENTE_DIA,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#6e6e73", "line-width": 3, "line-opacity": 0.4 },
      });

      mapa.addSource(FUENTE_NAV, { type: "geojson", data: linea() });
      mapa.addLayer({
        id: FUENTE_NAV,
        type: "line",
        source: FUENTE_NAV,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1d3a8f", "line-width": 6, "line-opacity": 0.9 },
      });

      // Encima de todo: cuando hay una ruta propuesta, es lo único que el chofer
      // tiene que mirar.
      mapa.addSource(FUENTE_PREVIA, { type: "geojson", data: linea() });
      mapa.addLayer({
        id: FUENTE_PREVIA,
        type: "line",
        source: FUENTE_PREVIA,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#0f766e",
          "line-width": 5,
          "line-opacity": 0.95,
          "line-dasharray": [2, 1.2],
        },
      });

      setMapaListo(true);
    });

    mapa.on("error", (e) => {
      // Un estilo que no carga o un token rechazado dejan el mapa gris sin
      // decir nada: sin este mensaje no hay forma de saber qué pasó.
      const mensaje = e.error?.message ?? "";
      if (/access token|Unauthorized|401|403/i.test(mensaje)) {
        setErrorMapa("El token de Mapbox fue rechazado. Avisa al administrador.");
      }
    });

    // "dragstart" solo lo dispara un arrastre real del usuario, así que sirve
    // para distinguir "el chofer tomó el control" de un recentrado automático.
    mapa.on("dragstart", () => {
      usuarioMovioRef.current = true;
      onArrastreRef.current();
    });

    // "Tiene el dedo apoyado" se detecta con los eventos del navegador y no con
    // los del mapa: cubre de una sola vez el arrastre y el pellizco, y no hay
    // que adivinar si un "zoomstart" lo disparó el chofer o nuestro propio
    // acercamiento de entrada (que se autocancelaría).
    //
    // Un pellizco NO corta el seguimiento, solo frena el movimiento por código
    // mientras dura — igual que en Maps: acercar no significa "quiero mirar
    // otra cosa". Eso lo decide dragstart, arriba.
    const alTocar = () => {
      gestoRef.current = true;
    };
    const alSoltar = () => {
      gestoRef.current = false;
    };
    contenedor.addEventListener("touchstart", alTocar, { passive: true });
    contenedor.addEventListener("touchend", alSoltar, { passive: true });
    contenedor.addEventListener("touchcancel", alSoltar, { passive: true });

    // Si el contenedor mide 0x0 en el momento exacto de crear el mapa (pasa
    // seguido en Safari/iOS, que asienta el layout un poco más tarde que
    // Chrome), el mapa queda gris para siempre. Se le avisa dos veces con un
    // pequeño retraso.
    const t1 = setTimeout(() => mapa.resize(), 100);
    const t2 = setTimeout(() => mapa.resize(), 500);
    const onResize = () => mapa.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      contenedor.removeEventListener("touchstart", alTocar);
      contenedor.removeEventListener("touchend", alSoltar);
      contenedor.removeEventListener("touchcancel", alSoltar);
      marcadorUbicacionRef.current = null;
      marcadoresParadasRef.current = [];
      mapa.remove();
      mapaRef.current = null;
    };
  }, [soportaMapa]);

  // Marcadores numerados de las paradas. Con una ruta propuesta a la vista se
  // dibujan LAS DE LA PROPUESTA: son otras paradas y en otro orden, y mezclarlas
  // con las de la ruta vigente daría dos números distintos sobre la misma casa.
  const puntosDibujados = previa ? previa.puntos : puntos;
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;

    marcadoresParadasRef.current = puntosDibujados.map((p) =>
      new mapboxgl.Marker({ element: elementoParada(p, previa != null) })
        .setLngLat([p.lng, p.lat])
        .addTo(mapa),
    );

    return () => {
      for (const m of marcadoresParadasRef.current) m.remove();
      marcadoresParadasRef.current = [];
    };
  }, [puntosDibujados, previa, mapaListo]);

  // Los dos trazados. Actualizar los datos de la fuente es todo lo que hace
  // falta: no hay que crear ni destruir capas en cada cambio.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_DIA) as mapboxgl.GeoJSONSource | undefined)?.setData(linea(geometria));
  }, [geometria, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_NAV) as mapboxgl.GeoJSONSource | undefined)?.setData(
      linea(geometriaNavegacion),
    );
  }, [geometriaNavegacion, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_PREVIA) as mapboxgl.GeoJSONSource | undefined)?.setData(
      linea(previa?.geometria),
    );
  }, [previa, mapaListo]);

  // Al aparecer una ruta propuesta se encuadra COMPLETA, de norte y sin
  // inclinación: es el momento de mirarla entera, no de manejar. El panel de la
  // propuesta ocupa la mitad de abajo de la pantalla (ver vista-previa-ruta.tsx),
  // así que ese espacio se reserva con relleno para que la ruta quede arriba y
  // no debajo del panel.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !previa) return;

    const limites = new mapboxgl.LngLatBounds();
    for (const c of previa.geometria ?? []) limites.extend(c);
    for (const p of previa.puntos) limites.extend([p.lng, p.lat]);
    if (limites.isEmpty()) return;

    // Este encuadre ya deja el mapa donde tiene que estar: el de "una sola vez"
    // de más abajo no tiene que volver a moverlo al aceptar la ruta.
    encuadreInicialRef.current = true;

    const alto = mapa.getContainer().clientHeight;
    // Mapbox no puede encuadrar si el relleno se come el alto entero: siempre
    // hay que dejarle una franja donde dibujar.
    const abajo = Math.max(0, Math.min(Math.round(alto * 0.48), alto - 140));

    mapa.fitBounds(limites, {
      padding: { top: 70, bottom: abajo, left: 36, right: 36 },
      bearing: 0,
      pitch: 0,
      duration: 700,
      // Con UNA sola parada pendiente el recuadro no tiene tamaño y el encuadre
      // se iría al zoom máximo, dejando la pantalla en media cuadra sin ninguna
      // referencia de dónde queda eso.
      maxZoom: 16,
    });
  }, [previa, mapaListo]);

  // Encuadre de toda la ruta, UNA sola vez: apenas hay paradas que mostrar,
  // para no dejar el mapa clavado en el centro de respaldo (Arica) mientras no
  // haya señal de GPS. No se repite después: ni al re-dibujar, ni al dejar de
  // seguir la ubicación. Si ya se entró a modo navegación, tampoco: ahí manda
  // el GPS.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || puntos.length === 0) return;
    if (encuadreInicialRef.current || usuarioMovioRef.current || entroModoNavegacionRef.current) {
      return;
    }
    encuadreInicialRef.current = true;

    const limites = new mapboxgl.LngLatBounds();
    for (const p of puntos) limites.extend([p.lng, p.lat]);
    mapa.fitBounds(limites, { padding: 40, duration: 0 });
  }, [puntos, mapaListo]);

  // Modo navegación. Todo el movimiento pasa por easeTo, que desplaza, GIRA e
  // inclina en una sola animación — es exactamente lo que Leaflet no podía
  // hacer y el motivo del enredo que había acá antes.
  //
  // Al ENTRAR (recién abierto con ubicación disponible, o al tocar "centrar")
  // hace el acercamiento con inclinación, como el arranque de un viaje en Maps.
  // Después solo desplaza y gira, sin volver a tocar el zoom, para que el
  // chofer pueda acercar o alejar con los dedos y su zoom se respete.
  //
  // Al soltar el seguimiento el mapa se queda como está: no se endereza al
  // norte ni se baja la inclinación. Girarle la vista mientras tiene el dedo
  // apoyado es lo que hacía que la ruta pareciera acomodarse después del gesto.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !miUbicacion || !siguiendo) {
      if (!siguiendo) entroModoNavegacionRef.current = false;
      return;
    }
    if (gestoRef.current) return;

    const centro: [number, number] = [miUbicacion.lng, miUbicacion.lat];

    if (!entroModoNavegacionRef.current) {
      entroModoNavegacionRef.current = true;
      usuarioMovioRef.current = false;
      mapa.easeTo({
        center: centro,
        zoom: ZOOM_NAVEGACION,
        pitch: PITCH_NAVEGACION,
        bearing: rumbo ?? mapa.getBearing(),
        duration: 1200,
        essential: true,
      });
      return;
    }

    mapa.easeTo({
      center: centro,
      // Sin rumbo conocido se conserva el que ya tiene: pasarle 0 enderezaría
      // el mapa al norte cada vez que el chofer se detiene en un semáforo.
      bearing: rumbo ?? mapa.getBearing(),
      duration: MS_DESPLAZAMIENTO,
      easing: (t) => t, // lineal: el GPS entrega posiciones a ritmo constante
      essential: true,
    });
  }, [miUbicacion, rumbo, siguiendo, mapaListo]);

  // Punto de ubicación + cono de visión. El marcador se crea UNA vez y después
  // solo se le actualiza la posición y el rumbo.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !miUbicacion) return;

    if (!marcadorUbicacionRef.current) {
      marcadorUbicacionRef.current = new mapboxgl.Marker({
        element: elementoUbicacion(),
        // Alineados con el terreno: el cono queda apoyado en la calle y
        // apuntando al rumbo real, sin que haya que compensar el giro del mapa.
        rotationAlignment: "map",
        pitchAlignment: "map",
      })
        .setLngLat([miUbicacion.lng, miUbicacion.lat])
        .addTo(mapa);
    } else {
      marcadorUbicacionRef.current.setLngLat([miUbicacion.lng, miUbicacion.lat]);
    }

    marcadorUbicacionRef.current.setRotation(rumbo ?? 0);

    const cono = marcadorUbicacionRef.current
      .getElement()
      .querySelector<HTMLElement>("[data-cono]");
    // Sin rumbo conocido no se dibuja el cono: mostrarlo apuntando a cualquier
    // lado sería peor que no mostrarlo (igual que hace iPhone).
    if (cono) cono.style.opacity = rumbo == null ? "0" : "1";
  }, [miUbicacion, rumbo, mapaListo]);

  const mensajeError = !TOKEN
    ? "Falta configurar el token de Mapbox. Avisa al administrador."
    : !soportaMapa
      ? "Este teléfono no puede mostrar el mapa (no soporta WebGL)."
      : errorMapa;

  if (mensajeError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <p className="max-w-xs text-center text-sm text-muted">{mensajeError}</p>
      </div>
    );
  }

  return <div ref={contenedorRef} className="h-full w-full" />;
}
