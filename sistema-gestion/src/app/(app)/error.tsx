"use client";

import { useEffect } from "react";
import { TriangleAlert, RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Frontera de error de TODO el panel: cubre las 15 rutas de una sola vez, igual
// que loading.tsx cubre sus esqueletos.
//
// Sin este archivo, cualquier excepción no atrapada dentro de una página
// terminaba en la pantalla por defecto de Next, que en producción es un
// "Application error: a client-side exception has occurred" sobre fondo blanco:
// sin marca, sin navegación y sin decir qué pasó. Para alguien que está
// facturando, eso es indistinguible de que el sistema se cayó entero.
//
// La regla la fijó ui/error-datos.tsx y acá se mantiene: si algo falló, se dice
// que falló y se muestra el mensaje técnico. "Algo salió mal" obliga a abrir la
// consola del servidor para saber si es una columna que falta, un permiso o la
// red.
//
// error.tsx SIEMPRE es un componente de cliente: React necesita montar la
// frontera en el navegador para poder reintentar con reset().
export default function ErrorDelPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En producción el mensaje llega recortado al navegador; el `digest` es la
    // única forma de cruzarlo con la traza completa en los logs del servidor.
    console.error("[panel] error no atrapado:", error.digest ?? "", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl border border-danger/20 bg-danger-bg">
      <div className="flex items-start gap-3 px-6 py-6">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="font-semibold text-danger">Esta pantalla no se pudo cargar</p>
          <p className="mt-1 text-sm text-danger/90">
            El resto del sistema sigue andando: podés cambiar de sección desde el menú.
            Lo que <strong>no</strong> conviene es dar por buenos los números de esta
            pantalla hasta que vuelva a cargar bien.
          </p>

          {error.message ? (
            <p className="mt-3 break-words rounded-lg bg-white/60 px-3 py-2 font-mono text-xs text-danger">
              {error.message}
            </p>
          ) : null}

          {error.digest ? (
            <p className="mt-2 text-xs text-danger/70">
              Código para buscar en los registros del servidor:{" "}
              <span className="font-mono">{error.digest}</span>
            </p>
          ) : null}

          <Button variant="secondary" className="mt-4" onClick={() => reset()}>
            <RotateCw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      </div>
    </Card>
  );
}
