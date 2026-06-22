import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ChoferForm } from "../chofer-form";
import { eliminarChofer } from "../actions";
import { isDemo, demoChoferById } from "@/lib/demo";
import { Trash2 } from "lucide-react";
import type { Chofer } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EditarChoferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let chofer: Chofer | null;
  if (isDemo()) {
    chofer = demoChoferById(id);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("choferes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    chofer = (data as Chofer) ?? null;
  }

  if (!chofer) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={chofer.nombre} description="Editar chofer">
        <form action={eliminarChofer}>
          <input type="hidden" name="id" value={chofer.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </form>
      </PageHeader>
      <ChoferForm chofer={chofer} />
    </div>
  );
}
