import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// El aviso de autoguardado: "Guardando…" mientras va, "Guardado" cuando volvió.
//
// Media docena de pantallas se guardan solas al salir de un campo, y cada una
// tenía este bloque copiado —el mismo ícono, el mismo tamaño, el mismo
// condicional de tres ramas— con la redacción cambiada apenas: "Guardado" en
// unas, "Licencia guardada" en otra. Ocho copias de un aviso que tiene que
// decir siempre lo mismo, porque es la única señal de que el trabajo quedó
// grabado: si en una pantalla no aparece, el usuario no sabe si guardó.
//
// `reposo` es lo que se lee antes de tocar nada, y sí cambia entre pantallas
// ("Los cambios se guardan solos" / "Edita directo sobre el documento"): ahí no
// se está informando un estado, se está explicando cómo funciona la pantalla.
//
// aria-live: quien usa lector de pantalla también tiene que enterarse de que se
// guardó — es un cambio que ocurre sin que el foco se mueva.
export function EstadoGuardado({
  pending,
  ok,
  guardando = "Guardando…",
  guardado = "Guardado",
  reposo = "",
  className,
}: {
  pending: boolean;
  ok?: boolean;
  guardando?: string;
  guardado?: string;
  reposo?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-live="polite"
      className={cn("flex h-4 items-center gap-1.5 text-xs text-muted", className)}
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {guardando}
        </>
      ) : ok ? (
        <>
          <Check className="h-3.5 w-3.5 text-ok" aria-hidden />
          {guardado}
        </>
      ) : (
        reposo
      )}
    </span>
  );
}
