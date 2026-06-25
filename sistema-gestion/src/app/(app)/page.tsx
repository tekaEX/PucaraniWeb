import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { FacturaBadge } from "@/components/ui/badge";
import { formatCLP, formatDate } from "@/lib/format";
import {
  FileText,
  Receipt,
  Plus,
  Clock,
  CircleDollarSign,
  CheckCircle2,
  TrendingUp,
  Coins,
  Wallet,
  AlertTriangle,
} from "lucide-react";
import {
  isDemo,
  demoCotizaciones,
  demoFacturas,
  demoChoferes,
  demoVehiculos,
} from "@/lib/demo";
import { construirAlertas } from "@/lib/vencimientos";
import {
  costoTotalFactura,
  type Factura,
  type FacturaConRelaciones,
  type FacturaEstado,
  type Chofer,
  type Vehiculo,
} from "@/types/db";

export const dynamic = "force-dynamic";

function monto(f: Factura) {
  return Number(f.valor_a_pagar ?? f.valor_servicio);
}

function rowTone(estado: FacturaEstado) {
  if (estado === "pagada") return "bg-green-50";
  if (estado === "facturada") return "bg-amber-50";
  return "";
}

export default async function DashboardPage() {
  let cotizaciones: { total: number }[];
  let facturas: Factura[];
  let recientes: FacturaConRelaciones[];
  let choferes: Chofer[];
  let vehiculos: Vehiculo[];

  if (isDemo()) {
    cotizaciones = demoCotizaciones.map((c) => ({ total: c.total }));
    facturas = demoFacturas;
    recientes = demoFacturas.slice(0, 8);
    choferes = demoChoferes;
    vehiculos = demoVehiculos;
  } else {
    const supabase = await createClient();
    const [
      { data: cotData },
      { data: factData },
      { data: recientesData },
      { data: choData },
      { data: vehData },
    ] = await Promise.all([
      supabase.from("cotizaciones").select("total"),
      supabase.from("facturas").select("*"),
      supabase
        .from("facturas")
        .select("*, cliente:clientes(id,nombre,codigo), cotizacion:cotizaciones(id,numero)")
        .order("fecha", { ascending: false })
        .limit(8),
      supabase.from("choferes").select("*"),
      supabase.from("vehiculos").select("*"),
    ]);
    cotizaciones = cotData ?? [];
    facturas = (factData ?? []) as Factura[];
    recientes = (recientesData ?? []) as FacturaConRelaciones[];
    choferes = (choData ?? []) as Chofer[];
    vehiculos = (vehData ?? []) as Vehiculo[];
  }

  const totalCotizado = cotizaciones.reduce((a, c) => a + Number(c.total), 0);
  const pendienteFacturar = facturas
    .filter((f) => f.estado === "en_proceso" || f.estado === "por_facturar")
    .reduce((a, f) => a + monto(f), 0);
  const porCobrar = facturas
    .filter((f) => f.estado === "facturada")
    .reduce((a, f) => a + monto(f), 0);
  const pagado = facturas
    .filter((f) => f.estado === "pagada")
    .reduce((a, f) => a + monto(f), 0);

  // Rentabilidad (sobre servicios ya facturados o pagados)
  const facturados = facturas.filter(
    (f) => f.estado === "facturada" || f.estado === "pagada",
  );
  const ingresos = facturados.reduce((a, f) => a + monto(f), 0);
  const costos = facturados.reduce((a, f) => a + costoTotalFactura(f), 0);
  const utilidad = ingresos - costos;

  const alertas = construirAlertas(choferes, vehiculos);

  const kpis = [
    {
      label: "Cotizaciones",
      value: formatCLP(totalCotizado),
      sub: `${cotizaciones.length} emitidas`,
      icon: FileText,
      tone: "text-brand",
    },
    {
      label: "Pendiente de facturar",
      value: formatCLP(pendienteFacturar),
      sub: "En proceso / por facturar",
      icon: Clock,
      tone: "text-gray-600",
    },
    {
      label: "Por cobrar",
      value: formatCLP(porCobrar),
      sub: "Facturado, por pagar",
      icon: CircleDollarSign,
      tone: "text-amber-600",
    },
    {
      label: "Pagado",
      value: formatCLP(pagado),
      sub: "Cobrado",
      icon: CheckCircle2,
      tone: "text-green-600",
    },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Resumen de cotizaciones y facturación.">
        <Link href="/cotizaciones/nueva" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Cotización
        </Link>
        <Link
          href="/facturas/nueva"
          className={buttonClass({ variant: "secondary" })}
        >
          <Plus className="h-4 w-4" />
          Factura
        </Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted">{k.label}</span>
                  <Icon className={`h-5 w-5 ${k.tone}`} />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  {k.value}
                </div>
                <div className="mt-1 text-xs text-muted">{k.sub}</div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Ingresos (facturados)</span>
              <TrendingUp className="h-5 w-5 text-brand" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatCLP(ingresos)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Costos</span>
              <Coins className="h-5 w-5 text-gray-600" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {formatCLP(costos)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Utilidad</span>
              <Wallet className="h-5 w-5 text-green-600" />
            </div>
            <div
              className={`mt-2 text-2xl font-semibold tabular-nums ${
                utilidad < 0 ? "text-red-600" : "text-green-700"
              }`}
            >
              {formatCLP(utilidad)}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Alertas de documentos</CardTitle>
          <Link href="/vehiculos" className="text-sm font-medium text-brand hover:underline">
            Ver flota
          </Link>
        </CardHeader>
        <CardBody>
          {alertas.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Toda la documentación está al día.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alertas.map((a, i) => (
                <li
                  key={`${a.refId}-${a.documento}-${i}`}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle
                      className={`h-4 w-4 ${a.estado === "vencido" ? "text-red-600" : "text-amber-600"}`}
                    />
                    <span className="font-medium">{a.nombre}</span>
                    <span className="text-muted">· {a.documento}</span>
                  </div>
                  <span
                    className={`text-xs font-medium ${a.estado === "vencido" ? "text-red-600" : "text-amber-600"}`}
                  >
                    {a.estado === "vencido"
                      ? `Vencido hace ${Math.abs(a.dias)} día(s)`
                      : `Vence en ${a.dias} día(s)`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle>Últimos servicios</CardTitle>
          <Link
            href="/facturas"
            className="text-sm font-medium text-brand hover:underline"
          >
            Ver todo
          </Link>
        </CardHeader>
        {recientes.length === 0 ? (
          <CardBody>
            <p className="flex flex-col items-center gap-3 py-8 text-center text-sm text-muted">
              <Receipt className="h-7 w-7" />
              Aún no hay facturas registradas.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recientes.map((f) => (
                  <tr key={f.id} className={`${rowTone(f.estado)} hover:bg-gray-100/60`}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      <Link href={`/facturas/${f.id}`} className="hover:underline">
                        {formatDate(f.fecha)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 max-w-xs truncate">
                      {f.descripcion ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {f.cliente?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatCLP(monto(f))}
                    </td>
                    <td className="px-4 py-2.5">
                      <FacturaBadge estado={f.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
