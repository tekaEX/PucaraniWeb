import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmpresaForm } from "./empresa-form";
import { CredForm } from "./cred-form";
import { isDemo, demoEmpresa } from "@/lib/demo";
import type { Empresa } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  let data: Empresa | null;
  let siiRut = "";
  let tieneCert = false;

  if (isDemo()) {
    data = demoEmpresa;
    siiRut = demoEmpresa.rut ?? "";
  } else {
    const supabase = await createClient();
    const res = await supabase
      .from("empresa")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    data = (res.data as Empresa) ?? null;
    siiRut = data?.rut ?? "";
    if (data) {
      const { data: cred } = await supabase
        .from("sii_credenciales")
        .select("rut, cert_path")
        .eq("empresa_id", data.id)
        .maybeSingle();
      if (cred) {
        tieneCert = Boolean(cred.cert_path);
        siiRut = cred.rut ?? siiRut;
      }
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Configuración"
        description="Datos del emisor para cotizaciones y credenciales de facturación electrónica (SII)."
      />
      <EmpresaForm empresa={(data as Empresa) ?? undefined} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Facturación electrónica (SII)</CardTitle>
        </CardHeader>
        <CardBody>
          {isDemo() ? (
            <div className="mb-4 rounded-xl border border-warn/30 bg-warn-bg px-4 py-2.5 text-sm text-warn">
              Modo demostración: conecta Supabase para guardar credenciales
              reales.
            </div>
          ) : null}
          <CredForm rut={siiRut} tieneCert={tieneCert} />
          <p className="mt-4 text-xs text-muted">
            El certificado se almacena en un bucket privado y su clave se cifra
            con AES-256-GCM. Solo se desencripta en memoria al firmar ante el
            SII.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
