import { redirect } from "next/navigation";

// El Resumen de Finanzas se fusionó con el Dashboard (sus secciones viven en
// ./secciones.tsx). Esta ruta queda solo para enlaces antiguos.
export default function FinanzasPage() {
  redirect("/");
}
