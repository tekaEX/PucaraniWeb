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
  /** Radio de error que declara el GPS, en metros. Con esto se descartan las
   *  lecturas que pondrían el punto adentro de una manzana (ver
   *  use-ubicacion-actual). */
  precisionM?: number | null;
  /** Cuándo la tomó el GPS (ms). Sirve para saber que el punto quedó viejo:
   *  filtrar lecturas malas sin decirlo dejaría el punto congelado. */
  tomadaEn?: number;
  /** Velocidad en m/s cuando el aparato la entrega (iOS a veces no). */
  velocidad?: number | null;
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
const PITCH_NAVEGACION = 55;

// El GPS avisa cada uno o dos segundos, así que animar cerca de un segundo hace
// que el mapa "fluya" en vez de dar saltos de una posición a la otra.
const MS_DESPLAZAMIENTO = 1000;

// ----------------------------------------------------------------------------
// Dónde queda el punto del chofer en la pantalla
// ----------------------------------------------------------------------------
// Centrado, la mitad de arriba muestra la calle que ya se pasó y lo que viene
// —lo único que sirve manejando— queda apretado contra la hoja deslizable.
// Ningún navegador lo hace así: el punto va abajo y la pantalla mira adelante.
//
// Se consigue con `padding`, no moviendo el centro: el padding corre el centro
// de la CÁMARA, así que además el punto pasa a ser el PIVOTE del giro. Con el
// centro movido a mano, al doblar el mapa gira alrededor del medio de la
// pantalla y el punto describe un arco — se ve como si el auto derrapara.
//
// Es una propiedad que queda pegada al mapa, así que toda llamada de cámara
// tiene que pasar la suya (los fitBounds de acá abajo ya lo hacen).
const PROPORCION_PADDING_ABAJO = 0.45;

function paddingNavegacion(mapa: mapboxgl.Map): mapboxgl.PaddingOptions {
  const alto = mapa.getContainer().clientHeight;
  return { top: 0, left: 0, right: 0, bottom: Math.round(alto * PROPORCION_PADDING_ABAJO) };
}

// Por debajo de esto no se gira. El rumbo casi siempre viene estimado (en
// iPhone el GPS no entrega heading), así que oscila uno o dos grados entre
// lecturas aunque el auto vaya derecho: sin este piso el mapa vibra todo el
// viaje, y cada vibración es una animación de un segundo que se pisa con la
// siguiente.
const GRADOS_MINIMOS_PARA_GIRAR = 4;

/** Diferencia entre dos rumbos, siempre 0-180. */
function difAngulo(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

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

// El elemento del suelo se dibuja acostado sobre la calle: a 55° de
// inclinación la perspectiva se come casi la mitad del alto, así que necesita
// bastante más lienzo del que termina ocupando en pantalla.
const TAMANO_MARCADOR = 128;

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

// ----------------------------------------------------------------------------
// El marcador del chofer
// ----------------------------------------------------------------------------
// TODO lo que lo compone vive en el plano de la CALLE: se crea con
// pitchAlignment "map", así que Mapbox le aplica rotateX(inclinación) +
// rotateZ(giro) y queda acostado sobre el pavimento. Inclinando o girando el
// mapa, el marcador se inclina y gira con él — está pegado al terreno, no
// dibujado sobre el vidrio.
//
// Nada de esto puede alinearse a la pantalla, ni siquiera el punto redondo. Un
// elemento derecho mientras el mapa se inclina se despega de la calle y flota:
// deja de ser "el chofer está acá" y pasa a ser una calcomanía en la ventana.
//
// La figura es UNA sola —el disco— y adentro lleva una flecha blanca con el
// sentido del auto, como el marcador de Mapas. Antes eran dos figuras
// distintas según hubiera rumbo o no, y el cambio de una a otra se veía como
// un parpadeo: ahora lo único que aparece y desaparece es la flecha de adentro.
//
//   · con rumbo    disco + flecha blanca + haz de visión;
//   · sin rumbo    el disco solo. Una flecha apuntando a cualquier lado es peor
//                  que no tener flecha, y un haz que no significa nada es una
//                  afirmación falsa sobre hacia dónde mira el auto.
//
// La sombra de contacto va siempre: es lo que apoya la figura en la calle.

/** Sombra, haz, disco y flecha: todo en el plano de la calle. */
function elementoUbicacion(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;width:${TAMANO_MARCADOR}px;height:${TAMANO_MARCADOR}px;pointer-events:none;will-change:transform`;
  el.innerHTML = `
<svg width="${TAMANO_MARCADOR}" height="${TAMANO_MARCADOR}" viewBox="0 0 128 128" style="display:block">
  <defs>
    <!-- El haz se desvanece hacia adelante en vez de cortarse: un borde duro
         parecía el alcance de un sensor y no "por acá voy". -->
    <radialGradient id="pucarani-cono" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2f56c9" stop-opacity=".45"/>
      <stop offset="55%" stop-color="#2f56c9" stop-opacity=".15"/>
      <stop offset="100%" stop-color="#2f56c9" stop-opacity="0"/>
    </radialGradient>
    <!-- El disco se aclara hacia adelante. Acostado sobre la calle, ese
         degradado es lo que le da volumen: sin él es una mancha plana. -->
    <linearGradient id="pucarani-disco" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a76e8"/>
      <stop offset="55%" stop-color="#2547ad"/>
      <stop offset="100%" stop-color="#16307a"/>
    </linearGradient>
    <!-- Sombra de contacto: sin ella la flecha flota sobre la calle. -->
    <radialGradient id="pucarani-sombra" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0b1020" stop-opacity=".35"/>
      <stop offset="60%" stop-color="#0b1020" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#0b1020" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Haz de 60° saliendo del punto, como el de Mapas. Solo con rumbo. -->
  <g data-cono style="opacity:0;transition:opacity .35s ease-out">
    <path d="M64 64 L33 10.3 A62 62 0 0 1 95 10.3 Z" fill="url(#pucarani-cono)"/>
  </g>

  <!-- Va siempre: es lo que apoya la figura en el pavimento. -->
  <ellipse cx="64" cy="70" rx="24" ry="20" fill="url(#pucarani-sombra)"/>

  <!-- El disco, centrado en la coordenada. También acostado: al inclinar el
       mapa se convierte en una elipse, que es exactamente lo que hace un
       círculo pintado en el suelo. El borde oscuro apenas se nota, pero es lo
       que lo despega de un pavimento claro. -->
  <circle cx="64" cy="64" r="20" fill="#fff" stroke="#0b1020" stroke-opacity=".12"/>
  <circle cx="64" cy="64" r="16" fill="url(#pucarani-disco)"/>

  <!-- La flecha del sentido del auto, adentro del disco. Alargada a propósito:
       a 55° la perspectiva se come el 43% del alto, y una flecha de
       proporciones normales queda como una raya. -->
  <g data-flecha style="opacity:0;transition:opacity .3s ease-out">
    <path d="M64 51.5 L73.5 74.5 L64 69 L54.5 74.5 Z" fill="#fff"/>
  </g>
</svg>`;
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
  claveDestino,
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
  /** Identifica la parada a la que se está yendo. Cuando cambia —se terminó una
   *  entrega y arrancó el tramo siguiente— el mapa vuelve a acomodarse al
   *  camino nuevo: centro, zoom, inclinación y orientación. */
  claveDestino?: string | null;
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
  /** A qué parada se acomodó la vista por última vez. null = todavía a
   *  ninguna, así que en cuanto se conozca el rumbo hay que acomodarse. */
  const claveOrientadaRef = useRef<string | null>(null);
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
      if (!siguiendo) {
        // Al retomar el seguimiento hay que volver a acomodar la vista, así que
        // se olvidan las dos cosas: que se entró, y a qué camino se apuntó.
        entroModoNavegacionRef.current = false;
        claveOrientadaRef.current = null;
      }
      return;
    }
    if (gestoRef.current) return;

    const centro: [number, number] = [miUbicacion.lng, miUbicacion.lat];

    // Acomodarse al camino, que pasa en tres momentos y con una sola condición:
    //
    //   · al ENTRAR a modo navegación;
    //   · en cuanto aparece el rumbo del camino. Al abrir la app, la entrada
    //     corre con la primera lectura de GPS —cuando el tramo todavía no llegó
    //     de Mapbox—, así que no hay hacia dónde mirar; y detenido en el galpón
    //     el iPhone no entrega rumbo, nunca, así que sin esto la vista se
    //     quedaría torcida hasta empezar a andar;
    //   · al cambiar de parada, que es un camino nuevo.
    //
    // La clave se registra solo cuando hay rumbo: mientras no lo haya, la
    // condición sigue pendiente y se dispara sola apenas llegue el tramo.
    const entrando = !entroModoNavegacionRef.current;
    const otroCamino = rumbo != null && claveOrientadaRef.current !== (claveDestino ?? null);

    if (entrando || otroCamino) {
      entroModoNavegacionRef.current = true;
      if (rumbo != null) claveOrientadaRef.current = claveDestino ?? null;
      usuarioMovioRef.current = false;
      mapa.easeTo({
        center: centro,
        zoom: ZOOM_NAVEGACION,
        pitch: PITCH_NAVEGACION,
        bearing: rumbo ?? mapa.getBearing(),
        // El punto baja al tercio inferior en la misma animación.
        padding: paddingNavegacion(mapa),
        // Entrar es un movimiento anunciado; acomodarse a un camino nuevo tiene
        // que sentirse como un ajuste y no como si el mapa volviera a empezar.
        duration: entrando ? 1200 : 800,
        essential: true,
      });
      return;
    }

    // Sin rumbo conocido se conserva el que ya tiene: pasarle 0 enderezaría
    // el mapa al norte cada vez que el chofer se detiene en un semáforo. Y un
    // cambio de un par de grados tampoco se aplica: es ruido del rumbo
    // estimado, no una curva.
    const actual = mapa.getBearing();
    const girar = rumbo != null && difAngulo(rumbo, actual) >= GRADOS_MINIMOS_PARA_GIRAR;

    mapa.easeTo({
      center: centro,
      bearing: girar ? rumbo : actual,
      // Se repite en cada movimiento: el alto del contenedor cambia al girar el
      // teléfono o al aparecer la barra del navegador, y un padding calculado
      // con el alto viejo deja el punto corrido.
      padding: paddingNavegacion(mapa),
      duration: MS_DESPLAZAMIENTO,
      easing: (t) => t, // lineal: el GPS entrega posiciones a ritmo constante
      essential: true,
    });
  }, [miUbicacion, rumbo, claveDestino, siguiendo, mapaListo]);

  // El marcador del chofer. Se crea UNA vez y después solo se le actualiza la
  // posición, el rumbo y qué figura se muestra.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !miUbicacion) return;

    const centro: [number, number] = [miUbicacion.lng, miUbicacion.lat];

    if (!marcadorUbicacionRef.current) {
      marcadorUbicacionRef.current = new mapboxgl.Marker({
        element: elementoUbicacion(),
        // Acostado sobre la calle y girando con ella. De acá sale la
        // perspectiva —Mapbox le aplica rotateX(inclinación)— y por eso basta
        // con darle el rumbo real, sin compensar el giro del mapa.
        rotationAlignment: "map",
        pitchAlignment: "map",
      })
        .setLngLat(centro)
        .addTo(mapa);
    } else {
      marcadorUbicacionRef.current.setLngLat(centro);
    }

    // Sin rumbo se deja en 0: da igual hacia dónde apunte un disco, y de todas
    // formas ni la flecha ni el haz se están dibujando.
    marcadorUbicacionRef.current.setRotation(rumbo ?? 0);

    // El disco está siempre; lo que aparece con el rumbo es la flecha de
    // adentro y el haz.
    const el = marcadorUbicacionRef.current.getElement();
    const mostrar = (selector: string, visible: boolean) => {
      const g = el.querySelector<SVGGElement>(selector);
      if (g) g.style.opacity = visible ? "1" : "0";
    };
    const conRumbo = rumbo != null;
    mostrar("[data-cono]", conRumbo);
    mostrar("[data-flecha]", conRumbo);
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
