"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useToast } from "@/components/ui/toast";

// Confirma que algo se guardó, después de que la acción redirigió.
//
// El problema que resuelve: al crear un registro, la server action termina en
// redirect() a la lista. El formulario se desmonta con la navegación, así que
// no queda nadie en pantalla que pueda avisar "listo, quedó guardado" — y el
// resultado, desde el lado de quien lo usa, es que la pantalla cambia sola y no
// dice nada. Con suerte se ve la fila nueva; con una lista larga o filtrada por
// periodo, ni eso.
//
// La confirmación viaja en la URL (?guardado=Viaje+creado) porque es lo único
// que sobrevive a un redirect del servidor. Este componente la lee, muestra el
// aviso y limpia la URL: si quedara, recargar la página repetiría el mensaje y
// compartir el enlace se lo mostraría a otra persona.
//
// Va montado una sola vez en el layout, así que sirve para todas las altas sin
// que cada formulario tenga que ocuparse.
export function AvisoGuardado() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const mensaje = params.get("guardado");
  // Sin esto, el re-render que provoca limpiar la URL vuelve a entrar al efecto
  // y muestra el aviso dos veces.
  const mostrado = useRef<string | null>(null);

  useEffect(() => {
    if (!mensaje) {
      // Se vuelve a armar para el próximo guardado: crear dos viajes seguidos
      // manda el MISMO mensaje, y sin este reset el segundo se tomaría por
      // repetido y no se mostraría.
      mostrado.current = null;
      return;
    }
    if (mostrado.current === mensaje) return;
    mostrado.current = mensaje;

    toast(mensaje);

    const resto = new URLSearchParams(params);
    resto.delete("guardado");
    const qs = resto.toString();
    // La URL se arma en tiempo de ejecución, así que typedRoutes no la puede
    // verificar: es la misma ruta en la que ya estamos, sin el parámetro.
    router.replace((qs ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
  }, [mensaje, params, pathname, router, toast]);

  return null;
}
