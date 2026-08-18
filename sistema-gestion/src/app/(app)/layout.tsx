import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { exigirPanel } from "@/lib/auth";
import { getPeriodo } from "@/lib/periodo-server";
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
  // Puerta del panel: sin sesión → login; con rol chofer → su app (/conductor).
  // Va ANTES de cualquier consulta: al chofer, RLS le negaría igual choferes y
  // vehículos, y no tiene sentido pagar esos viajes para después redirigirlo.
  const sesion = await exigirPanel();

  const periodo = await getPeriodo();
  const supabase = await createClient();

  const [{ data: empresa }, { data: choferes }, { data: vehiculos }] =
    await Promise.all([
      supabase.from("empresa").select("nombre").limit(1).maybeSingle(),
      supabase.from("choferes").select("*"),
      supabase.from("vehiculos").select("*"),
    ]);

  return (
    <AppShell
      userEmail={sesion.email}
      empresaNombre={empresa?.nombre ?? "Transportes Pucarani"}
      periodoAnio={periodo.anio}
      periodoMes={periodo.mes}
      alertas={construirAlertas(
        (choferes ?? []) as Chofer[],
        (vehiculos ?? []) as Vehiculo[],
      )}
    >
      {/* El aviso breve ("Viaje registrado con éxito en Viajes") es la respuesta
          del sistema a una acción puntual, y lo necesita cualquier pantalla, no
          solo Taxis —que era la única que lo montaba, por haber sido la
          primera—. Envuelve a `children` acá: un provider por página obliga a
          acordarse de ponerlo, y olvidarlo no rompe nada visible hasta que
          alguien llama a useToast() y revienta en el navegador. */}
      <ToastProvider>
        {children}
        {modal}
      </ToastProvider>
    </AppShell>
  );
}
