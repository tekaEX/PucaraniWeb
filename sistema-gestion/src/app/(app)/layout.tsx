import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { isDemo, demoEmpresa, demoChoferes, demoVehiculos } from "@/lib/demo";
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

  if (isDemo()) {
    return (
      <AppShell
        userEmail="demostración"
        empresaNombre={demoEmpresa.nombre}
        periodoAnio={periodo.anio}
        periodoMes={periodo.mes}
        alertas={construirAlertas(demoChoferes, demoVehiculos)}
        demo
      >
        {children}
        {modal}
      </AppShell>
    );
  }

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
