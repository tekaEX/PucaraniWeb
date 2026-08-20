import "server-only";

// Cliente de SimpleAPI, el proveedor por el que se emiten los DTE al SII.
//
// Todo lo que hay acá está VERIFICADO contra la API real, no escrito de
// memoria. Esa distinción importa: la sincronización de combustible que quedó a
// medias se había escrito adivinando el contrato, con un TODO pidiendo
// confirmar el body y el header, y nunca funcionó.
//
// Verificado el 2026-08-18 contra https://api.simpleapi.cl, corriendo la cadena
// completa (generar → sobre → enviar → imprimir) con un certificado autofirmado
// y un CAF sintético. Ver `pruebas/humo-simpleapi.mjs`, que la repite entera.
//
//   · La key va en `Authorization: <key>`, SIN prefijo. Con "Bearer" o "ApiKey"
//     la API responde 401.
//   · Hay un límite de 3 llamadas por segundo; al pasarse responde 429 con
//     "API calls quota exceeded! maximum admitted 3 per 1s". Por eso las
//     llamadas de este módulo pasan por un turnstile (ver `enFila`).
//   · El input viaja como campo de TEXTO en un multipart/form-data, junto con
//     los archivos. El orden de los archivos IMPORTA y los nombres de campo son
//     posicionales: `files`, `files2`, `files3`…
//   · Generar un DTE, armar el sobre e imprimir el PDF NO consumen cuota: se
//     corrió la cadena varias veces y el `uso` quedó en 0. Lo que consume es el
//     envío efectivo al SII.
//   · Un error puede venir con HTTP 400 y un JSON que trae `"ok": true`. No hay
//     que mirar ese campo: lo que manda es `estado` y el `trackId` (-999999).
//
// El contrato completo está publicado como colección de Postman en
// https://documentacion.simpleapi.cl/ y como swagger en
// https://api.simpleapi.cl/swagger/v1/swagger.json

import type { UsoServicio } from "@/lib/sii/servicios";

export const SIMPLEAPI_BASE = "https://api.simpleapi.cl";

/** Techo de la API. Cualquier envío en lote tiene que respetarlo. */
export const LIMITE_POR_SEGUNDO = 3;

/** Margen sobre el techo: 3 por segundo es 1 cada 334 ms. */
const MS_ENTRE_LLAMADAS = Math.ceil(1000 / LIMITE_POR_SEGUNDO) + 20;

export type ErrorSimpleApi = { error: string };

/** Ambiente del SII. Los números son los que espera la API. */
export const AMBIENTE = { certificacion: 0, produccion: 1 } as const;
export type Ambiente = keyof typeof AMBIENTE;

/** Tipo de sobre. EnvioDTE = 1, EnvioBoleta = 2. */
const ENVIO_DTE = 1;

/** RUT del SII como receptor de los envíos. Lo fija ellos, no se cambia. */
export const RUT_SII = "60803000-K";

/**
 * El certificado digital, tal como lo pide la API.
 *
 * `rut` es el de la PERSONA titular de la firma, no el de la empresa: en el
 * sobre viaja como <RutEnvia> y el SII lo contrasta contra quien firmó.
 */
export type Certificado = {
  rut: string;
  password: string;
  /** El .pfx en bytes. Sale del bucket privado, nunca del disco. */
  pfx: Uint8Array;
};

function apiKey(): string | null {
  const k = process.env.SIMPLEAPI_KEY;
  return k && k.trim() ? k.trim() : null;
}

// ---------------------------------------------------------------------------
// Turnstile: una llamada por vez, separadas por MS_ENTRE_LLAMADAS.
//
// Emitir una factura son tres llamadas seguidas (generar, sobre, enviar) y sin
// esto entran las tres en el mismo segundo. El 429 que devuelve la API en ese
// caso es indistinguible de un problema real, y peor: llegaría después de haber
// consumido un folio.
// ---------------------------------------------------------------------------
let fila: Promise<unknown> = Promise.resolve();

function enFila<T>(tarea: () => Promise<T>): Promise<T> {
  const proximo = fila.then(tarea, tarea);
  // La fila avanza igual si la tarea falla; si no, un error dejaría todo trabado.
  fila = proximo.then(
    () => new Promise((r) => setTimeout(r, MS_ENTRE_LLAMADAS)),
    () => new Promise((r) => setTimeout(r, MS_ENTRE_LLAMADAS)),
  );
  return proximo;
}

/** Un archivo que va en el multipart. El orden de la lista es el orden real. */
type Archivo = { nombre: string; contenido: Uint8Array | string; tipo: string };

function blobDe(a: Archivo): Blob {
  const datos =
    typeof a.contenido === "string" ? new TextEncoder().encode(a.contenido) : a.contenido;
  // Copia al Blob para no depender del ArrayBuffer de origen.
  return new Blob([datos.slice()], { type: a.tipo });
}

/**
 * Traduce lo que respondió la API a un mensaje que se pueda mostrar.
 *
 * La API no tiene un formato único de error: a veces es un JSON con
 * `responseXml`, a veces una lista en `errores`, a veces texto pelado.
 */
function mensajeDeError(status: number, cuerpo: string): string {
  if (status === 401) return "SimpleAPI rechazó la key (401). Revisá SIMPLEAPI_KEY.";
  if (status === 429) {
    return "Demasiadas consultas seguidas a SimpleAPI (máximo 3 por segundo). Probá de nuevo.";
  }

  // Cuota mensual agotada. Es distinto del 429 y hay que decirlo distinto: el
  // 429 se arregla esperando unos segundos, esto NO se arregla esperando —el
  // tope se reinicia el día 1 y no se acumula—. Confundirlos hace que alguien
  // reintente toda la tarde un envío que no va a salir.
  //
  // Se detecta por texto además de por status porque la API no usa un código
  // dedicado de forma consistente; lo que sí es estable es la palabra.
  const cuota = /quota|cuota|l[íi]mite\s+(mensual|de\s+plan)|excedid|agotad/i.test(cuerpo);
  if (cuota && status !== 429) {
    return (
      "Se agotó la cuota mensual de SimpleAPI para emitir documentos. " +
      "El tope se reinicia el día 1 y no se acumula: hay que ampliar el plan o esperar al mes siguiente. " +
      "Podés ver cuánto queda en Facturas › Configuración SII › Probar conexión."
    );
  }
  if (status === 402 || status === 403) {
    return (
      `SimpleAPI rechazó la operación (${status}). Suele ser la cuota del plan o un servicio no contratado. ` +
      "Revisá el consumo en Facturas › Configuración SII › Probar conexión."
    );
  }

  try {
    const j = JSON.parse(cuerpo) as Record<string, unknown>;
    const partes = [j.responseXml, j.glosa, j.mensaje, j.message, j.title]
      .filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (Array.isArray(j.errores) && j.errores.length) {
      partes.push(j.errores.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("; "));
    }
    if (partes.length) return `SimpleAPI: ${partes.join(" — ")}`;
  } catch {
    // No era JSON: sigue abajo con el texto pelado.
  }

  const texto = cuerpo.trim().slice(0, 300);
  return texto ? `SimpleAPI (${status}): ${texto}` : `SimpleAPI respondió ${status}.`;
}

/**
 * Una llamada al API: multipart con `input` de texto y los archivos en orden.
 *
 * Devuelve el cuerpo crudo porque según el endpoint puede ser XML, JSON o un
 * PDF; interpretarlo es tarea de quien llama.
 */
async function llamar(
  ruta: string,
  input: unknown | null,
  archivos: Archivo[],
  opciones: { campoArchivo?: string; timeoutMs?: number } = {},
): Promise<{ bytes: Uint8Array; tipo: string } | ErrorSimpleApi> {
  const key = apiKey();
  if (!key) return { error: "Falta SIMPLEAPI_KEY en el entorno del servidor." };

  const form = new FormData();
  if (input !== null) form.append("input", JSON.stringify(input));

  // Los nombres son posicionales: el primero es `files`, el segundo `files2`…
  // El endpoint de impresión usa otro nombre para su único archivo.
  const base = opciones.campoArchivo ?? "files";
  archivos.forEach((a, i) => {
    form.append(i === 0 ? base : `${base}${i + 1}`, blobDe(a), a.nombre);
  });

  let resp: Response;
  try {
    resp = await enFila(() =>
      fetch(`${SIMPLEAPI_BASE}${ruta}`, {
        method: "POST",
        headers: { Authorization: key },
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(opciones.timeoutMs ?? 60000),
      }),
    );
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name === "TimeoutError"
          ? "SimpleAPI no respondió a tiempo."
          : "No se pudo conectar con SimpleAPI.",
    };
  }

  const bytes = new Uint8Array(await resp.arrayBuffer());
  const tipo = resp.headers.get("content-type") ?? "";

  if (!resp.ok) {
    return { error: mensajeDeError(resp.status, new TextDecoder().decode(bytes)) };
  }
  return { bytes, tipo };
}

function texto(bytes: Uint8Array): string {
  // La API devuelve los XML en ISO-8859-1 (así los quiere el SII).
  return new TextDecoder("iso-8859-1").decode(bytes);
}

function archivoCert(c: Certificado): Archivo {
  return { nombre: "certificado.pfx", contenido: c.pfx, tipo: "application/x-pkcs12" };
}

function credencial(c: Certificado) {
  return { Rut: c.rut, Password: c.password };
}

// ---------------------------------------------------------------------------
// Estado de la suscripción
// ---------------------------------------------------------------------------

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
    resp = await enFila(() =>
      fetch(`${SIMPLEAPI_BASE}/api/v1/Suscripcion/status`, {
        headers: { Authorization: key, Accept: "application/json" },
        // Sin esto Next podría cachear la respuesta y mostrar un uso viejo.
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      }),
    );
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

// ---------------------------------------------------------------------------
// Paso 1 — Timbrar y firmar el documento
// ---------------------------------------------------------------------------

/**
 * Convierte el documento en un DTE timbrado y firmado.
 *
 * Acá es donde se usa el CAF: la API le saca la llave privada (RSASK) y con
 * ella arma el timbre electrónico (TED) del documento. Por eso el CAF viaja
 * entero y no solo su metadata.
 *
 * El folio del documento tiene que caer dentro del rango del CAF que se manda,
 * o el SII rechaza el documento aunque la API lo genere igual.
 */
export async function generarDte(
  documento: unknown,
  certificado: Certificado,
  cafXml: string,
): Promise<{ xml: string } | ErrorSimpleApi> {
  const r = await llamar(
    "/api/v1/dte/generar",
    { Documento: documento, Certificado: credencial(certificado) },
    [
      archivoCert(certificado),
      { nombre: "caf.xml", contenido: cafXml, tipo: "application/xml" },
    ],
  );
  if ("error" in r) return r;
  return { xml: texto(r.bytes) };
}

// ---------------------------------------------------------------------------
// Paso 2 — Meter el DTE en un sobre
// ---------------------------------------------------------------------------

export type Caratula = {
  /** RUT de la empresa emisora. */
  rutEmisor: string;
  /** A quién va el sobre: al SII (RUT_SII) o al cliente. */
  rutReceptor: string;
  /** Resolución del SII que autoriza a emitir. En certificación, 0. */
  numeroResolucion: number;
  /** AAAA-MM-DD */
  fechaResolucion: string;
};

/**
 * Arma el sobre (EnvioDTE) que envuelve uno o más documentos.
 *
 * Un sobre admite hasta 2.000 DTE. Al SII se le manda un sobre, no documentos
 * sueltos: el track id que devuelve identifica al SOBRE, no a cada factura.
 */
export async function generarSobre(
  caratula: Caratula,
  certificado: Certificado,
  dtes: string[],
): Promise<{ xml: string } | ErrorSimpleApi> {
  if (!dtes.length) return { error: "El sobre necesita al menos un DTE." };

  const r = await llamar(
    "/api/v1/envio/generar",
    {
      Certificado: credencial(certificado),
      Caratula: {
        RutEmisor: caratula.rutEmisor,
        RutReceptor: caratula.rutReceptor,
        NumeroResolucion: caratula.numeroResolucion,
        FechaResolucion: caratula.fechaResolucion,
      },
    },
    [
      archivoCert(certificado),
      ...dtes.map((xml, i) => ({
        nombre: `dte-${i + 1}.xml`,
        contenido: xml,
        tipo: "application/xml",
      })),
    ],
  );
  if ("error" in r) return r;
  return { xml: texto(r.bytes) };
}

// ---------------------------------------------------------------------------
// Paso 3 — Mandarlo al SII
// ---------------------------------------------------------------------------

export type ResultadoEnvio = {
  trackId: number;
  estado: string;
  glosa: string;
};

/**
 * Manda el sobre al SII y devuelve el track id con el que se le hace
 * seguimiento.
 *
 * Este es el ÚNICO paso que necesita que el certificado sea real y esté
 * registrado: la API se autentica ante el SII con él. Con un certificado de
 * prueba la respuesta es HTTP 400 y `responseXml: "Certificado vencido"`.
 *
 * Es también el único que consume cuota.
 */
export async function enviarAlSii(
  certificado: Certificado,
  sobreXml: string,
  ambiente: Ambiente,
): Promise<ResultadoEnvio | ErrorSimpleApi> {
  const r = await llamar(
    "/api/v1/envio/enviar",
    { Certificado: credencial(certificado), Ambiente: AMBIENTE[ambiente], Tipo: ENVIO_DTE },
    [
      archivoCert(certificado),
      { nombre: "sobre.xml", contenido: sobreXml, tipo: "application/xml" },
    ],
    { timeoutMs: 90000 },
  );
  if ("error" in r) return r;

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(new TextDecoder().decode(r.bytes)) as Record<string, unknown>;
  } catch {
    return { error: "SimpleAPI devolvió una respuesta ilegible al enviar al SII." };
  }

  const trackId = Number(datos.trackId ?? 0);
  const estado = String(datos.estado ?? "");
  const glosa = String(datos.glosa ?? datos.responseXml ?? "");

  // OJO: el campo `ok` viene en true incluso cuando falló. Lo que manda es el
  // track id: -999999 es el centinela de error de esta API.
  if (!trackId || trackId < 0 || estado.toUpperCase() === "ERROR") {
    return { error: glosa ? `El SII no aceptó el envío: ${glosa}` : "El SII no aceptó el envío." };
  }

  return { trackId, estado, glosa };
}

// ---------------------------------------------------------------------------
// Paso 4 — Preguntar qué pasó con el envío
// ---------------------------------------------------------------------------

/**
 * Consulta el estado de un envío ya mandado.
 *
 * El SII no responde al instante: un envío recién hecho queda "en proceso" un
 * rato. Que devuelva eso no es un error.
 */
export async function consultarEnvio(
  certificado: Certificado,
  rutEmpresa: string,
  trackId: number,
  ambiente: Ambiente,
): Promise<{ estado: string; glosa: string; xml: string } | ErrorSimpleApi> {
  const r = await llamar(
    "/api/v1/consulta/envio",
    {
      Certificado: credencial(certificado),
      RutEmpresa: rutEmpresa,
      TrackId: trackId,
      Ambiente: AMBIENTE[ambiente],
      ServidorBoletaREST: false,
    },
    [archivoCert(certificado)],
  );
  if ("error" in r) return r;

  const crudo = new TextDecoder().decode(r.bytes);
  try {
    const j = JSON.parse(crudo) as Record<string, unknown>;
    return {
      estado: String(j.estado ?? ""),
      glosa: String(j.glosa ?? ""),
      xml: String(j.responseXml ?? ""),
    };
  } catch {
    return { estado: "", glosa: "", xml: crudo };
  }
}

// ---------------------------------------------------------------------------
// Representación impresa
// ---------------------------------------------------------------------------

export type OpcionesImpresion = {
  numeroResolucion: number;
  /** AAAA-MM-DD */
  fechaResolucion: string;
  /** Oficina del SII que emitió la resolución. Va impresa en el documento. */
  unidadSII: string;
  formaPago?: string | null;
  condicionVenta?: string | null;
  vendedor?: string | null;
};

/**
 * El PDF del documento, tal como lo tiene que ver el cliente.
 *
 * No necesita certificado: se arma leyendo el DTE ya timbrado, que trae el
 * timbre adentro. Tampoco consume cuota.
 */
export async function generarPdf(
  dteXml: string,
  opciones: OpcionesImpresion,
  logo?: Uint8Array | null,
): Promise<{ pdf: Uint8Array } | ErrorSimpleApi> {
  const archivos: Archivo[] = [
    { nombre: "dte.xml", contenido: dteXml, tipo: "application/xml" },
  ];

  const form = {
    NumeroResolucion: opciones.numeroResolucion,
    FechaResolucion: opciones.fechaResolucion,
    UnidadSII: opciones.unidadSII,
    ...(opciones.formaPago ? { FormaPago: opciones.formaPago } : {}),
    ...(opciones.condicionVenta ? { CondicionVenta: opciones.condicionVenta } : {}),
    ...(opciones.vendedor ? { Vendedor: opciones.vendedor } : {}),
    PropiedadLogo: "contain",
  };

  // El archivo del documento va en `fileEnvio`, no en `files`; el logo, en
  // `logo`. Este endpoint no sigue la numeración posicional de los otros.
  const key = apiKey();
  if (!key) return { error: "Falta SIMPLEAPI_KEY en el entorno del servidor." };

  const fd = new FormData();
  fd.append("input", JSON.stringify(form));
  fd.append("fileEnvio", blobDe(archivos[0]), archivos[0].nombre);
  if (logo && logo.length) {
    fd.append("logo", new Blob([logo.slice()], { type: "image/png" }), "logo.png");
  }

  let resp: Response;
  try {
    resp = await enFila(() =>
      fetch(`${SIMPLEAPI_BASE}/api/v1/impresion/pdf/carta/v2`, {
        method: "POST",
        headers: { Authorization: key },
        body: fd,
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
      }),
    );
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name === "TimeoutError"
          ? "SimpleAPI no respondió a tiempo al generar el PDF."
          : "No se pudo conectar con SimpleAPI para generar el PDF.",
    };
  }

  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (!resp.ok) return { error: mensajeDeError(resp.status, new TextDecoder().decode(bytes)) };
  return { pdf: bytes };
}
