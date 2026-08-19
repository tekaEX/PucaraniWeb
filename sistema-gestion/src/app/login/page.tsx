import Link from "next/link";
import { LoginForm } from "./login-form";
import { AvisoEnlaceVencido } from "./aviso-enlace";
import { logout } from "./actions";
import { PantallaAuth } from "@/components/pantalla-auth";

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
    <PantallaAuth titulo="Iniciar sesión">
      <AvisoEnlaceVencido />

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

      <div className="mt-4 text-center">
        <Link
          href="/login/olvide-contrasena"
          className="text-sm text-brand hover:underline"
        >
          Olvidé mi contraseña
        </Link>
      </div>
    </PantallaAuth>
  );
}
