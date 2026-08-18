import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Estas librerías se ejecutan en el servidor (Node) y no deben empaquetarse.
  // exceljs lo necesita de verdad; @react-pdf/renderer ya está en la lista que
  // Next externaliza solo, pero se deja explícito para no depender de que siga
  // estándo ahí en la próxima versión.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],

  // Tipa los href de <Link> y router.push contra las rutas que existen de
  // verdad: una ruta mal escrita pasa a ser error de compilación, no un 404 que
  // aparece en producción. Alineado con la Constitución §III (chequeos
  // estáticos como gate obligatorio).
  typedRoutes: true,
};

export default nextConfig;
