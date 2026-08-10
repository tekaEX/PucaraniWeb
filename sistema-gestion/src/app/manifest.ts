import type { MetadataRoute } from "next";

// Next.js solo permite un manifest por app (debe vivir en la raíz de app/),
// pero el Web App Manifest soporta "scope"/"start_url" para restringir dónde
// aplica: acá se limita a /conductor, el hub del chofer con sus herramientas
// asignadas (hoy: encomiendas) — la única parte de este sistema pensada para
// "agregar a inicio" desde el teléfono. Cualquier herramienta nueva del
// chofer debe vivir bajo /conductor/* para quedar dentro de este scope.
//
// Los íconos son cuadrados con solo el isotipo "TP" sobre azul de marca; se
// generan desde public/logo.png con `node scripts/generar-iconos.mjs` (correrlo
// de nuevo si cambia el logo). El "maskable" trae la marca más chica porque
// Android recorta el ícono a un círculo del 80% del lado.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Conductor — Transportes Pucarani",
    short_name: "Conductor",
    description: "Herramientas de trabajo del conductor",
    start_url: "/conductor",
    scope: "/conductor",
    display: "standalone",
    background_color: "#0c3f9b",
    theme_color: "#0c3f9b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
