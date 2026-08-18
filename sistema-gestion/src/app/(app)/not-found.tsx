import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";

// Cuatro páginas del panel llaman a notFound() cuando el registro no existe:
// cotizaciones/[id], cotizaciones/[id]/editar, facturas/[id] y viajes/[id].
// Hasta ahora no había ningún not-found.tsx, así que esas cuatro caían en el
// 404 crudo de Next: pantalla blanca, tipografía del navegador, fuera del
// panel y sin ninguna forma de volver.
//
// Al vivir dentro del grupo (app), esto se renderiza DENTRO de su layout, así
// que conserva la navegación, el periodo y la campana. El usuario no se queda
// varado: sigue parado adentro del sistema.
//
// Cuándo se ve de verdad: un link viejo a una cotización borrada, un id
// escrito a mano, o el botón "atrás" después de eliminar algo.
export default function NoEncontrado() {
  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="text-muted/45">
          <FileQuestion className="h-8 w-8" />
        </span>
        <p className="text-lg font-semibold">Ese registro ya no está</p>
        <p className="max-w-sm text-sm text-muted">
          Puede que lo hayan eliminado, o que el enlace apunte a un identificador que
          no existe. No es un error del sistema.
        </p>
        <Link href="/" className={buttonClass({ variant: "secondary", className: "mt-2" })}>
          <ArrowLeft className="h-4 w-4" />
          Volver al inicio
        </Link>
      </div>
    </Card>
  );
}
