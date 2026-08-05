// Constante simple, en un archivo SIN "use server": un módulo "use server"
// solo puede exportar funciones async (server actions) — exportar una
// constante desde ahí rompe el empaquetado (Turbopack) para todo el mundo
// que la importe, con un error confuso de "module has no exports".

// Pucarani reparte encomiendas de Starken como subcontratista: el valor real
// de cada envío lo sabe el sistema interno de Starken, no algo que se pueda
// ingresar por pedido. Se estima el ingreso como (entregas × este valor fijo)
// en vez de guardar un dato que nunca se va a tener.
export const VALOR_APROXIMADO_PEDIDO = 950;
