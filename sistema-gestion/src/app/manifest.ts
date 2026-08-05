import type { MetadataRoute } from "next";

// Next.js solo permite un manifest por app (debe vivir en la raíz de app/),
// pero el Web App Manifest soporta "scope"/"start_url" para restringir dónde
// aplica: acá se limita a /conductor, el hub del chofer con sus herramientas
// asignadas (hoy: encomiendas) — la única parte de este sistema pensada para
// "agregar a inicio" desde el teléfono. Cualquier herramienta nueva del
// chofer debe vivir bajo /conductor/* para quedar dentro de este scope.
//
// El ícono usa public/logo.png tal cual (982×1200, con texto y márgenes
// blancos) — funciona, pero para un ícono de pantalla de inicio prolijo
// conviene reemplazarlo por un cuadrado (ideal 512×512) con solo el
// isotipo "TP", sin texto ni márgenes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Conductor — Transportes Pucarani",
    short_name: "Conductor",
    description: "Herramientas de trabajo del conductor",
    start_url: "/conductor",
    scope: "/conductor",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1d3a8f",
    icons: [
      {
        src: "/logo.png",
        sizes: "982x1200",
        type: "image/png",
      },
    ],
  };
}
