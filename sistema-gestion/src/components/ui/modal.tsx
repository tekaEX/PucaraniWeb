"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Ventana modal para rutas interceptadas (crear registros sin salir de la
// lista). Se cierra con Escape, clic en el fondo o la X — todos vuelven a la
// ruta anterior (router.back()), y el redirect() del server action al guardar
// la cierra solo.
export function Modal({
  titulo,
  ancho = "3xl",
  children,
}: {
  titulo: string;
  ancho?: "3xl" | "4xl";
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={() => router.back()}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`animate-scale-in flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[18px] bg-background shadow-card ${
          ancho === "4xl" ? "max-w-4xl" : "max-w-3xl"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-3.5 sm:px-6">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-gray-200/70 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
