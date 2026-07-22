import { redirect } from "next/navigation";

// Cobranzas se fusionó con Clientes: el estado de cuenta vive en el acordeón
// de cada cliente. Esta ruta queda solo para enlaces antiguos.
export default function CobranzasPage() {
  redirect("/clientes");
}
