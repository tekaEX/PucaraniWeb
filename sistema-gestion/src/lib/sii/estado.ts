// Cómo se lee lo que contestó el SII.
//
// `facturas.estado_sii` guarda dos cosas distintas en la misma columna: los
// códigos que devuelve el SII a través de SimpleAPI, y dos valores propios que
// escribe la emisión cuando el documento ni siquiera llegó a salir. Este módulo
// traduce ambos a un puñado de estados que la app sabe mostrar.
//
// Vive aparte de simpleapi.ts porque ese módulo es "server-only" (lee la key
// del entorno) y esto lo necesita también la pastilla que se dibuja en el
// navegador. Acá no hay ninguna llamada ni ningún secreto.
//
// ⚠️ LA TABLA DE CÓDIGOS DEL SII NO ESTÁ VERIFICADA. Para verificarla hace
//    falta el certificado digital, que es lo único que le falta al proyecto.
//    Está escrita desde la documentación del SII y hay que confirmarla durante
//    la certificación — casos SII-01…07 de specs/…/plan-pruebas-dte.md.
//
//    Por eso la clasificación es deliberadamente cobarde y falla siempre para
//    el mismo lado: ante un código que no reconoce devuelve "sin_clasificar" y
//    la app muestra la glosa cruda del SII. NUNCA inventa un "aceptado".
//    Decirle a alguien que su factura está aceptada cuando no lo está es el
//    único error de esta pantalla que no se corrige mirándola: se va a cobrar
//    un documento que ante el SII no existe.

/** Los dos mundos del SII. Nunca comparten certificado, folios ni resolución. */
export type Ambiente = "certificacion" | "produccion";

/**
 * Lo que hay que escribir a mano para pasar a producción.
 *
 * Vive acá y no junto a la acción porque un archivo `"use server"` **solo puede
 * exportar funciones async** — exportar una constante desde ahí rompe el build,
 * y el error apunta al componente cliente que la importa, no a la causa.
 */
export const PALABRA_PRODUCCION = "PRODUCCION";

/** Lo que hace falta para que el botón de emitir sirva de algo. */
export type ConfigSii = {
  ambiente: Ambiente;
  /** false si falta el certificado, el CAF o la resolución del SII. */
  listo: boolean;
  motivo?: string;
};

/**
 * Estado de UNO de los componentes que hacen falta para emitir.
 *
 * `detalle` es texto para mostrarle a quien configura. Nunca lleva secretos:
 * de la key de SimpleAPI se informa si está puesta, jamás su valor.
 */
export type EstadoComponenteSii = {
  clave: "key" | "rut_empresa" | "actividad" | "certificado" | "titular" | "resolucion" | "folios";
  etiqueta: string;
  listo: boolean;
  detalle: string;
};

export type EstadoSii =
  | "sin_enviar"
  | "emitiendo"
  | "enviado"
  | "en_proceso"
  | "aceptado"
  | "reparos"
  | "rechazado"
  | "error"
  | "sin_clasificar";

/**
 * Códigos conocidos → estado de la app.
 *
 * Los dos primeros son NUESTROS: los escribe `emitirFactura()`. El resto son
 * del SII y son los que hay que confirmar en certificación.
 */
const CODIGOS: Record<string, EstadoSii> = {
  // Propios de la app
  //
  // "emitiendo" es el cerrojo que toma emitirFactura() antes de pedir el folio:
  // mientras esté puesto, otra pestaña no puede emitir la misma factura. Que
  // sea un estado visible y no una bandera aparte tiene un motivo — si un
  // proceso se cae a mitad de camino, el cerrojo queda a la vista en la
  // pantalla en vez de trabar la factura en silencio.
  emitiendo: "emitiendo",
  enviado: "enviado",
  error: "error",

  // Lo que devuelve el PASO DE ENVÍO cuando el sobre se entregó bien.
  // `emitirFactura()` guarda ese código en la misma columna, y significa
  // "el SII recibió el sobre" — no "la factura está aceptada". El veredicto
  // solo llega consultando el track id.
  OK: "enviado",

  // Del SII — POR CONFIRMAR
  SOK: "en_proceso", // sobre recibido, todavía sin procesar
  EPR: "aceptado", // envío procesado
  RCT: "rechazado", // rechazado por error de schema
  RSC: "rechazado", // rechazado por schema
  RFR: "rechazado", // rechazado por firma
  RCH: "rechazado", // rechazado
  RCV: "rechazado",
  SNC: "rechazado", // el RUT del emisor no corresponde
};

/**
 * ¿La glosa habla de reparos?
 *
 * Red de seguridad sobre la tabla de códigos: un documento "aceptado con
 * reparos" vale, pero hay algo que corregir, y confundirlo con un aceptado
 * limpio hace que el reparo se repita en la factura siguiente. Como equivocarse
 * hacia "reparos" no rompe nada y equivocarse hacia "aceptado" sí, la glosa
 * gana sobre el código.
 */
function mencionaReparos(glosa: string): boolean {
  const g = glosa.toLowerCase();
  if (g.includes("sin reparos")) return false;
  return g.includes("reparo");
}

/**
 * Traduce el par (código, glosa) que quedó guardado en la factura.
 *
 * `null` en el código significa que esta factura nunca pasó por el SII: se
 * cargó a mano, con un folio tipeado. No es un error ni un pendiente.
 */
export function clasificarEstadoSii(
  codigo: string | null | undefined,
  glosa?: string | null,
): EstadoSii {
  const c = (codigo ?? "").trim();
  if (!c) return "sin_enviar";

  if (mencionaReparos(glosa ?? "")) return "reparos";

  // Los códigos del SII vienen en mayúsculas; los nuestros, en minúsculas.
  return CODIGOS[c] ?? CODIGOS[c.toUpperCase()] ?? CODIGOS[c.toLowerCase()] ?? "sin_clasificar";
}

export const ESTADOS_SII: Record<EstadoSii, string> = {
  sin_enviar: "No pasó por el SII",
  emitiendo: "Emitiendo…",
  enviado: "Enviada al SII",
  en_proceso: "En proceso en el SII",
  aceptado: "Aceptada por el SII",
  reparos: "Aceptada con reparos",
  rechazado: "Rechazada por el SII",
  error: "Falló el envío",
  sin_clasificar: "Respuesta del SII",
};

/**
 * Estados que piden que alguien haga algo. Se usan para pintarlos distinto: en
 * una lista de facturas, lo que necesita atención tiene que verse sin abrir la
 * fila.
 */
export function necesitaAtencion(e: EstadoSii): boolean {
  return e === "reparos" || e === "rechazado" || e === "error";
}

/**
 * ¿El SII ya dijo la última palabra?
 *
 * "enviado" y "en_proceso" son transitorios: hay que volver a consultar. El
 * resto no cambia solo. `sin_clasificar` cuenta como no resuelto a propósito:
 * si no sabemos leer la respuesta, tampoco sabemos si terminó.
 */
export function esperaRespuesta(e: EstadoSii): boolean {
  return (
    e === "emitiendo" || e === "enviado" || e === "en_proceso" || e === "sin_clasificar"
  );
}
