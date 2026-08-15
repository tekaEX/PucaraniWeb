import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Estas librerías se ejecutan en el servidor (Node) y no deben empaquetarse.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
};

export default nextConfig;
