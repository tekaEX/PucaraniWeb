import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Estas librerías se ejecutan en el servidor (Node) y no deben empaquetarse.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  // Por defecto el servidor de desarrollo bloquea peticiones a sus recursos
  // (chunks JS, HMR) que no vengan del origen "localhost" — necesario para
  // probar desde el iPhone/PC vía túnel ngrok, cuyo dominio cambia en cada
  // reinicio del túnel (por eso el patrón comodín, no la URL exacta).
  allowedDevOrigins: ["*.ngrok-free.app"],
};

export default nextConfig;
