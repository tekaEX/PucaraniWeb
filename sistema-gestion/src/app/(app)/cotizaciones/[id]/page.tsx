import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { CotizacionBadge, FacturaBadge } from "@/components/ui/badge";
import { eliminarCotizacion } from "../actions";
import { CotizacionPreview } from "../cotizacion-preview";
import {
  Pencil,
  FileDown,
  Sheet,
  Receipt,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { formatCLP, formatDate } from "@/lib/format";
import {
  isDemo,
  demoCotizacionCompleta,
  demoFacturasPorCotizacion,
  demoEmpresa,
} from "@/lib/demo";
import type {
  Cotizacion,
  CotizacionItem,
  Cliente,
  Factura,
  Empresa,
} from "@/types/db";

export const dynamic = "force-dynamic";

type Row = Cotizacion & {
  cliente: Pick<Cliente, "id" | "nombre" | "codigo"> | null;
  items: CotizacionItem[];
};

export default async function CotizacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let cot: Row | null;
  let facturas: Factura[];
  let empresa: Empresa | null;

  if (isDemo()) {
    cot = demoCotizacionCompleta(id) as Row | null;
    facturas = demoFacturasPorCotizacion(id);
    empresa = demoEmpresa;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("cotizaciones")
      .select("*, cliente:clientes(id,nombre,codigo), items:cotizacion_items(*)")
      .eq("id", id)
      .maybeSingle();
    cot = (data as Row) ?? null;
    const [{ data: facturasData }, { data: emp }] = await Promise.all([
      supabase
        .from("facturas")
        .select("*")
        .eq("cotizacion_id", id)
        .order("fecha", { ascending: false }),
      supabase
        .from("empresa")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    facturas = (facturasData ?? []) as Factura[];
    empresa = (emp as Empresa) ?? null;
  }

  if (!cot) notFound();
  const items = [...(cot.items ?? [])].sort((a, b) => a.orden - b.orden);

  return (
    <div className="max-w-4xl">
      <Link
        href="/cotizaciones"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Cotizaciones
      </Link>

      <PageHeader title={`Cotización N° ${cot.numero}`}>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/cotizaciones/${cot.id}/pdf`}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <FileDown className="h-4 w-4" />
            PDF
          </a>
          <a
            href={`/api/cotizaciones/${cot.id}/excel`}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <Sheet className="h-4 w-4" />
            Excel
          </a>
          <Link
            href={`/cotizaciones/${cot.id}/editar`}
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Info label="Cliente" value={cot.cliente?.nombre ?? "—"} />
          <Info label="Estado">
            <CotizacionBadge estado={cot.estado} />
          </Info>
          <Info label="Fecha" value={formatDate(cot.fecha)} />
          <Info label="Válido hasta" value={formatDate(cot.fecha_validez)} />
          <Info label="Autor" value={cot.autor ?? "—"} />
          <Info label="Servicio" value={cot.titulo ?? "—"} />
        </CardBody>
      </Card>

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-muted">
          Vista previa del presupuesto (así se ve el PDF/Excel)
        </h2>
        <CotizacionPreview empresa={empresa} cot={cot} items={items} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Facturas de esta cotización</CardTitle>
          <Link
            href={`/facturas/nueva?cotizacion=${cot.id}`}
            className={buttonClass({ size: "sm" })}
          >
            <Receipt className="h-4 w-4" />
            Crear factura
          </Link>
        </CardHeader>
        <CardBody>
          {facturas.length === 0 ? (
            <p className="text-sm text-muted">
              Aún no hay facturas asociadas a esta cotización.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {facturas.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2">
                  <Link
                    href={`/facturas/${f.id}`}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {f.numero ? `Factura ${f.numero}` : "Sin número"} ·{" "}
                    {formatDate(f.fecha)}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">
                      {formatCLP(f.valor_a_pagar ?? f.valor_servicio)}
                    </span>
                    <FacturaBadge estado={f.estado} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <form action={eliminarCotizacion}>
        <input type="hidden" name="id" value={cot.id} />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          Eliminar cotización
        </button>
      </form>
    </div>
  );
}

function Info({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm">{children ?? value}</div>
    </div>
  );
}
