import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { isDemo, demoClientes, demoFacturas } from "@/lib/demo";
import { getPeriodo, rangoPeriodo, enRango } from "@/lib/periodo";
import { montoFactura, type Cliente, type IngresoCliente } from "@/types/db";
import { ClienteAccordion } from "./cliente-accordion";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  let clientes: Cliente[];
  let ingresos: IngresoCliente[];

  const periodo = await getPeriodo();
  const { desde, hasta } = rangoPeriodo(periodo);

  if (isDemo()) {
    clientes = demoClientes;
    ingresos = demoFacturas
      .filter((f) => f.estado === "pagada" && enRango(f.fecha_pago, periodo))
      .map((f) => ({
        id: f.id,
        numero: f.numero,
        fecha: f.fecha_pago as string,
        monto: montoFactura(f),
        cliente_id: f.cliente_id,
      }));
  } else {
    const supabase = await createClient();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const [{ data: cData }, { data: fData }] = await Promise.all([
      supabase.from("clientes").select("*").order("nombre", { ascending: true }),
      supabase
        .from("facturas")
        .select("id, numero, fecha_pago, valor_a_pagar, valor_servicio, cliente_id")
        .eq("estado", "pagada")
        .gte("fecha_pago", desde)
        .lte("fecha_pago", hasta),
    ]);
    clientes = (cData ?? []) as Cliente[];
    ingresos = ((fData ?? []) as any[]).map((f) => ({
      id: f.id,
      numero: f.numero,
      fecha: f.fecha_pago,
      monto: Number(f.valor_a_pagar ?? f.valor_servicio),
      cliente_id: f.cliente_id,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Empresas a las que prestas servicio. Haz clic en una para ver y editar."
      >
        <Link href="/clientes/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Link>
      </PageHeader>

      {clientes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Users className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Aún no hay clientes registrados.</p>
          <Link href="/clientes/nuevo" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Agregar el primero
          </Link>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <ClienteAccordion clientes={clientes} ingresos={ingresos} />
          </div>
        </Card>
      )}
    </div>
  );
}
