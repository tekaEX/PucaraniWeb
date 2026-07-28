import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getPeriodo } from "@/lib/periodo";
import { construirAlertas } from "@/lib/vencimientos";
import type { Chofer, Vehiculo } from "@/types/db";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  // Slot paralelo: rutas interceptadas de creación (ver src/app/(app)/@modal).
  modal: React.ReactNode;
}) {
  const periodo = await getPeriodo();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: empresa }, { data: choferes }, { data: vehiculos }] =
    await Promise.all([
      supabase.from("empresa").select("nombre").limit(1).maybeSingle(),
      supabase.from("choferes").select("*"),
      supabase.from("vehiculos").select("*"),
    ]);

  return (
    <AppShell
      userEmail={user.email ?? ""}
      empresaNombre={empresa?.nombre ?? "Transportes Pucarani"}
      periodoAnio={periodo.anio}
      periodoMes={periodo.mes}
      alertas={construirAlertas(
        (choferes ?? []) as Chofer[],
        (vehiculos ?? []) as Vehiculo[],
      )}
    >
      {children}
      {modal}
    </AppShell>
  );
}
