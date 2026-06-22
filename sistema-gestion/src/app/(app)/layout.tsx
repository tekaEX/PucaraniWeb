import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { isDemo, demoEmpresa } from "@/lib/demo";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isDemo()) {
    return (
      <AppShell userEmail="demostración" empresaNombre={demoEmpresa.nombre} demo>
        {children}
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

  const { data: empresa } = await supabase
    .from("empresa")
    .select("nombre")
    .limit(1)
    .maybeSingle();

  return (
    <AppShell
      userEmail={user.email ?? ""}
      empresaNombre={empresa?.nombre ?? "Transportes Pucarani"}
    >
      {children}
    </AppShell>
  );
}
