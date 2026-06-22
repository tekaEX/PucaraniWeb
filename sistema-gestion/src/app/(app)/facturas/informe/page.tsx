import Link from "next/link";
import { getFacturasInforme } from "@/lib/queries";
import { InformePreview } from "../informe-preview";
import { PageHeader } from "@/components/page-header";
import { buttonClass } from "@/components/ui/button";
import { ArrowLeft, FileDown, Sheet } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vista previa del informe" };

export default async function InformePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    cliente?: string;
    mes?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const data = await getFacturasInforme({
    estado: sp.estado,
    cliente: sp.cliente,
    mes: sp.mes,
    q: sp.q,
  });

  const params = new URLSearchParams();
  if (sp.estado) params.set("estado", sp.estado);
  if (sp.cliente) params.set("cliente", sp.cliente);
  if (sp.mes) params.set("mes", sp.mes);
  if (sp.q) params.set("q", sp.q);
  const suffix = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className="max-w-4xl">
      <Link
        href="/facturas"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Facturas
      </Link>

      <PageHeader
        title="Vista previa del informe"
        description="Así se verá el documento que envías. Descárgalo en PDF o Excel."
      >
        <a
          href={`/api/facturas/informe/pdf${suffix}`}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          <FileDown className="h-4 w-4" />
          Descargar PDF
        </a>
        <a
          href={`/api/facturas/informe/excel${suffix}`}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          <Sheet className="h-4 w-4" />
          Descargar Excel
        </a>
      </PageHeader>

      <InformePreview data={data} />
    </div>
  );
}
