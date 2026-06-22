import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Badge, VencimientoBadge } from "@/components/ui/badge";
import { Plus, UserRound } from "lucide-react";
import { isDemo, demoChoferes } from "@/lib/demo";
import type { Chofer } from "@/types/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choferes" };

export default async function ChoferesPage() {
  let choferes: Chofer[];
  if (isDemo()) {
    choferes = demoChoferes;
  } else {
    const supabase = await createClient();
    const { data } = await supabase.from("choferes").select("*").order("nombre");
    choferes = (data ?? []) as Chofer[];
  }

  return (
    <div>
      <PageHeader title="Choferes" description="Conductores y vencimiento de su licencia.">
        <Link href="/choferes/nuevo" className={buttonClass()}>
          <Plus className="h-4 w-4" />
          Nuevo chofer
        </Link>
      </PageHeader>

      {choferes.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <UserRound className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">Aún no hay choferes registrados.</p>
          <Link href="/choferes/nuevo" className={buttonClass({ size: "sm" })}>
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
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Licencia</th>
                  <th className="px-4 py-3 font-medium">Vencimiento</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {choferes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/choferes/${c.id}`} className="font-medium text-brand hover:underline">
                        {c.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{c.telefono ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.licencia_clase ? `${c.licencia_clase} ` : ""}
                      {c.licencia_numero ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <VencimientoBadge fecha={c.licencia_vencimiento} />
                    </td>
                    <td className="px-4 py-3">
                      {c.activo ? (
                        <Badge tone="green">Activo</Badge>
                      ) : (
                        <Badge tone="gray">Inactivo</Badge>
                      )}
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
