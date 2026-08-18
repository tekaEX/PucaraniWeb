// IVA y totales. Es la única regla de plata del sistema que se aplica en los
// dos sentidos, y estaba escrita CUATRO veces:
//
//   · cotizaciones/actions.ts   — la que se guarda en la base
//   · cotizaciones/cotizacion-form.tsx    — la que ve quien crea
//   · cotizaciones/cotizacion-editor.tsx  — la que ve quien edita
//   · facturas/factura-form.tsx — la inversa, con su propia const IVA_RATE
//
// O sea: el número que el usuario veía en pantalla y el que se persistía los
// calculaba código distinto. Coincidían porque alguien los mantuvo a mano. Un
// cambio de tasa —o un redondeo distinto en una sola copia— hacía que la
// cotización mostrara un total y la base guardara otro, y eso en una cotización
// que ya se le mandó al cliente no se nota hasta que se factura.
//
// Sin dependencias a propósito: se usa igual en el servidor (Server Actions) y
// en el navegador (los formularios calculan en vivo mientras se tipea).

/** IVA chileno. Un solo lugar donde cambiarlo si alguna vez cambia. */
export const IVA = 0.19;

export type ItemValorizado = { valor_unitario: number };

export type Totales = {
  subtotal: number;
  iva: number;
  total: number;
};

/**
 * Totales de una cotización: cada línea vale su `valor_unitario` (no hay
 * cantidad). Se redondea LÍNEA POR LÍNEA antes de sumar, no al final: así el
 * subtotal es exactamente la suma de lo que el usuario ve escrito en cada
 * fila. Sumar primero y redondear después puede dar un peso de diferencia
 * contra la lista impresa, y esa diferencia no se puede explicar.
 *
 * `exento`: las cotizaciones exentas (y las facturas tipo 34) no llevan IVA.
 */
export function calcularTotales(items: ItemValorizado[], exento: boolean): Totales {
  const subtotal = items.reduce((acc, it) => acc + Math.round(it.valor_unitario), 0);
  const iva = exento ? 0 : Math.round(subtotal * IVA);
  return { subtotal, iva, total: subtotal + iva };
}

/**
 * El camino inverso, el de las facturas: acá se conoce el TOTAL (lo que se le
 * cobra al cliente) y hay que descomponerlo en neto + IVA.
 *
 * No es `total * 0.19`: sobre un total que ya incluye IVA, eso da de más. El
 * neto sale de dividir por 1.19, y el IVA es la diferencia — nunca un segundo
 * redondeo, para que neto + iva dé exactamente el total y no un peso al lado.
 *
 * `afecta`: solo el DTE 33 (factura afecta) lleva IVA. La 34 es exenta.
 */
export function desglosarTotal(total: number, afecta: boolean): Totales {
  if (!afecta) return { subtotal: total, iva: 0, total };
  const subtotal = Math.round(total / (1 + IVA));
  return { subtotal, iva: total - subtotal, total };
}
