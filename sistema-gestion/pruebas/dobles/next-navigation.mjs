// Doble de next/navigation. Igual que next/headers: solo existe dentro del
// servidor de Next, y Node no lo puede resolver.
//
// redirect() lanza, como el de verdad: en Next no devuelve, corta la ejecución
// tirando un error especial que el framework atrapa más arriba. Si una prueba
// llega hasta acá, que reviente con un mensaje claro en vez de seguir como si
// la redirección no hubiera pasado.

export function redirect(destino) {
  const e = new Error(`redirect(${destino}) — no debería ejecutarse en una prueba`);
  e.digest = `NEXT_REDIRECT;${destino}`;
  throw e;
}

export function notFound() {
  throw new Error("notFound() — no debería ejecutarse en una prueba");
}
