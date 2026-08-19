import Link from "next/link";
import { PantallaAuth } from "@/components/pantalla-auth";
import { createClient } from "@/lib/supabase/server";
import { NuevaContrasenaForm } from "./nueva-contrasena-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Nueva contraseña — Transportes Pucarani",
};

export default async function NuevaContrasenaPage() {
  // A esta pantalla se llega con la sesión que abrió /auth/confirm al canjear
  // el enlace del correo. Sin sesión no hay nada que cambiar: se pide el enlace
  // de nuevo. Se comprueba acá y no en el proxy porque el proxy deja pasar todo
  // /auth sin sesión a propósito (el canje del enlace ocurre justamente ahí).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <PantallaAuth titulo="Nueva contraseña">
        <p className="rounded-lg border border-warn/20 bg-warn-bg px-3 py-2.5 text-sm text-warn">
          Este enlace ya no es válido. Pide uno nuevo y ábrelo en el mismo
          navegador donde lo pediste.
        </p>
        <div className="mt-4 text-center">
          <Link
            href="/login/olvide-contrasena"
            className="text-sm text-brand hover:underline"
          >
            Pedir un enlace nuevo
          </Link>
        </div>
      </PantallaAuth>
    );
  }

  return (
    <PantallaAuth titulo="Nueva contraseña" pie={user.email ?? undefined}>
      <NuevaContrasenaForm />
    </PantallaAuth>
  );
}
