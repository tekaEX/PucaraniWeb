"use client";

import { useEffect } from "react";

// Último recurso: la única frontera que atrapa un error del LAYOUT RAÍZ.
//
// (app)/error.tsx cubre las páginas del panel, pero se renderiza dentro del
// layout — si lo que falla es el layout mismo, esa frontera nunca llega a
// montarse. Ahí entra este archivo.
//
// Por eso trae sus propias etiquetas <html> y <body>: reemplaza al layout raíz
// entero, así que nada de lo que ese layout aporta —fuentes, globals.css, los
// tokens del sistema de diseño— está disponible. De ahí que los estilos vayan
// escritos a mano acá: es la pantalla que tiene que funcionar cuando ya no
// funciona nada más, y no puede depender de nada.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[raíz] error no atrapado:", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#eff1f5",
          color: "#0f1626",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 .5rem" }}>
            El sistema no pudo iniciar
          </h1>
          <p style={{ margin: "0 0 1rem", color: "#5c667a", lineHeight: 1.5 }}>
            No es un problema de una pantalla en particular: falló algo de base. Probá
            recargar; si sigue igual, avisá con el código de abajo.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1.25rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: ".8rem",
                color: "#b3261e",
              }}
            >
              {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              border: 0,
              borderRadius: ".5rem",
              padding: ".625rem 1.25rem",
              background: "#0c3f9b",
              color: "#fff",
              fontSize: ".875rem",
              fontWeight: 600,
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
