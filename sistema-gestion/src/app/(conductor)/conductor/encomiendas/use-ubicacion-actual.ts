"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Las dos fórmulas —distancia y rumbo entre dos puntos— viven en lib/rutas.ts,
// que es donde se usan para el trazado y la navegación. Acá estaban repetidas
// palabra por palabra.
import { distanciaMetros, rumboEntre } from "@/lib/rutas";
import type { Ubicacion } from "./ruta-mapa";

// Bajo este umbral, el "movimiento" entre dos lecturas es puro temblor de la
// señal GPS estando quieto — calcular un rumbo con eso daría una flecha
// girando sola sin sentido.
const DISTANCIA_MINIMA_RUMBO_M = 8;

// Sin ubicación no hay NADA del modo navegación (ni flecha, ni giro del mapa,
// ni instrucciones): antes los errores se descartaban en silencio, así que
// cuando el permiso estaba denegado la pantalla simplemente no hacía nada y
// no había forma de saber por qué. Estos mensajes se muestran en pantalla.
function mensajeError(e: GeolocationPositionError): string {
  if (e.code === e.PERMISSION_DENIED) {
    // Los navegadores tratan un origen no seguro (http://) como permiso
    // denegado, sin distinguirlo — de ahí este chequeo para no dar un
    // mensaje que manda a revisar un permiso que no es el problema.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return "El navegador solo entrega la ubicación en sitios seguros. Abre la app con una dirección https:// (o localhost).";
    }
    return "Permiso de ubicación denegado. Actívalo para este sitio en los ajustes del navegador y vuelve a entrar.";
  }
  if (e.code === e.POSITION_UNAVAILABLE) {
    return "No se pudo determinar tu ubicación (sin señal de GPS).";
  }
  if (e.code === e.TIMEOUT) {
    return "La ubicación tardó demasiado en responder. Toca el botón de centrar para reintentar.";
  }
  return "No se pudo obtener tu ubicación.";
}

export type EstadoUbicacion = {
  ubicacion: Ubicacion | null;
  /** Mensaje listo para mostrar, o null si todo va bien / aún no se sabe. */
  error: string | null;
  /** Pide la posición una vez, a mano (botón "centrar"): dispara el diálogo
   *  de permiso si todavía no se decidió, y deja el error a la vista. */
  pedirAhora: () => void;
};

// Posición GPS del chofer, actualizada sola cuando el navegador detecta un
// cambio de posición relevante (watchPosition, no un intervalo fijo — así no
// gasta batería de más).
//
// También calcula el rumbo (hacia dónde se dirige) para el modo navegación
// del mapa: se usa el que entrega el propio GPS cuando está disponible
// (`coords.heading`, común en Android caminando/manejando) y, si no, se
// estima comparando con la posición anterior — pero solo si se movió lo
// suficiente como para que el cálculo no sea ruido puro estando detenido; en
// ese caso se conserva el último rumbo conocido en vez de perder la
// orientación cada vez que el chofer para en un semáforo.
export function useUbicacionActual(activo: boolean): EstadoUbicacion {
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anteriorRef = useRef<{ lat: number; lng: number } | null>(null);
  const rumboRef = useRef<number | null>(null);

  const aplicar = useCallback((pos: GeolocationPosition) => {
    const actual = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    let heading = pos.coords.heading;

    if (heading == null || Number.isNaN(heading)) {
      if (
        anteriorRef.current &&
        distanciaMetros(anteriorRef.current, actual) >= DISTANCIA_MINIMA_RUMBO_M
      ) {
        heading = rumboEntre(anteriorRef.current, actual);
      } else {
        heading = rumboRef.current;
      }
    }

    rumboRef.current = heading;
    anteriorRef.current = actual;
    setError(null);
    setUbicacion({ ...actual, heading });
  }, []);

  useEffect(() => {
    if (!activo || typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      aplicar,
      (e) => setError(mensajeError(e)),
      { enableHighAccuracy: true, maximumAge: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [activo, aplicar]);

  const pedirAhora = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Este navegador no puede entregar tu ubicación.");
      return;
    }
    navigator.geolocation.getCurrentPosition(aplicar, (e) => setError(mensajeError(e)), {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  }, [aplicar]);

  return { ubicacion, error, pedirAhora };
}
