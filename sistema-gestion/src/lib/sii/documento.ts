// Armado del documento tributario que se le manda a SimpleAPI.
//
// Este módulo es PURO: recibe los datos de la factura y devuelve el JSON que
// espera la API. No lee la base, no habla con la red y no toca el certificado.
// Esa separación es deliberada: es acá donde vive la aritmética que el SII
// revisa con lupa —el neto, el IVA, el total y que las líneas sumen lo que
// dice la cabecera— y eso se tiene que poder probar sin credenciales.
//
// El contrato lo fija SimpleAPI y está verificado contra la API real
// (2026-08-18): se mandó este mismo documento y devolvió un DTE timbrado.
// Los nombres de campo van en PascalCase porque así los espera la API; no es
// un descuido de estilo.

/** Los tipos que este módulo sabe armar. 56/61 (notas) necesitan referencias. */
export type TipoDteEmitible = 33 | 34;

export type Emisor = {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  /** Códigos de actividad económica del SII. Al menos uno. */
  actividadEconomica: number[];
};

export type Receptor = {
  rut: string;
  razonSocial: string;
  giro: string;
  direccion: string;
  comuna: string;
  contacto?: string | null;
};

/** Una línea del detalle. En esta app, cada viaje facturado es una línea. */
export type Linea = {
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
};

export type DatosFactura = {
  tipoDte: TipoDteEmitible;
  folio: number;
  /** AAAA-MM-DD */
  fechaEmision: string;
  /** AAAA-MM-DD. Opcional. */
  fechaVencimiento?: string | null;
  /** Lo que la app tiene registrado. Se usa para CONTRASTAR, no para copiar. */
  neto: number;
  iva: number;
  total: number;
};

export type Documento = Record<string, unknown>;

/** Tope del SII: un DTE admite hasta 60 líneas de detalle. */
export const MAX_LINEAS = 60;

/** Tasa de IVA vigente en Chile. */
export const TASA_IVA = 19;

/**
 * Los montos del DTE son enteros: el SII no acepta decimales en pesos.
 */
function pesos(n: number): number {
  return Math.round(n);
}

function limpio(s: string | null | undefined): string {
  return (s ?? "").trim();
}

/**
 * Arma el documento, o explica en castellano por qué no se puede.
 *
 * Devuelve el error como valor —no lanza— porque quien llama es una acción de
 * servidor que tiene que mostrarle algo entendible a quien apretó "Emitir".
 * Y porque la mayoría de estos errores son datos incompletos, no bugs: falta
 * el giro del cliente, falta la comuna, la factura no tiene viajes.
 */
export function construirDocumento(args: {
  factura: DatosFactura;
  emisor: Emisor;
  receptor: Receptor;
  lineas: Linea[];
}): { documento: Documento } | { error: string } {
  const { factura, emisor, receptor, lineas } = args;

  // --- Emisor: lo que el SII exige sí o sí en la cabecera -------------------
  if (!limpio(emisor.rut)) return { error: "Falta el RUT de la empresa emisora." };
  if (!limpio(emisor.razonSocial)) return { error: "Falta la razón social de la empresa." };
  if (!limpio(emisor.giro)) return { error: "Falta el giro de la empresa." };
  if (!limpio(emisor.direccion)) return { error: "Falta la dirección de la empresa." };
  if (!limpio(emisor.comuna)) return { error: "Falta la comuna de la empresa." };
  if (!emisor.actividadEconomica.length) {
    return { error: "Falta el código de actividad económica de la empresa (lo asigna el SII)." };
  }

  // --- Receptor -------------------------------------------------------------
  if (!limpio(receptor.rut)) {
    return { error: `El cliente "${receptor.razonSocial || "sin nombre"}" no tiene RUT cargado.` };
  }
  if (!limpio(receptor.razonSocial)) return { error: "El cliente no tiene razón social." };
  if (!limpio(receptor.giro)) {
    return {
      error: `Falta el giro del cliente "${receptor.razonSocial}". El SII lo exige en la factura.`,
    };
  }
  if (!limpio(receptor.direccion)) {
    return { error: `Falta la dirección del cliente "${receptor.razonSocial}".` };
  }
  if (!limpio(receptor.comuna)) {
    return { error: `Falta la comuna del cliente "${receptor.razonSocial}".` };
  }

  // --- Detalle --------------------------------------------------------------
  if (!lineas.length) {
    return {
      error: "La factura no tiene ningún viaje asociado: un DTE necesita al menos una línea.",
    };
  }
  if (lineas.length > MAX_LINEAS) {
    return {
      error: `La factura tiene ${lineas.length} líneas y el SII admite hasta ${MAX_LINEAS}. Dividila en dos documentos.`,
    };
  }
  for (const l of lineas) {
    if (!limpio(l.descripcion)) return { error: "Hay una línea sin descripción." };
    if (!(l.cantidad > 0)) {
      return { error: `La línea "${l.descripcion}" tiene cantidad ${l.cantidad}.` };
    }
    if (l.valorUnitario < 0) {
      return { error: `La línea "${l.descripcion}" tiene un valor negativo.` };
    }
  }

  // --- Fechas y folio -------------------------------------------------------
  if (!/^\d{4}-\d{2}-\d{2}$/.test(factura.fechaEmision)) {
    return { error: `La fecha de emisión no tiene el formato AAAA-MM-DD: "${factura.fechaEmision}".` };
  }
  if (!(factura.folio > 0)) {
    return { error: "La factura no tiene folio. El folio lo entrega el CAF, no se escribe a mano." };
  }

  // --- Aritmética -----------------------------------------------------------
  //
  // El monto de cada ítem se redondea porque va entero al XML; la suma de esos
  // enteros ES la base. Calcularla sobre los valores sin redondear daría un
  // neto que no coincide con la suma de las líneas impresas, y ese descuadre de
  // un peso es motivo de reparo del SII.
  const montosItem = lineas.map((l) => pesos(l.cantidad * l.valorUnitario));
  const base = montosItem.reduce((a, b) => a + b, 0);

  const exenta = factura.tipoDte === 34;
  const iva = exenta ? 0 : pesos((base * TASA_IVA) / 100);
  const total = base + iva;

  // Contraste contra lo que la app tiene registrado. Si no calzan, algo se
  // editó por un lado y no por el otro: emitir igual dejaría un DTE que no
  // coincide con la contabilidad, y eso solo se arregla con una nota de crédito.
  const registrado = {
    neto: pesos(factura.neto),
    iva: pesos(factura.iva),
    total: pesos(factura.total),
  };
  const calculado = { neto: base, iva, total };
  if (
    registrado.neto !== calculado.neto ||
    registrado.iva !== calculado.iva ||
    registrado.total !== calculado.total
  ) {
    return {
      error:
        `Los montos no cuadran con los viajes asociados. ` +
        `La factura dice neto ${registrado.neto}, IVA ${registrado.iva}, total ${registrado.total}; ` +
        `los viajes suman neto ${calculado.neto}, IVA ${calculado.iva}, total ${calculado.total}. ` +
        `Revisá los viajes incluidos antes de emitir.`,
    };
  }

  // --- Totales según el tipo de documento -----------------------------------
  //
  // Una factura exenta (34) NO lleva MontoNeto ni IVA: lleva MontoExento. Poner
  // neto e IVA en cero pero presentes es una causa típica de rechazo.
  const totales: Record<string, number> = exenta
    ? { MontoExento: base, MontoTotal: total }
    : { MontoNeto: base, TasaIVA: TASA_IVA, IVA: iva, MontoTotal: total };

  const documento: Documento = {
    Encabezado: {
      IdentificacionDTE: {
        TipoDTE: factura.tipoDte,
        Folio: factura.folio,
        FechaEmision: factura.fechaEmision,
        ...(factura.fechaVencimiento ? { FechaVencimiento: factura.fechaVencimiento } : {}),
      },
      Emisor: {
        Rut: limpio(emisor.rut),
        RazonSocial: limpio(emisor.razonSocial),
        Giro: limpio(emisor.giro),
        ActividadEconomica: emisor.actividadEconomica,
        DireccionOrigen: limpio(emisor.direccion),
        ComunaOrigen: limpio(emisor.comuna),
      },
      Receptor: {
        Rut: limpio(receptor.rut),
        RazonSocial: limpio(receptor.razonSocial),
        Giro: limpio(receptor.giro),
        Direccion: limpio(receptor.direccion),
        Comuna: limpio(receptor.comuna),
        ...(limpio(receptor.contacto) ? { Contacto: limpio(receptor.contacto) } : {}),
      },
      Totales: totales,
    },
    Detalles: lineas.map((l, i) => ({
      // 1 = exento. En una factura exenta va en TODAS las líneas.
      IndicadorExento: exenta ? 1 : 0,
      Nombre: limpio(l.descripcion).slice(0, 80), // el SII corta en 80
      Cantidad: l.cantidad,
      UnidadMedida: "un",
      Precio: l.valorUnitario,
      MontoItem: montosItem[i],
    })),
  };

  return { documento };
}
