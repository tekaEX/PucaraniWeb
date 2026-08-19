import Link from "next/link";
import { PantallaAuth } from "@/components/pantalla-auth";
import { RecuperarForm } from "./recuperar-form";

export const metadata = {
  title: "Recuperar contraseña — Transportes Pucarani",
};

export default async function OlvideContrasenaPage({
  searchParams,
}: {
  searchParams: Promise<{ expirado?: string }>;
}) {
  const { expirado } = await searchParams;

  return (
    <PantallaAuth titulo="Recuperar contraseña">
      {/* Vuelve acá quien abrió un enlace que ya no sirve (se usa una sola vez
          y caduca). Sin este aviso, el enlace muerto lo deja de nuevo en este
          formulario sin explicación y parece que no pasó nada. */}
      {expirado ? (
        <div className="mb-4 rounded-lg border border-warn/20 bg-warn-bg px-3 py-2.5 text-sm text-warn">
          El enlace ya no es válido: se puede usar una sola vez y caduca a la
          hora. Pide uno nuevo acá.
        </div>
      ) : null}

      <RecuperarForm />

      <div className="mt-4 text-center">
        <Link href="/login" className="text-sm text-brand hover:underline">
          Volver a iniciar sesión
        </Link>
      </div>
    </PantallaAuth>
  );
}
