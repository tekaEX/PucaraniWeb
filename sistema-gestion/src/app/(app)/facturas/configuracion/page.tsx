import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { ConfiguracionSii } from "./contenido";

// Pantalla completa. Desde Facturas se abre como modal (ver
// @modal/(.)facturas/configuracion); esta ruta es la que queda si alguien entra
// directo por la URL o recarga con el modal abierto.
export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración SII" };

export default async function ConfigSiiPage() {
  return (
    <div className="max-w-2xl">
      <Link
        href="/facturas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Facturas
      </Link>

      <PageHeader
        title="Configuración SII"
        description="Certificado digital y folios autorizados para emitir facturas electrónicas."
      />

      <ConfiguracionSii />

      <div className="mt-6 flex justify-end">
        <Link href="/facturas" className={buttonClass({ variant: "ghost", size: "sm" })}>
          Volver
        </Link>
      </div>
    </div>
  );
}
