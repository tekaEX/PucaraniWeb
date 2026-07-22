import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { isDemo, demoClientes, demoFacturas, demoViajes } from "@/lib/demo";
import { getPeriodo, etiquetaPeriodo } from "@/lib/periodo";
import { viajePorFacturar, type Cliente, type FacturaConRelaciones } from "@/types/db";
import { cuentaVacia, type CuentaCliente, type ViajePendRaw } from "@/lib/cobranza";
import { construirCuentas } from "@/lib/cobranza-server";
import { ClienteAccordion } from "./cliente-accordion";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const periodo = await getPeriodo();

  let clientes: Cliente[];
  let facturas: FacturaConRelaciones[];
  let viajesPend: ViajePendRaw[];

  if (isDemo()) {
    clientes = demoClientes;
    facturas = demoFacturas;
    viajesPend = demoViajes
      .filter((v) => viajePorFacturar(v))
      .map((v) => ({
        id: v.id,
        fecha_inicio: v.fecha_inicio,
        descripcion: v.descripcion,
        valor: Number(v.valor),
        cliente_id: v.cliente_id,
        cliente: v.cliente ? { id: v.cliente.id, nombre: v.cliente.nombre } : null,
      }));
  } else {
    const supabase = await createClient();
    const [{ data: cData }, { data: fData }, { data: vData }] = await Promise.all([
      supabase.from("clientes").select("*").order("nombre", { ascending: true }),
      supabase
        .from("facturas")
        .select("*, cliente:clientes(id,nombre,codigo), viajes:viajes(id,descripcion,fecha_inicio,valor)")
        .order("fecha_emision", { ascending: false, nullsFirst: true }),
      supabase
        .from("viajes")
        .select("id, fecha_inicio, descripcion, valor, cliente_id, cliente:clientes(id,nombre)")
        .eq("estado", "realizado")
        .is("factura_id", null)
        .order("fecha_inicio", { ascending: false }),
    ]);
    clientes = (cData ?? []) as Cliente[];
    facturas = (fData ?? []) as FacturaConRelaciones[];
    viajesPend = (vData ?? []) as unknown as ViajePendRaw[];
  }

  // Estado de cuenta por cliente. Se completa para todos (los sin actividad
  // quedan en cero) y se pasa como objeto plano (serializable al cliente).
  const cuentasMap = construirCuentas(facturas, viajesPend, periodo);
  const cuentas: Record<string, CuentaCliente> = {};
  for (const c of clientes) {
    cuentas[c.id] = cuentasMap.get(c.id) ?? cuentaVacia(c.id, c.nombre);
  }

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`Empresas a las que prestas servicio · estado de cuenta de ${etiquetaPeriodo(periodo).toLowerCase()}. Haz clic en una para ver y editar.`}
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
            <ClienteAccordion clientes={clientes} cuentas={cuentas} />
          </div>
        </Card>
      )}
    </div>
  );
}
