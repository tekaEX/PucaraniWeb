// Tipos y etiquetas del estado de suscripción de SimpleAPI.
//
// Viven aparte de simpleapi.ts porque ese módulo es "server-only" (lee la key
// del entorno) y esto lo necesita también la tabla que se dibuja en el
// navegador. Acá no hay ninguna llamada ni ningún secreto: solo la forma del
// dato y cómo se llama en castellano.

/** Una línea del estado de suscripción, tal como la devuelve SimpleAPI. */
export type UsoServicio = {
  servicio: string;
  uso: number;
  maximo: number;
};

/**
 * Los nombres que devuelve la API, traducidos a lo que significan para el
 * negocio. "SimpleAPI" a secas es la emisión de DTE, no un total.
 */
export const SERVICIOS: Record<string, string> = {
  SimpleAPI: "Emisión de documentos (DTE)",
  Folios: "Consulta de folios",
  RCV: "Registro de compras y ventas",
  RUT: "Consulta de RUT",
  Mapas: "Mapas",
  "Boleta Honorarios Persona": "Boletas de honorarios (persona)",
  "Boleta Honorarios Empresa": "Boletas de honorarios (empresa)",
};
