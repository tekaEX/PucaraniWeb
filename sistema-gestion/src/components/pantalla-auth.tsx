import { Bus } from "lucide-react";

// Marco de las pantallas sin sesión: iniciar sesión, recuperar la contraseña y
// elegir una nueva. Estaba escrito dentro de /login; al aparecer las otras dos
// habría quedado copiado tres veces (el degradado, el bloque de marca, la
// tarjeta y el pie), y cualquier retoque de marca habría que hacerlo tres veces.
export function PantallaAuth({
  titulo,
  children,
  pie,
}: {
  titulo: string;
  children: React.ReactNode;
  /** Texto chico bajo la tarjeta. Por defecto, el aviso de acceso restringido. */
  pie?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-dark p-4">
      <div className="w-full max-w-sm">
        <div className="animate-slide-up mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Bus className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">Transportes Pucarani</h1>
          <p className="text-sm text-white/70">Cotizaciones y facturación</p>
        </div>

        <div className="animate-scale-in rounded-2xl bg-card p-6 shadow-xl [animation-delay:80ms]">
          <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
          {children}
        </div>

        <p className="animate-fade-in mt-4 text-center text-xs text-white/60 [animation-delay:200ms]">
          {pie ?? "Acceso exclusivo para personal autorizado."}
        </p>
      </div>
    </div>
  );
}
