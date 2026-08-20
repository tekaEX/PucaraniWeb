// Qué se acepta como certificado digital antes de guardarlo.
//
// Este módulo es PURO: recibe los bytes y el nombre del archivo, y decide si
// puede ser un PKCS#12. No abre el certificado, no descifra nada y no sale a la
// red — por eso se puede probar sin credenciales.
//
// Lo que resuelve: hasta ahora la acción aceptaba cualquier archivo con tal de
// que tuviera tamaño mayor que cero, lo subía al bucket y lo marcaba como el
// certificado de la empresa. Un PDF renombrado a .pfx pasaba igual, y el error
// aparecía recién al emitir —después de tomar el folio— como un mensaje de
// SimpleAPI sobre la clave del certificado, que manda a buscar el problema al
// lugar equivocado.
//
// Lo que NO resuelve, y hay que tenerlo claro: esto no comprueba que la
// CONTRASEÑA abra el archivo ni que el titular sea quien dice ser. Eso exige
// abrir un PKCS#12, y Node no trae parser de PKCS#12 (`node:crypto` no lo
// expone); hacerlo pediría una dependencia nueva o un binario de OpenSSL que en
// Vercel no existe. Ver la decisión documentada en
// specs/002-simpleapi-certificacion/decisiones.md.

/** Techo del archivo. Un .pfx real pesa entre 2 y 10 KB; con cadena, algo más. */
export const MAX_BYTES_CERTIFICADO = 512 * 1024;

const EXTENSIONES = [".pfx", ".p12"];

/**
 * Tipos MIME que se dejan pasar.
 *
 * La lista es permisiva a propósito y NO es la validación real: el navegador
 * manda lo que quiere para un .pfx —Chrome suele decir
 * `application/x-pkcs12`, otros mandan `application/octet-stream` y algunos
 * mandan vacío—. Rechazar por MIME dejaría afuera archivos legítimos. La
 * comprobación que decide es la de los bytes.
 */
const MIMES = [
  "",
  "application/x-pkcs12",
  "application/pkcs12",
  "application/octet-stream",
];

/**
 * El OID `pkcs7-data` (1.2.840.113549.1.7.1) codificado en DER.
 *
 * Está presente en todo PKCS#12 porque es el tipo de contenido del sobre que
 * envuelve las bolsas del archivo. Buscarlo es una comprobación barata y
 * concreta: un PDF, un PNG o un PEM renombrado no lo contienen.
 */
const OID_PKCS7_DATA = Uint8Array.from([
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01,
]);

function contiene(bytes: Uint8Array, patron: Uint8Array): boolean {
  if (patron.length > bytes.length) return false;
  const tope = bytes.length - patron.length;
  for (let i = 0; i <= tope; i++) {
    let j = 0;
    while (j < patron.length && bytes[i + j] === patron[j]) j++;
    if (j === patron.length) return true;
  }
  return false;
}

/** ¿Los primeros bytes son texto PEM? Es el archivo equivocado más común. */
function pareceTextoPem(bytes: Uint8Array): boolean {
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 64));
  return inicio.includes("-----BEGIN");
}

export type ArchivoCertificado = {
  nombre: string;
  /** El `type` que informó el navegador. No se le cree, solo se filtra. */
  tipo: string;
  bytes: Uint8Array;
};

/**
 * Devuelve el problema en castellano, o null si el archivo puede ser un PKCS#12.
 *
 * Como el resto del módulo SII, el error se devuelve como valor y no se lanza:
 * quien llama es una server action que tiene que mostrarle algo entendible a
 * quien subió el archivo equivocado, que es el caso más probable.
 */
export function errorCertificado(a: ArchivoCertificado): string | null {
  const nombre = (a.nombre ?? "").trim();

  if (!a.bytes || a.bytes.length === 0) {
    return "El archivo del certificado llegó vacío. Volvé a elegirlo.";
  }

  if (a.bytes.length > MAX_BYTES_CERTIFICADO) {
    const mb = (a.bytes.length / 1024 / 1024).toFixed(1);
    return `El archivo pesa ${mb} MB y el máximo es ${MAX_BYTES_CERTIFICADO / 1024} KB. Un certificado digital pesa unos pocos KB: revisá que sea el archivo correcto.`;
  }

  const ext = nombre.slice(nombre.lastIndexOf(".")).toLowerCase();
  if (!nombre.includes(".") || !EXTENSIONES.includes(ext)) {
    return `El certificado tiene que ser un archivo ${EXTENSIONES.join(" o ")}. Llegó "${nombre || "sin nombre"}".`;
  }

  const tipo = (a.tipo ?? "").toLowerCase();
  if (!MIMES.includes(tipo)) {
    return `El navegador informó el tipo "${tipo}", que no corresponde a un certificado digital.`;
  }

  if (pareceTextoPem(a.bytes)) {
    return "Ese archivo está en formato PEM (texto), no PKCS#12. El certificado para firmar DTE es el .pfx o .p12 que incluye la llave privada, protegido con contraseña.";
  }

  // Todo DER arranca con una SEQUENCE (0x30). Si el primer byte no es ese, el
  // archivo directamente no es DER y no hace falta seguir buscando.
  if (a.bytes[0] !== 0x30) {
    return "El archivo no es un certificado PKCS#12 válido (.pfx/.p12). Revisá que sea el que descargaste del proveedor de firma electrónica.";
  }

  if (!contiene(a.bytes, OID_PKCS7_DATA)) {
    return "El archivo tiene extensión de certificado pero su contenido no es un PKCS#12. Puede ser otro archivo renombrado.";
  }

  return null;
}
