// Lectura del archivo CAF que entrega el SII.
//
// El CAF ("Código de Autorización de Folios") es el XML que se descarga del SII
// cuando pedís folios. Adentro vienen dos cosas distintas:
//
//   · Los DATOS de la autorización: qué RUT, qué tipo de documento y qué rango
//     de folios quedó autorizado. Eso es lo que lee este módulo.
//   · La LLAVE PRIVADA (RSASK) con la que se timbra cada documento. Eso NO se
//     toca acá ni se guarda en la base: el archivo entero va al bucket privado
//     y se le entrega al proveedor de emisión cuando hay que firmar.
//
// La estructura la fija el SII y es estable:
//
//   <AUTORIZACION>
//     <CAF version="1.0">
//       <DA>
//         <RE>76192083-9</RE>        RUT del emisor
//         <RS>TRANSPORTES ...</RS>   razón social
//         <TD>33</TD>                tipo de DTE
//         <RNG><D>1</D><H>100</H></RNG>   rango: desde / hasta
//         <FA>2026-08-18</FA>        fecha de autorización
//         ...
//
// Por qué a mano y no con una librería de XML: es un formato chico, cerrado y
// generado siempre por el mismo emisor (el SII). Traer un parser completo para
// leer seis etiquetas agregaría una dependencia a todo el proyecto. Lo que sí
// se hace es acotar la búsqueda al bloque <DA>, porque <D> y <H> son etiquetas
// de una letra que fuera de <RNG> podrían aparecer en cualquier lado.

export type DatosCaf = {
  rutEmisor: string;
  razonSocial: string;
  tipoDte: number;
  folioDesde: number;
  folioHasta: number;
  fechaAutorizacion: string; // YYYY-MM-DD
};

/** Los tipos de documento que el sistema sabe manejar (mismos que la tabla). */
const TIPOS_VALIDOS = [33, 34, 56, 61];

function bloque(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function texto(xml: string, tag: string): string | null {
  const b = bloque(xml, tag);
  return b === null ? null : b.trim();
}

/**
 * Lee un CAF y devuelve sus datos, o un mensaje de error en castellano.
 *
 * Devuelve el error como valor en vez de tirar excepción porque quien llama es
 * una server action que tiene que mostrarle algo entendible a quien subió el
 * archivo equivocado — que es el caso más probable, no un bug.
 */
export function parsearCaf(xml: string): { datos: DatosCaf } | { error: string } {
  if (!xml.includes("<AUTORIZACION")) {
    return {
      error: "El archivo no es un CAF del SII (no contiene <AUTORIZACION>). Descargalo desde el SII, en «Timbraje electrónico».",
    };
  }

  const da = bloque(xml, "DA");
  if (!da) return { error: "El CAF no tiene el bloque <DA> con los datos de la autorización." };

  const rutEmisor = texto(da, "RE");
  const razonSocial = texto(da, "RS") ?? "";
  const tdRaw = texto(da, "TD");
  const fechaAutorizacion = texto(da, "FA");

  // Desde y hasta viven adentro de <RNG>: buscar <D> en todo el <DA> podría
  // agarrar otra etiqueta de una letra.
  const rng = bloque(da, "RNG");
  const desdeRaw = rng ? texto(rng, "D") : null;
  const hastaRaw = rng ? texto(rng, "H") : null;

  if (!rutEmisor) return { error: "El CAF no trae el RUT del emisor (<RE>)." };
  if (!tdRaw) return { error: "El CAF no trae el tipo de documento (<TD>)." };
  if (!desdeRaw || !hastaRaw) return { error: "El CAF no trae el rango de folios (<RNG>)." };
  if (!fechaAutorizacion) return { error: "El CAF no trae la fecha de autorización (<FA>)." };

  const tipoDte = Number(tdRaw);
  const folioDesde = Number(desdeRaw);
  const folioHasta = Number(hastaRaw);

  if (!TIPOS_VALIDOS.includes(tipoDte)) {
    return {
      error: `El CAF es para el documento tipo ${tipoDte}, que el sistema todavía no emite. Los soportados son ${TIPOS_VALIDOS.join(", ")}.`,
    };
  }
  if (!Number.isInteger(folioDesde) || !Number.isInteger(folioHasta) || folioDesde < 1) {
    return { error: "El rango de folios del CAF no es un número válido." };
  }
  if (folioHasta < folioDesde) {
    return { error: `El rango del CAF está invertido (desde ${folioDesde}, hasta ${folioHasta}).` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAutorizacion)) {
    return { error: `La fecha de autorización del CAF no tiene el formato esperado: "${fechaAutorizacion}".` };
  }

  return {
    datos: { rutEmisor, razonSocial, tipoDte, folioDesde, folioHasta, fechaAutorizacion },
  };
}

// `mismoRut` vivía acá cuando comparar RUT era cosa solo del CAF. Ahora el RUT
// se valida en cinco lugares (empresa, cliente, titular del certificado, emisor
// y receptor del DTE) y toda su lógica vive en @/lib/rut. Se re-exporta para no
// romper a quien lo importa desde este módulo.
export { mismoRut } from "@/lib/rut";
