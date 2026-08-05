"use client";

import { useEffect, useRef, useState } from "react";
import {
  distanciaMetros,
  metrosRestantes,
  obtenerNavegacion,
  type PasoNavegacion,
} from "@/lib/rutas";
import type { Coordenada } from "@/lib/geocoding";

// Volver a pedir el tramo recién cuando el chofer se alejó esto de donde se
// pidió el anterior — no en cada tick de GPS (watchPosition dispara seguido).
// Con la API de Mapbox esto además es cuota: a 150 m, una jornada de 60 km son
// unas 400 consultas por chofer.
//
// Que el intervalo sea largo NO empeora lo que ve el chofer: la distancia a la
// maniobra se recalcula en el teléfono con cada lectura de GPS (ver abajo), así
// que el cartel y la voz van finos igual.
const DISTANCIA_MINIMA_REFRESCO_M = 150;

// Tras una consulta que no trajo camino (sin señal, o Mapbox no respondió) se
// espera esto antes de volver a intentar. Sin la espera, el reintento saldría
// con la siguiente lectura de GPS —una o dos por segundo— y un tramo sin
// cobertura se comería la cuota del mes en un rato.
const MS_ESPERA_REINTENTO = 5_000;

function mismoPunto(a: Coordenada | null | undefined, b: Coordenada | null | undefined): boolean {
  return a != null && b != null && a.lat === b.lat && a.lng === b.lng;
}

export type Navegacion = {
  /** Próxima maniobra, con su texto ya en español, o null si no hay dato. */
  paso: PasoNavegacion | null;
  /** Metros hasta la maniobra, recalculados con CADA lectura de GPS siguiendo
   *  el trazado (no en línea recta). Es lo que se muestra y lo que dispara los
   *  avisos de voz: la distancia que devolvió la API queda vieja apenas el
   *  chofer avanza tres cuadras. */
  metrosAManiobra: number | null;
  /** Trazado por calles desde la posición actual hasta la parada activa,
   *  [lng, lat] por punto — esto es lo que se dibuja como "por dónde ir". */
  geometria: [number, number][] | null;
};

/** El tramo guarda A QUÉ DESTINO corresponde: al cerrar una parada el destino
 *  cambia, y sin la marca el cartel y la línea azul seguirían mostrando el
 *  camino a la casa donde el chofer ya entregó hasta que llegara el tramo
 *  nuevo. Mejor sin indicación que con la indicación de la parada anterior. */
type Tramo = { destino: Coordenada; pasos: PasoNavegacion[]; geometria: [number, number][] };

const VACIA: Navegacion = { paso: null, metrosAManiobra: null, geometria: null };

// Cómo llegar desde "origen" (ubicación GPS actual) hasta "destino" (la parada
// activa). El tramo se re-pide cuando cambia el destino o cuando el chofer
// avanzó lo suficiente; la distancia a la maniobra, en cambio, se recalcula en
// cada render.
export function useNavegacion(
  activo: boolean,
  /** La posición del chofer trae además el rumbo, que se le pasa a Mapbox para
   *  que enganche el arranque de la ruta en la calzada correcta. */
  origen: (Coordenada & { heading?: number | null }) | null,
  destino: Coordenada | null,
): Navegacion {
  const [tramo, setTramo] = useState<Tramo | null>(null);
  // Se incrementa para forzar un reintento cuando no hay nada más que lo
  // dispare (ver el temporizador de más abajo).
  const [reintento, setReintento] = useState(0);

  // Última consulta que TERMINÓ BIEN. La decisión de volver a pedir se toma
  // contra esto y no contra "lo último que se intentó", y esa es la corrección
  // que hace que la navegación avance de parada:
  //
  // Antes se anotaba el intento ANTES de tener la respuesta y el efecto se
  // limpiaba (cancelando la consulta en vuelo) en cada cambio de "origen", o
  // sea una o dos veces por segundo. Al marcar un pedido como finalizado, la
  // consulta del camino a la parada siguiente salía y la mataba el siguiente
  // tick del GPS; el guardia, en cambio, ya creía tenerla, así que no se pedía
  // otra hasta que el chofer se alejara 150 m. Quieto en la vereda —justo el
  // caso de cerrar un pedido sin haber ido a la dirección— esos 150 m no
  // llegaban nunca y la navegación se quedaba clavada en la parada anterior.
  const cumplidaRef = useRef<{
    origen: Coordenada;
    destino: Coordenada;
    conRumbo: boolean;
  } | null>(null);
  // Consulta en vuelo: el id sirve para descartar respuestas que quedaron
  // viejas, y el destino para no pedir dos veces el mismo camino.
  const enVueloRef = useRef<{ id: number; destino: Coordenada } | null>(null);
  const ultimoIdRef = useRef(0);
  // Espera tras un fallo, atada al destino que falló: un destino nuevo se
  // intenta de inmediato (el chofer no tiene indicación de nada).
  const esperaRef = useRef<{ destino: Coordenada; hasta: number } | null>(null);
  const reintentoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (reintentoRef.current) clearTimeout(reintentoRef.current);
    },
    [],
  );

  const habilitado = activo && origen != null && destino != null;
  // Al dejar de estar habilitado (sin parada activa, o modo solo-lectura) se
  // limpia lo que se estaba mostrando — ajustado durante el render, no en un
  // efecto, siguiendo el mismo patrón que ruta-conductor.tsx.
  const [habilitadoAnterior, setHabilitadoAnterior] = useState(false);
  if (habilitado !== habilitadoAnterior) {
    setHabilitadoAnterior(habilitado);
    if (!habilitado) setTramo(null);
  }

  useEffect(() => {
    if (!habilitado || !origen || !destino) {
      cumplidaRef.current = null;
      enVueloRef.current = null;
      esperaRef.current = null;
      // Lo que venga en camino es de otra parada (o de antes de apagarse).
      ultimoIdRef.current++;
      return;
    }

    const rumbo = origen.heading ?? null;
    const cumplida = cumplidaRef.current;

    const destinoCambio = !mismoPunto(cumplida?.destino, destino);
    const seAlejoLoSuficiente =
      !cumplida || distanciaMetros(cumplida.origen, origen) >= DISTANCIA_MINIMA_REFRESCO_M;

    // Arrancando el viaje el chofer está DETENIDO, y detenido el GPS no entrega
    // rumbo: la primera consulta —justo la de salir a la calle— sale a ciegas y
    // Mapbox engancha la posición a la calzada que le quede más cerca. En una
    // avenida dividida, con las dos calzadas a doce metros y el margen de error
    // del GPS parado adentro de un condominio, eso es cara o sello; si sale
    // cruz, la ruta arranca dando toda la vuelta a la manzana.
    //
    // Esperar los 150 m del refresco normal no sirve: para entonces el chofer ya
    // se comprometió con la instrucción equivocada. Así que en cuanto aparece el
    // rumbo —a los primeros metros de andar— se vuelve a pedir el tramo. Es una
    // consulta de más por parada, como mucho.
    const aparecioElRumbo = cumplida != null && !cumplida.conRumbo && rumbo != null;

    if (!destinoCambio && !seAlejoLoSuficiente && !aparecioElRumbo) return;

    // Ya se está pidiendo el camino a ESTE mismo destino: no se duplica la
    // consulta y —sobre todo— no se cancela la que viene en camino.
    if (mismoPunto(enVueloRef.current?.destino, destino)) return;

    const espera = esperaRef.current;
    if (espera && mismoPunto(espera.destino, destino) && Date.now() < espera.hasta) return;

    const id = ++ultimoIdRef.current;
    enVueloRef.current = { id, destino };

    void obtenerNavegacion(origen, destino, rumbo).then((res) => {
      // Otra consulta más nueva ya la reemplazó (cambió la parada, o el hook se
      // apagó): esta respuesta es de un camino que ya no se va a recorrer.
      if (id !== ultimoIdRef.current) return;
      enVueloRef.current = null;

      if (!res || res.pasos.length === 0) {
        esperaRef.current = { destino, hasta: Date.now() + MS_ESPERA_REINTENTO };
        // Estando quieto el GPS puede dejar de avisar, y sin aviso no hay
        // re-render que reintente. El margen extra evita que el reintento
        // llegue un milisegundo antes de que venza la espera y se descarte.
        // Uno solo a la vez: si el anterior no alcanzó a disparar, se reemplaza.
        if (reintentoRef.current) clearTimeout(reintentoRef.current);
        reintentoRef.current = setTimeout(
          () => setReintento((n) => n + 1),
          MS_ESPERA_REINTENTO + 250,
        );
        return;
      }

      cumplidaRef.current = { origen, destino, conRumbo: rumbo != null };
      setTramo({ destino, pasos: res.pasos, geometria: res.geometria });
    });
  }, [habilitado, origen, destino, reintento]);

  // El tramo de la parada anterior no se muestra ni un instante.
  if (!habilitado || !tramo || !mismoPunto(tramo.destino, destino)) return VACIA;

  // El primer paso es la maniobra que viene. Mapbox a veces abre con un paso de
  // distancia 0 (ya estás justo ahí), que no hay nada que anunciar.
  const paso = tramo.pasos.find((p) => p.distanciaM > 0) ?? tramo.pasos[0] ?? null;

  return {
    paso,
    metrosAManiobra:
      origen && paso && paso.geometria.length > 0
        ? metrosRestantes(origen, paso.geometria)
        : (paso?.distanciaM ?? null),
    geometria: tramo.geometria.length > 0 ? tramo.geometria : null,
  };
}
