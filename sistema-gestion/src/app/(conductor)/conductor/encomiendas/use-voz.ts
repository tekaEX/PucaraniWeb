"use client";

// Lee en voz alta las indicaciones de manejo. Es la mejora más importante de
// todo el cambio a Mapbox: hasta ahora el chofer tenía que LEER el cartel
// mientras manejaba.
//
// Los textos no los armamos nosotros: vienen escritos en español desde la API
// de Mapbox, con la distancia ya calculada ("En 300 metros, gire a la derecha
// hacia Vicuña Mackenna"). Acá solo se decide CUÁNDO decir cada uno.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PasoNavegacion } from "@/lib/rutas";

const CLAVE_PREFERENCIA = "pucarani-voz-navegacion";

function haySintesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// iOS no deja hablar hasta que el usuario haya tocado la pantalla al menos una
// vez: el primer aviso se descarta en silencio y no hay forma de saber por qué.
// Se "despierta" el sintetizador con un texto vacío en el primer toque, así el
// aviso de verdad ya lo encuentra habilitado.
let despertado = false;

function despertarConPrimerToque() {
  if (despertado || !haySintesis()) return;

  const despertar = () => {
    despertado = true;
    // Un espacio en vez de "" — algunos WebKit ignoran del todo el texto vacío
    // y entonces no se habilita nada.
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
    document.removeEventListener("touchend", despertar);
    document.removeEventListener("click", despertar);
  };

  document.addEventListener("touchend", despertar, { once: true });
  document.addEventListener("click", despertar, { once: true });
}

function hablar(texto: string) {
  if (!haySintesis()) return;
  // Una indicación nueva reemplaza a la anterior: si el chofer llegó al giro
  // mientras todavía sonaba "en 300 metros", lo que importa es lo de ahora.
  window.speechSynthesis.cancel();
  const aviso = new SpeechSynthesisUtterance(texto);
  aviso.lang = "es-CL";
  window.speechSynthesis.speak(aviso);
}

function leerPreferencia(): boolean {
  if (typeof window === "undefined") return true;
  // Por defecto ENCENDIDA: el chofer que no la quiera la apaga una vez y queda.
  return window.localStorage.getItem(CLAVE_PREFERENCIA) !== "off";
}

export type Voz = {
  activa: boolean;
  alternar: () => void;
  /** false si el navegador no puede hablar: la pantalla oculta el botón en vez
   *  de ofrecer algo que no hace nada. */
  disponible: boolean;
};

// Dice el aviso que corresponda según lo que falta para la maniobra. Mapbox
// entrega varios por maniobra (por ejemplo a 2 km, a 300 m y justo al llegar) y
// acá se elige el más cercano de los que ya se alcanzaron, marcando los más
// lejanos como dichos para no decir "en 300 metros" cuando ya faltan 50.
export function useVozNavegacion(
  activo: boolean,
  paso: PasoNavegacion | null,
  metrosAManiobra: number | null,
): Voz {
  const [activa, setActiva] = useState(leerPreferencia);
  const dichosRef = useRef<Set<string>>(new Set());
  const disponible = haySintesis();

  useEffect(() => {
    if (activo && activa) despertarConPrimerToque();
  }, [activo, activa]);

  useEffect(() => {
    if (!activo || !activa || !paso || metrosAManiobra == null) return;

    // avisos viene del más lejano al más cercano (ver obtenerNavegacion).
    const alcanzados = paso.avisos.filter((a) => metrosAManiobra <= a.aMetros);
    if (alcanzados.length === 0) return;

    const aDecir = alcanzados[alcanzados.length - 1];
    // La instrucción entra en la clave para que el mismo texto en una maniobra
    // distinta sí se diga (dos giros seguidos a la derecha en la misma calle).
    const clave = `${paso.instruccion}|${aDecir.texto}`;
    if (dichosRef.current.has(clave)) return;

    for (const a of alcanzados) dichosRef.current.add(`${paso.instruccion}|${a.texto}`);
    hablar(aDecir.texto);
  }, [activo, activa, paso, metrosAManiobra]);

  // Al apagar la voz se corta lo que esté sonando en ese momento; si no, el
  // chofer aprieta el botón y la frase sigue hasta el final.
  const alternar = useCallback(() => {
    setActiva((antes) => {
      const ahora = !antes;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(CLAVE_PREFERENCIA, ahora ? "on" : "off");
        if (!ahora && haySintesis()) window.speechSynthesis.cancel();
      }
      return ahora;
    });
  }, []);

  return { activa, alternar, disponible };
}
