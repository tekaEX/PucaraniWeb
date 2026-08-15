import { LoginForm } from "./login-form";
import { logout } from "./actions";
import { Bus } from "lucide-react";

export const metadata = {
  title: "Iniciar sesión — Transportes Pucarani",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sin_acceso?: string }>;
}) {
  const { redirect, sin_acceso } = await searchParams;
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-dark p-4">
      <div className="w-full max-w-sm">
        <div className="animate-slide-up mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Bus className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">Transportes Pucarani</h1>
          <p className="text-sm text-white/70">
            Cotizaciones y facturación
          </p>
        </div>

        <div className="animate-scale-in rounded-2xl bg-card p-6 shadow-xl [animation-delay:80ms]">
          <h2 className="mb-4 text-lg font-semibold">Iniciar sesión</h2>
          {/* Llega acá quien tiene la sesión abierta pero ningún rol de panel:
              las cuentas de chofer que quedaron con la cookie puesta en el
              teléfono desde antes de que encomiendas se fuera a Ares. El botón
              cierra esa sesión; sin él la cookie sigue viva y no hay dónde
              apretar para soltarla. */}
          {sin_acceso ? (
            <div className="mb-4 rounded-lg border border-warn/20 bg-warn-bg px-3 py-2.5 text-sm text-warn">
              <p>Esta cuenta no tiene acceso al sistema.</p>
              <form action={logout}>
                <button type="submit" className="mt-1.5 font-medium underline">
                  Cerrar la sesión
                </button>
              </form>
            </div>
          ) : null}
          <LoginForm redirectTo={redirectTo} />
        </div>

        <p className="animate-fade-in mt-4 text-center text-xs text-white/60 [animation-delay:200ms]">
          Acceso exclusivo para personal autorizado.
        </p>
      </div>
    </div>
  );
}
