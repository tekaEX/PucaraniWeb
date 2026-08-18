// Doble de "server-only": un módulo vacío.
//
// El paquete real lanza a propósito al ser importado —así es como avisa que un
// módulo de servidor terminó en el bundle del cliente—, y solo se calla cuando
// quien resuelve activa la condición de exportación "react-server". Eso lo hace
// el bundler de Next, no el corredor de pruebas de Node, que importa los .ts
// directamente. Sin este doble, cualquier prueba que toque periodo.ts,
// crypto.ts o cobranza-server.ts revienta antes del primer test.
//
// Cambiarlo acá no debilita nada: la garantía la da el build de Next, que sigue
// viendo el paquete de verdad.
export {};
