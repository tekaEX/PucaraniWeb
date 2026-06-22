import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ClienteForm } from "../cliente-form";
import { eliminarCliente } from "../actions";
import { Trash2 } from "lucide-react";
import { isDemo, demoClienteById } from "@/lib/demo";
import type { Cliente } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let cliente: Cliente | null;
  if (isDemo()) {
    cliente = demoClienteById(id);
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    cliente = (data as Cliente) ?? null;
  }

  if (!cliente) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={cliente.nombre} description="Editar cliente">
        <form action={eliminarCliente}>
          <input type="hidden" name="id" value={cliente.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        </form>
      </PageHeader>
      <ClienteForm cliente={cliente} />
    </div>
  );
}
