import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, Users } from "lucide-react";
import { isDemo, demoClientes } from "@/lib/demo";
import type { Cliente } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  let clientes: Cliente[];
  if (isDemo()) {
    clientes = demoClientes;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .order("nombre", { ascending: true });
    clientes = (data ?? []) as Cliente[];
  }

  return (
    <div>
      <PageHeader title="Clientes" description="Empresas y secciones a las que prestas servicio.">
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">RUT</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {c.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-3 uppercase text-muted">
                      {c.codigo ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">{c.rut ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.contacto_nombre ?? c.contacto_telefono ?? c.contacto_email ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
