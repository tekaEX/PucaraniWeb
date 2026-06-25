import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { isDemo } from "@/lib/demo";
import { CredForm } from "./cred-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración SII" };

export default async function ConfigSiiPage() {
  let rut = "";
  let tieneCert = false;

  if (!isDemo()) {
    const supabase = await createClient();
    const { data: empresa } = await supabase
      .from("empresa")
      .select("id, rut")
      .order("created_at")
      .limit(1)
      .single();
    if (empresa) {
      rut = empresa.rut ?? "";
      const { data: cred } = await supabase
        .from("sii_credenciales")
        .select("rut, cert_path")
        .eq("empresa_id", empresa.id)
        .maybeSingle();
      if (cred) {
        tieneCert = Boolean(cred.cert_path);
        rut = cred.rut ?? rut;
      }
    }
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/vehiculos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a Vehículos
      </Link>

      <PageHeader
        title="Configuración SII"
        description="Certificado digital y RUT para consultar el Registro de Compras del SII."
      />

      {isDemo() ? (
        <div className="mb-4 rounded-xl border border-warn/30 bg-warn-bg px-4 py-2.5 text-sm text-warn">
          Modo demostración: conecta Supabase para guardar credenciales reales.
        </div>
      ) : null}

      <Card>
        <CardBody>
          <CredForm rut={rut} tieneCert={tieneCert} />
        </CardBody>
      </Card>

      <p className="mt-4 text-xs text-muted">
        El certificado se almacena en un bucket privado y su clave se cifra con
        AES-256-GCM. Solo se desencripta en memoria al consultar el SII.
      </p>

      {/* Botón auxiliar por si se quiere volver desde el pie */}
      <div className="mt-6">
        <Link href="/vehiculos" className={buttonClass({ variant: "ghost", size: "sm" })}>
          Volver
        </Link>
      </div>
    </div>
  );
}
