import { LoginForm } from "./login-form";
import { Bus } from "lucide-react";

export const metadata = {
  title: "Iniciar sesión — Transportes Pucarani",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const redirectTo = redirect && redirect.startsWith("/") ? redirect : "/";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-dark p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Bus className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">Transportes Pucarani</h1>
          <p className="text-sm text-white/70">
            Cotizaciones y facturación
          </p>
        </div>

        <div className="rounded-2xl bg-card p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-semibold">Iniciar sesión</h2>
          <LoginForm redirectTo={redirectTo} />
        </div>

        <p className="mt-4 text-center text-xs text-white/60">
          Acceso exclusivo para personal autorizado.
        </p>
      </div>
    </div>
  );
}
