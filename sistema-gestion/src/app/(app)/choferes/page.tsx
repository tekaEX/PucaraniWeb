import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Plus, UserRound } from "lucide-react";
import type { Chofer } from "@/types/db";
import { ChoferAccordion } from "./chofer-accordion";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choferes" };

export default async function ChoferesPage() {
  const supabase = await createClient();
  const [{ data }, { data: catData }] = await Promise.all([
    supabase.from("choferes").select("*").order("nombre"),
    supabase.from("chofer_categorias").select("chofer_id, categoria"),
  ]);
  const choferes = (data ?? []) as Chofer[];

  // Objeto plano (no Map): los props de un Server a un Client Component
  // deben ser serializables.
  const categoriasPorChofer: Record<string, string[]> = {};
  for (const c of catData ?? []) {
    (categoriasPorChofer[c.chofer_id] ??= []).push(c.categoria);
  }

  return (
    <div>
      <PageHeader
        title="Choferes"
        description="Conductores, su licencia y datos. Haz clic en uno para ver y editar."
      >
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
            <ChoferAccordion choferes={choferes} categoriasPorChofer={categoriasPorChofer} />
          </div>
        </Card>
      )}
    </div>
  );
}
