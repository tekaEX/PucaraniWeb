"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

// Cuando el enlace del correo falla, Supabase repite el error DOS veces: en la
// query (?error_code=…) y en el fragmento (#error_code=…). El proxy lee la
// query, pero el fragmento no viaja al servidor: existe un caso en que el error
// llega solo ahí, y entonces esta pantalla se ve como un login cualquiera.
//
// Ese caso es real y es el que se probó: si el enlace se pidió desde un origen
// que no está en las Redirect URLs de Supabase (localhost, o un preview nuevo),
// Supabase descarta el redirect_to y manda al Site URL con el error únicamente
// en el fragmento.
//
// Se monta en /login porque ahí es donde termina quien cae en "/" sin sesión.
export function AvisoEnlaceVencido() {
  const router = useRouter();

  useEffect(() => {
    if (!window.location.hash.includes("error_code=")) return;

    // El fragmento se limpia ANTES de navegar: el navegador lo arrastra a la
    // URL siguiente, y ahí volvería a dispararse este mismo efecto.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    router.replace("/login/olvide-contrasena?expirado=1" as Route);
  }, [router]);

  return null;
}
