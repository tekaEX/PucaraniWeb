"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Aviso breve abajo al centro: "Servicio agregado", "Ingresa un monto válido".
//
// Es el patrón de respuesta del sistema anterior, y la gente que lo usa todos
// los días lo tiene incorporado: se carga un servicio, aparece el aviso, y se
// sigue escribiendo el siguiente sin mirar a otro lado. Se replica acá para que
// no haya que reaprender dónde mirar cuando algo salió bien o mal.
//
// Es distinto del indicador de autoguardado (`estado-guardado.tsx`): ese cuenta
// lo que pasa con un formulario que se guarda solo mientras se edita; este
// confirma una acción puntual que ya terminó.

type Tono = "ok" | "error";
type Aviso = { id: number; mensaje: string; tono: Tono };

const ToastContext = createContext<((mensaje: string, tono?: Tono) => void) | null>(null);

/** Muestra un aviso. Devuelve una función estable, segura de usar en efectos. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast necesita <ToastProvider> más arriba en el árbol.");
  return ctx;
}

const DURACION_MS = 2600;

// Cuánto dura la animación de salida. TIENE que coincidir con
// --animate-scale-out en globals.css: si acá fuera menos, el aviso se
// desmontaría a mitad de la animación y desaparecería de golpe, que es
// exactamente lo que esto viene a evitar.
const SALIDA_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  // Estable a propósito, y no una flecha escrita en el map: el temporizador de
  // cada aviso vive en un efecto que depende de esta función. Con una flecha
  // nueva en cada render, mostrar un segundo aviso reiniciaba la cuenta del
  // primero y lo dejaba más tiempo en pantalla del que le tocaba.
  const quitar = useCallback((id: number) => {
    setAvisos((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const mostrar = useCallback((mensaje: string, tono: Tono = "ok") => {
    // El id sale de un contador dentro del setState: dos avisos disparados en
    // el mismo milisegundo no pueden compartir key.
    setAvisos((prev) => [
      ...prev,
      { id: (prev[prev.length - 1]?.id ?? 0) + 1, mensaje, tono },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div
        // aria-live para que un lector de pantalla lo anuncie: el aviso aparece
        // sin que el foco se mueva, así que si no se anuncia, no existe.
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {avisos.map((a) => (
          <ToastItem key={a.id} aviso={a} onCerrar={quitar} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  aviso,
  onCerrar,
}: {
  aviso: Aviso;
  onCerrar: (id: number) => void;
}) {
  // Dos tiempos: primero se marca la salida (que dispara la animación) y recién
  // después se desmonta. Un componente que se va del árbol no puede animarse
  // —React lo saca del DOM y no hay nada que animar—, así que la única forma de
  // que el aviso se despida es dejarlo montado mientras dura la animación.
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    const irse = setTimeout(() => setSaliendo(true), DURACION_MS);
    const quitar = setTimeout(() => onCerrar(aviso.id), DURACION_MS + SALIDA_MS);
    return () => {
      clearTimeout(irse);
      clearTimeout(quitar);
    };
  }, [aviso.id, onCerrar]);

  const error = aviso.tono === "error";
  const Icono = error ? AlertTriangle : CheckCircle2;

  return (
    <div
      className={`pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium shadow-card ${
        saliendo ? "animate-scale-out" : "animate-scale-in"
      } ${error ? "bg-danger text-white" : "bg-[#1d1d1f] text-white"}`}
    >
      <Icono className={`h-4 w-4 shrink-0 ${error ? "" : "text-ok"}`} aria-hidden />
      {aviso.mensaje}
    </div>
  );
}
