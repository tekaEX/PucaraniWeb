"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

// Diálogo de confirmación para acciones destructivas, con el estilo del
// sistema (el mismo overlay y la misma tarjeta que Dialogo/Modal). Reemplaza a
// window.confirm(), que en Firefox/Chrome dibuja una ventana del navegador que
// no se parece en nada al resto de la app.
//
// Es controlado: se monta solo cuando hay algo que confirmar. Quien lo usa
// decide qué pasa en onConfirmar y en onCancelar.
export function ConfirmarDialogo({
  titulo = "Confirmar eliminación",
  mensaje,
  textoConfirmar = "Eliminar",
  textoCancelar = "Cancelar",
  pending = false,
  onConfirmar,
  onCancelar,
}: {
  titulo?: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  pending?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  // El foco arranca en "Cancelar": si alguien viene apretando Enter, la opción
  // por defecto no puede ser la destructiva.
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelarRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelar();
    }
    document.addEventListener("keydown", onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, [onCancelar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onCancelar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-md rounded-[18px] bg-white p-5 shadow-card"
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-base font-semibold">{titulo}</h2>
            <p className="mt-1 text-sm text-muted">{mensaje}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelarRef}
            type="button"
            onClick={onCancelar}
            disabled={pending}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={pending}
            className={buttonClass({ variant: "danger", size: "sm" })}
          >
            {pending ? "Eliminando…" : textoConfirmar}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
