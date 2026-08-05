// Orden de paradas SIN VROOM: con ~30 paradas/día, vecino-más-cercano + mejora
// 2-opt corre en milisegundos y da un resultado MUY cercano al óptimo — no
// es una garantía matemática de óptimo exacto (eso requeriría resolver TSP
// exacto, inviable en tiempo razonable ya pasando ~15-20 paradas), pero es el
// estándar de la industria para este tamaño de problema sin pagar un solver.
//
// El trazado por calles, la distancia, la duración y las instrucciones paso a
// paso se le piden a la API de direcciones de Mapbox. Antes era el servidor de
// demostración de OSRM, que en su propia documentación se declara "para uso
// razonable NO COMERCIAL, sin garantías de disponibilidad" — con cinco choferes
// pidiendo el camino cada 150 metros, esto era una empresa en producción
// apoyada en un servidor de pruebas que puede cortar el acceso cualquier día.
//
// Además Mapbox entrega las instrucciones YA ESCRITAS en español, incluidos los
// avisos de voz con la distancia calculada ("En 300 metros, gire a la derecha
// hacia Vicuña Mackenna"). Con OSRM había que traducir a mano su vocabulario de
// maniobras y no había voz posible.
import type { Coordenada } from "./geocoding";

const DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox";
const MATRIX = "https://api.mapbox.com/directions-matrix/v1/mapbox";

// Perfil con tráfico real e histórico. Se usa también para el trazado del día
// completo: cuesta lo mismo que el perfil sin tráfico y la duración estimada
// sale más parecida a la realidad.
const PERFIL = "driving-traffic";

// Verificado contra la API: 25 puntos devuelve 200 y 26 devuelve 422, tanto en
// "driving" como en "driving-traffic". Una jornada de 30 paradas más la base son
// 31 puntos, así que el trazado del día SIEMPRE hay que pedirlo por tramos.
const MAX_PUNTOS_POR_CONSULTA = 25;

// Distancia en línea recta entre dos puntos, en metros. Vive acá y se exporta
// porque la usan también los hooks del chofer (ver use-navegacion y
// use-ubicacion-actual): antes estaba escrita tres veces, idéntica.
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rumbo de A hacia B, en grados horarios desde el norte.
export function rumboEntre(a: Coordenada, b: Coordenada): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Índice del punto del trazado más cercano a una posición. */
function indiceMasCercano(posicion: Coordenada, puntos: Coordenada[]): number {
  let masCerca = 0;
  let mejorDist = Infinity;
  for (let i = 0; i < puntos.length; i++) {
    const d = distanciaMetros(posicion, puntos[i]);
    if (d < mejorDist) {
      mejorDist = d;
      masCerca = i;
    }
  }
  return masCerca;
}

function aCoordenadas(geometria: [number, number][]): Coordenada[] {
  return geometria.map(([lng, lat]) => ({ lat, lng }));
}

// Hacia dónde sigue el camino que el chofer está recorriendo: se mira un punto
// del trazado unos metros más adelante y se devuelve el rumbo hacia ahí.
//
// Es mejor referencia que la brújula del teléfono —que apunta hacia donde está
// apoyado el aparato, no hacia donde va el auto— y que el rumbo del GPS, que
// solo existe yendo en movimiento. Mirando la propia ruta se sabe cómo
// orientar la vista incluso estando detenido en un semáforo.
export function rumboDelCamino(
  posicion: Coordenada,
  geometria: [number, number][],
  metrosAdelante = 45,
): number | null {
  if (geometria.length < 2) return null;
  const puntos = aCoordenadas(geometria);

  // El trazado se pidió desde una posición anterior, así que primero hay que
  // ubicar por qué parte de él va el chofer ahora.
  const masCerca = indiceMasCercano(posicion, puntos);

  // Desde ahí se avanza por el trazado hasta juntar la distancia de
  // anticipación: ese punto es "hacia dónde sigue el camino".
  let acumulado = 0;
  let objetivo = puntos[puntos.length - 1];
  for (let i = masCerca; i < puntos.length - 1; i++) {
    acumulado += distanciaMetros(puntos[i], puntos[i + 1]);
    if (acumulado >= metrosAdelante) {
      objetivo = puntos[i + 1];
      break;
    }
  }

  // Si el punto quedó demasiado cerca (ya casi llegando), el rumbo saldría de
  // dos posiciones casi iguales y daría un valor errático.
  if (distanciaMetros(posicion, objetivo) < 5) return null;
  return rumboEntre(posicion, objetivo);
}

// Metros que faltan hasta el final de un trazado, SIGUIENDO el camino y no en
// línea recta. Se calcula en el teléfono en cada lectura de GPS: es lo que
// permite que el cartel y la voz sepan la distancia exacta a la próxima
// maniobra sin volver a consultar la API (que se consulta cada 150 m).
export function metrosRestantes(posicion: Coordenada, geometria: [number, number][]): number {
  if (geometria.length === 0) return 0;
  const puntos = aCoordenadas(geometria);
  const desde = indiceMasCercano(posicion, puntos);

  let total = distanciaMetros(posicion, puntos[desde]);
  for (let i = desde; i < puntos.length - 1; i++) {
    total += distanciaMetros(puntos[i], puntos[i + 1]);
  }
  return Math.round(total);
}

/** Costo de ir del punto `a` al punto `b`, ambos por índice. */
type Costo = (a: number, b: number) => number;

function distanciaOrden(orden: number[], costo: Costo): number {
  let total = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    total += costo(orden[i], orden[i + 1]);
  }
  return total;
}

// Mejora local: prueba invertir cada segmento [i..j] y se queda con el mejor.
// El primer punto (índice 0, la base) queda fijo como inicio de la ruta.
function dosOpt(ordenInicial: number[], costo: Costo): number[] {
  let orden = [...ordenInicial];
  let mejorado = true;
  while (mejorado) {
    mejorado = false;
    // i llega hasta el penúltimo índice y j hasta el ÚLTIMO (orden.length - 1):
    // es una ruta abierta (no vuelve a la base), así que la última parada no
    // está fija y también debe poder moverse con el 2-opt. Antes j se
    // quedaba corto en "orden.length - 1" (excluyendo el último índice), lo
    // que dejaba afuera cualquier mejora que involucrara la parada final.
    for (let i = 1; i < orden.length - 1; i++) {
      for (let j = i + 1; j < orden.length; j++) {
        const candidato = [
          ...orden.slice(0, i),
          ...orden.slice(i, j + 1).reverse(),
          ...orden.slice(j + 1),
        ];
        if (distanciaOrden(candidato, costo) < distanciaOrden(orden, costo)) {
          orden = candidato;
          mejorado = true;
        }
      }
    }
  }
  return orden;
}

/** Vecino más cercano + 2-opt sobre un costo cualquiera. */
function heuristica(n: number, costo: Costo): number[] {
  const visitado = new Array(n).fill(false);
  visitado[0] = true;
  const orden = [0];
  let actual = 0;
  for (let k = 1; k < n; k++) {
    // Con la matriz de calles un costo puede ser Infinity (dos paradas sin
    // camino entre sí, según Mapbox), cosa que en línea recta no pasaba nunca.
    // Si TODAS las que quedan son inalcanzables no hay "más cercana", así que
    // se toma la primera pendiente: mejor una parada en un orden discutible que
    // un índice -1 metido en la ruta.
    let mejor = -1;
    let mejorDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visitado[j]) continue;
      if (mejor === -1) mejor = j;
      const d = costo(actual, j);
      if (d < mejorDist) {
        mejorDist = d;
        mejor = j;
      }
    }
    visitado[mejor] = true;
    orden.push(mejor);
    actual = mejor;
  }

  return dosOpt(orden, costo);
}

// Recibe puntos donde puntos[0] es la base (depósito/oficina) y el resto son
// las paradas a visitar. Devuelve los ÍNDICES en el orden de visita óptimo
// (el índice 0 siempre queda primero).
//
// Con "matriz" (distancias REALES por calles, ver matrizDistancias) el orden
// deja de ser el que parece bueno mirando el mapa en línea recta y pasa a ser
// el que de verdad se maneja menos. Es una diferencia grande: dos paradas a
// tres cuadras en línea recta pueden estar a quince por calle si en el medio
// hay sentidos únicos, una quebrada o la costanera. Medido sobre jornadas de 9
// paradas en Arica, ordenar por calle ahorra del orden de un kilómetro por día.
//
// Sin matriz (más de 25 puntos, o la API no respondió) se cae a la línea recta,
// que es lo que se hacía siempre.
export function ordenarParadas(puntos: Coordenada[], matriz?: number[][] | null): number[] {
  const n = puntos.length;
  if (n <= 2) return puntos.map((_, i) => i);

  const enLineaRecta: Costo = (a, b) => distanciaMetros(puntos[a], puntos[b]);
  const ordenRecto = heuristica(n, enLineaRecta);
  if (!matriz) return ordenRecto;

  // Un tramo sin dato (dos puntos sin camino entre ellos) no puede valer 0 o el
  // 2-opt lo elegiría siempre; se lo trata como imposible.
  const porCalle: Costo = (a, b) => matriz[a]?.[b] ?? Infinity;
  const ordenCalle = heuristica(n, porCalle);

  // El 2-opt es una mejora LOCAL: arrancar desde un orden u otro puede terminar
  // en mínimos distintos, y a veces el de línea recta cae en uno mejor. Como la
  // matriz ya está pedida, los dos órdenes se miden con el costo real y se elige
  // el ganador — no cuesta una consulta más y evita salir peor que antes.
  return distanciaOrden(ordenCalle, porCalle) <= distanciaOrden(ordenRecto, porCalle)
    ? ordenCalle
    : ordenRecto;
}

// ----------------------------------------------------------------------------
// Mapbox Directions
// ----------------------------------------------------------------------------

/** Falta la variable de entorno: es un error de configuración del despliegue,
 *  no una falla de red, así que se avisa fuerte en vez de degradar en silencio. */
export class ErrorTokenMapbox extends Error {
  constructor() {
    super(
      "Falta configurar NEXT_PUBLIC_MAPBOX_TOKEN. Sin ese token no hay mapa ni indicaciones.",
    );
  }
}

function urlDirections(puntos: Coordenada[], params: Record<string, string>): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new ErrorTokenMapbox();

  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(";");
  const query = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    // Mapbox trae esto en "true" por defecto para los perfiles en auto, y ese
    // default es el que hacía que la ruta "diera vueltas": obliga a SEGUIR
    // DERECHO al salir de cada parada intermedia, o sea prohíbe volver por
    // donde se vino. Para una camioneta de reparto —que se detiene, entrega y
    // puede perfectamente devolverse— eso no es una restricción real: es una
    // vuelta a la manzana regalada en cada entrega.
    //
    // Medido sobre 25 jornadas de Arica: con el default, 18 de 25 rutas salían
    // más largas, hasta 1.448 m de más en una ruta de solo 4 paradas.
    continue_straight: "false",
    access_token: token,
    ...params,
  });
  return `${DIRECTIONS}/${PERFIL}/${coords}?${query}`;
}

// Límite verificado contra la API: el perfil "driving" acepta 25 coordenadas
// (26 devuelve 422) y "driving-traffic" solo 10. Se usa "driving" a propósito:
// con 25 paradas entra una jornada completa en UNA consulta, y para decidir el
// ORDEN de las paradas las velocidades de tráfico del momento no ayudan —el
// chofer va a pasar por ahí dentro de tres horas, no ahora.
const MAX_PUNTOS_MATRIZ = 25;

// Distancias reales por calles entre TODAS las paradas (matriz n×n, en metros).
// Es lo que le falta a ordenarParadas para no ordenar mirando la línea recta.
//
// Devuelve null si no entra en una sola consulta o si la API no respondió: en
// ese caso se ordena como siempre, en línea recta. Nunca lanza — que no se pueda
// afinar el orden no es motivo para dejar al chofer sin ruta.
export async function matrizDistancias(puntos: Coordenada[]): Promise<number[][] | null> {
  if (puntos.length < 2 || puntos.length > MAX_PUNTOS_MATRIZ) return null;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(";");
  const query = new URLSearchParams({ annotations: "distance", access_token: token });

  try {
    const res = await fetch(`${MATRIX}/driving/${coords}?${query}`);
    if (!res.ok) return null;
    const datos = (await res.json()) as { distances?: (number | null)[][] };
    if (!Array.isArray(datos.distances)) return null;
    // Mapbox manda null en los pares que no tienen camino entre sí.
    return datos.distances.map((fila) => fila.map((d) => d ?? Infinity));
  } catch {
    return null;
  }
}

// Parte una lista de puntos en tramos de como máximo "max", repitiendo el
// último punto de cada tramo como primero del siguiente para que los trazados
// queden pegados sin huecos.
function enTramos(puntos: Coordenada[], max: number): Coordenada[][] {
  if (puntos.length <= max) return [puntos];
  const grupos: Coordenada[][] = [];
  let i = 0;
  while (i < puntos.length - 1) {
    const fin = Math.min(i + max, puntos.length);
    grupos.push(puntos.slice(i, fin));
    i = fin - 1;
  }
  return grupos;
}

export type RutaCalles = {
  /** [lng, lat] por punto — formato GeoJSON. */
  geometria: [number, number][];
  distanciaM: number;
  duracionS: number;
};

// Trazado real (por calles) de la ruta ya ordenada, con su distancia y duración.
// Devuelve null si la API no respondió: el llamador conserva el trazado anterior
// en vez de dejar al chofer con un mapa en blanco (ver guardarRuta).
export async function obtenerRutaCalles(
  puntosOrdenados: Coordenada[],
): Promise<RutaCalles | null> {
  if (puntosOrdenados.length < 2) return null;

  const geometria: [number, number][] = [];
  let distanciaM = 0;
  let duracionS = 0;

  for (const tramo of enTramos(puntosOrdenados, MAX_PUNTOS_POR_CONSULTA)) {
    let ruta: { geometry: { coordinates: [number, number][] }; distance: number; duration: number };
    try {
      const res = await fetch(urlDirections(tramo, {}));
      if (!res.ok) return null;
      ruta = (await res.json()).routes?.[0];
    } catch (e) {
      // Un token faltante NO es una falla de red: tiene que llegar al llamador.
      if (e instanceof ErrorTokenMapbox) throw e;
      return null;
    }
    if (!ruta) return null;

    // Un tramo a medias sería peor que ninguno: el chofer vería una línea que
    // se corta en el medio de la ciudad y parece la ruta completa.
    const coords = ruta.geometry.coordinates;
    // El primer punto de cada tramo posterior es el último del anterior.
    geometria.push(...(geometria.length === 0 ? coords : coords.slice(1)));
    distanciaM += ruta.distance;
    duracionS += ruta.duration;
  }

  return {
    geometria,
    distanciaM: Math.round(distanciaM),
    duracionS: Math.round(duracionS),
  };
}

/** Aviso de voz de una maniobra, tal como lo entrega Mapbox. */
export type AvisoVoz = {
  /** Ya escrito en español ("En 300 metros, gire a la derecha hacia Chacabuco"). */
  texto: string;
  /** A cuántos metros del final del paso corresponde decirlo. */
  aMetros: number;
};

export type PasoNavegacion = {
  /** Instrucción completa en español, lista para mostrar. La escribe Mapbox
   *  (language=es): ya no hay que traducir vocabulario de maniobras a mano. */
  instruccion: string;
  /** Texto corto del cartel: normalmente la calle a la que se entra. */
  banner: string | null;
  /** Metros a recorrer ANTES de ejecutar esta maniobra, según la API. En
   *  pantalla se prefiere el cálculo local (ver metrosRestantes), que se
   *  actualiza con cada lectura de GPS. */
  distanciaM: number;
  /** "turn" | "roundabout" | "arrive" | … — solo para elegir el ícono. */
  tipo: string;
  /** "left" | "right" | "slight left" | "uturn" | … , o null. Solo para el ícono. */
  modificador: string | null;
  /** Trazado de ESTE paso, que termina justo en la maniobra. Con esto se sabe
   *  cuántos metros faltan para el giro sin volver a consultar la API. */
  geometria: [number, number][];
  /** Avisos de voz de este paso, del más lejano al más cercano. */
  avisos: AvisoVoz[];
};

type PasoCrudo = {
  maneuver?: { type?: string; modifier?: string; instruction?: string };
  distance?: number;
  geometry?: { coordinates?: [number, number][] };
  bannerInstructions?: { primary?: { text?: string } }[];
  voiceInstructions?: { announcement?: string; distanceAlongGeometry?: number }[];
};

// Tramo de navegación (posición actual → parada activa): instrucciones paso a
// paso MÁS el trazado por calles de ese tramo — distinto de obtenerRutaCalles,
// que es la ruta completa del día (todas las paradas desde la base, calculada
// una sola vez al generar). Esta es la que el chofer necesita ver: cómo ir
// desde donde está AHORA hasta la próxima entrega.
//
// Se llama una vez por parada / cada vez que el chofer se aleja lo suficiente
// de donde se pidió la última (ver useNavegacion), no en cada actualización de
// GPS. Entre consulta y consulta, la distancia a la maniobra se recalcula en el
// teléfono con metrosRestantes().
// Cuánto se le permite a Mapbox apartarse del rumbo declarado al elegir por
// qué calzada arranca la ruta. Amplio a propósito: el rumbo muchas veces no
// viene del GPS sino estimado entre dos lecturas seguidas (ver
// use-ubicacion-actual), así que es ruidoso. Con 90° igual se descarta la
// calzada CONTRARIA de una avenida dividida —que es el caso que importa— sin
// arriesgar que la consulta se quede sin ningún camino válido.
const TOLERANCIA_RUMBO = 90;

export async function obtenerNavegacion(
  origen: Coordenada,
  destino: Coordenada,
  /** Hacia dónde apunta el auto AHORA, en grados desde el norte. Sin esto,
   *  Mapbox pega la posición del chofer a la calle más cercana sin saber en qué
   *  sentido va: en una avenida dividida puede engancharlo en la calzada de
   *  enfrente y devolver una ruta que arranca dando toda la vuelta. */
  rumbo?: number | null,
): Promise<{ pasos: PasoNavegacion[]; geometria: [number, number][] } | null> {
  const comunes = {
    steps: "true",
    language: "es",
    voice_instructions: "true",
    banner_instructions: "true",
    voice_units: "metric",
  };
  // El ";" final deja el DESTINO sin restricción de rumbo: solo se sabe hacia
  // dónde va el auto en el origen.
  // Mapbox rechaza la consulta entera si el ángulo se sale de 0-360, y ese
  // rechazo se pagaría con una consulta perdida más el reintento. Se normaliza
  // acá: un rumbo raro es un dato a acomodar, no un error que valga un viaje.
  const grados = rumbo == null || Number.isNaN(rumbo) ? null : ((Math.round(rumbo) % 360) + 360) % 360;
  const conRumbo =
    grados == null ? null : { ...comunes, bearings: `${grados},${TOLERANCIA_RUMBO};` };

  let ruta:
    | { geometry?: { coordinates?: [number, number][] }; legs?: { steps?: PasoCrudo[] }[] }
    | undefined;
  try {
    let res = conRumbo ? await fetch(urlDirections([origen, destino], conRumbo)) : null;
    // Si el rumbo dejó a la consulta sin ninguna calzada que cumpla (pasa con
    // un rumbo viejo, o estando dentro de un estacionamiento), se reintenta sin
    // él: mejor una ruta imperfecta que ninguna instrucción en pantalla.
    if (!res || !res.ok) res = await fetch(urlDirections([origen, destino], comunes));
    if (!res.ok) return null;
    ruta = (await res.json()).routes?.[0];
  } catch {
    // Acá sí se traga todo, token incluido: esto corre en bucle mientras el
    // chofer maneja y no puede llenar la pantalla de errores. Si falta el token,
    // el aviso ya salió al armar la ruta (ver obtenerRutaCalles).
    return null;
  }

  const pasos = ruta?.legs?.[0]?.steps;
  if (!Array.isArray(pasos)) return null;

  return {
    pasos: pasos.map((p) => ({
      instruccion: p.maneuver?.instruction ?? "",
      banner: p.bannerInstructions?.[0]?.primary?.text ?? null,
      distanciaM: Math.round(p.distance ?? 0),
      tipo: p.maneuver?.type ?? "continue",
      modificador: p.maneuver?.modifier ?? null,
      geometria: p.geometry?.coordinates ?? [],
      avisos: (p.voiceInstructions ?? [])
        .filter((a) => a.announcement)
        .map((a) => ({ texto: a.announcement!, aMetros: Math.round(a.distanceAlongGeometry ?? 0) }))
        // Del más lejano al más cercano, que es el orden en que se van diciendo.
        .sort((a, b) => b.aMetros - a.aMetros),
    })),
    geometria: ruta?.geometry?.coordinates ?? [],
  };
}
