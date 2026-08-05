"use client";

// El único puente entre el teléfono y el servidor en el módulo del chofer. Todo
// lo demás (pedidos, direcciones, orden de la ruta, trazado) se queda en el
// teléfono y no sale nunca; por acá salen solo los eventos de actividad, que no
// llevan un dato personal: quién, qué día, qué pasó y a qué hora.
//
// Trabajar sin señal no es un caso especial acá, es lo normal: marcar una
// entrega SIEMPRE escribe primero en el teléfono (ver almacen.marcarEntrega) y
// el envío es un intento aparte que puede fallar y reintentarse cuantas veces
// haga falta. Reenviar no puede duplicar el conteo porque el id del evento se
// decidió en el teléfono y la base lo inserta con "no hacer nada si ya existe"
// (ver migración 0026).

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { leerCola, quitarDeCola, type EventoCola } from "./almacen";

// Un tope por consulta para no armar un cuerpo enorme con una conexión mala:
// una jornada completa sin señal son ~60 eventos, así que en la práctica va
// todo junto y esto es solo un techo.
const MAX_POR_ENVIO = 100;

// Reintento periódico. "online" no alcanza: el caso común en la periferia de
// Arica no es quedarse sin red, es tener red que no llega a ningún lado — ahí
// el navegador se sigue creyendo conectado y el evento nunca dispara.
const MS_REINTENTO = 60_000;

function aFila(e: EventoCola) {
  return {
    id: e.id,
    chofer_id: e.choferId,
    fecha: e.fecha,
    tipo: e.tipo,
    hora: e.hora,
  };
}

export type ResultadoEnvio = {
  enviados: number;
  /** Lo que sigue en la cola después de este lote. */
  pendientes: number;
};

/** Manda un lote de la cola. Si el servidor no responde, LANZA y la cola queda
 *  intacta: no se borra nada que no esté confirmado. */
export async function enviarActividadPendiente(): Promise<ResultadoEnvio> {
  const cola = await leerCola();
  if (cola.length === 0) return { enviados: 0, pendientes: 0 };

  const lote = cola.slice(0, MAX_POR_ENVIO);
  const supabase = createClient();

  // ignoreDuplicates hace que PostgREST use "on conflict do nothing": si un
  // evento de este lote ya había llegado en un intento anterior que se cortó
  // antes de poder vaciar la cola, se ignora en silencio en vez de fallar.
  const { error } = await supabase
    .from("encomienda_actividad")
    .upsert(lote.map(aFila), { onConflict: "id", ignoreDuplicates: true });

  if (error) throw new Error(error.message);

  // Recién ahora, con la confirmación del servidor en mano.
  await quitarDeCola(lote.map((e) => e.id));
  return { enviados: lote.length, pendientes: cola.length - lote.length };
}

export type EstadoEnvio = {
  /** Eventos todavía sin confirmar en el servidor. 0 = todo al día. La pantalla
   *  lo muestra: para el chofer es la diferencia entre "mi trabajo está
   *  registrado" y "lo tengo anotado pero nadie más lo sabe". */
  pendientes: number;
  enviando: boolean;
  /** Último fallo. No es una alarma: la cola reintenta sola. */
  error: string | null;
  /** Fuerza un intento ahora. Hay que llamarlo después de cada marcarEntrega /
   *  marcarLlamada para que el evento salga en el momento y no espere al
   *  siguiente reintento. */
  intentar: () => void;
};

// Mantiene la cola vaciándose sola: al montar, cuando vuelve la conexión,
// cuando el chofer regresa a la app y cada minuto mientras quede algo.
export function useEnvioActividad(activo: boolean): EstadoEnvio {
  const [pendientes, setPendientes] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sin este candado, volver a la app con el reintento periódico ya corriendo
  // mandaría el mismo lote dos veces en paralelo.
  const enVueloRef = useRef(false);

  const intentar = useCallback(() => {
    if (enVueloRef.current) return;
    enVueloRef.current = true;
    setEnviando(true);

    void (async () => {
      try {
        // Se vacía por lotes hasta que no quede nada.
        for (;;) {
          const { enviados, pendientes: restantes } = await enviarActividadPendiente();
          setPendientes(restantes);
          setError(null);
          if (enviados === 0 || restantes === 0) break;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar la actividad.");
        // El contador tiene que seguir a la vista aunque el envío falle: es la
        // señal de que hay trabajo hecho que el servidor todavía no registró.
        try {
          setPendientes((await leerCola()).length);
        } catch {
          // Si tampoco se puede leer el teléfono, el error de arriba ya lo dice.
        }
      } finally {
        enVueloRef.current = false;
        setEnviando(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activo) return;
    intentar();

    const alVolver = () => intentar();
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    const reintento = setInterval(alVolver, MS_REINTENTO);

    return () => {
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(reintento);
    };
  }, [activo, intentar]);

  return { pendientes, enviando, error, intentar };
}
