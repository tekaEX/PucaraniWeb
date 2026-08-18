import "server-only";

// Cliente de SimpleAPI, el proveedor por el que se emiten los DTE al SII.
//
// Todo lo que hay acá está VERIFICADO contra la API real, no escrito de
// memoria. Esa distinción importa: la sincronización de combustible que quedó a
// medias se había escrito adivinando el contrato, con un TODO pidiendo
// confirmar el body y el header, y nunca funcionó. Lo que sigue sin confirmar
// está marcado como tal, en un solo lugar.
//
// Verificado el 2026-08-18 contra https://api.simpleapi.cl:
//
//   · La key va en `Authorization: <key>`, SIN prefijo. Con "Bearer" o "ApiKey"
//     la API responde 401.
//   · Hay un límite de 3 llamadas por segundo; al pasarse responde 429 con
//     "API calls quota exceeded! maximum admitted 3 per 1s".
//   · El input de los endpoints POST viaja como JSON URL-encodeado en el
//     QUERY STRING (`?input={...}`), no en el body. Se comprobó mandando un
//     input y recibiendo "RUT de emisor incorrecto": la API lo parseó y llegó a
//     validarlo.
//   · GET /api/v1/Suscripcion/status NO consume cuota (el `uso` quedó en 0
//     después de varias llamadas).
//
// El contrato completo está publicado en https://api.simpleapi.cl/swagger/v1/swagger.json

import type { UsoServicio } from "@/lib/sii/servicios";

export const SIMPLEAPI_BASE = "https://api.simpleapi.cl";

/** Techo de la API. Cualquier envío en lote tiene que respetarlo. */
export const LIMITE_POR_SEGUNDO = 3;

export type ErrorSimpleApi = { error: string };

function apiKey(): string | null {
  const k = process.env.SIMPLEAPI_KEY;
  return k && k.trim() ? k.trim() : null;
}

/**
 * Cuánto queda de cada servicio en el mes.
 *
 * Es la única llamada que se puede hacer sin certificado ni CAF, así que sirve
 * como "probar conexión": si esto responde, la key está bien puesta.
 *
 * Los topes son MENSUALES y se reinician el día 1; no se acumulan.
 */
export async function estadoSuscripcion(): Promise<
  { servicios: UsoServicio[] } | ErrorSimpleApi
> {
  const key = apiKey();
  if (!key) {
    return { error: "Falta SIMPLEAPI_KEY en el entorno del servidor." };
  }

  let resp: Response;
  try {
    resp = await fetch(`${SIMPLEAPI_BASE}/api/v1/Suscripcion/status`, {
      headers: { Authorization: key, Accept: "application/json" },
      // Sin esto Next podría cachear la respuesta y mostrar un uso viejo.
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name === "TimeoutError"
          ? "SimpleAPI no respondió a tiempo."
          : "No se pudo conectar con SimpleAPI.",
    };
  }

  if (resp.status === 401) {
    return { error: "SimpleAPI rechazó la key (401). Revisá SIMPLEAPI_KEY." };
  }
  if (resp.status === 429) {
    return { error: "Demasiadas consultas seguidas a SimpleAPI (máximo 3 por segundo). Probá de nuevo." };
  }
  if (!resp.ok) {
    return { error: `SimpleAPI respondió ${resp.status}.` };
  }

  const datos: unknown = await resp.json();
  if (!Array.isArray(datos)) {
    return { error: "SimpleAPI devolvió una respuesta inesperada." };
  }

  const servicios = datos
    .filter((d): d is UsoServicio => {
      const o = d as Partial<UsoServicio>;
      return typeof o?.servicio === "string" && typeof o?.maximo === "number";
    })
    .map((d) => ({ servicio: d.servicio, uso: Number(d.uso ?? 0), maximo: d.maximo }));

  return { servicios };
}
