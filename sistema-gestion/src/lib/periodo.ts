// Periodo global de la app: la matemática PURA. mes: 1-12, o null = año completo.
//
// Leer el periodo elegido es otra cosa y vive en periodo-server.ts, porque sale
// de una cookie y eso solo existe en el servidor. Están separados por el mismo
// motivo que cobranza.ts / cobranza-server.ts: si una sola función que toca
// next/headers vive acá, el módulo entero queda marcado `server-only` y ningún
// componente de cliente puede usar enRango ni etiquetaPeriodo, aunque sean
// aritmética de fechas y strings.
//
// La regla que este módulo NO puede aplicar sola, y que hay que tener presente
// cada vez que se filtra algo por periodo: **cada concepto entra al periodo por
// una fecha distinta**.
//
//   ingresos (facturas)   → fecha_pago
//   por cobrar            → fecha_emision
//   pendiente de facturar → fecha_inicio del viaje
//   servicios de taxi     → fecha (se cobran al momento)
//   gastos de flota       → fecha
//   costos de viaje       → fecha_inicio del viaje
//
// Usar la fecha equivocada no rompe nada visiblemente: devuelve un número
// plausible en el mes equivocado. Por eso está escrito acá arriba.
export type Periodo = { anio: number; mes: number | null };

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Rango de fechas inclusivo [desde, hasta] en formato YYYY-MM-DD.
export function rangoPeriodo(p: Periodo): { desde: string; hasta: string } {
  if (p.mes === null) {
    return { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` };
  }
  const mm = String(p.mes).padStart(2, "0");
  const ultimo = new Date(p.anio, p.mes, 0).getDate();
  return {
    desde: `${p.anio}-${mm}-01`,
    hasta: `${p.anio}-${mm}-${String(ultimo).padStart(2, "0")}`,
  };
}

// ¿La fecha cae dentro del periodo? (para filtrar en memoria)
export function enRango(fecha: string | null | undefined, p: Periodo): boolean {
  if (!fecha) return false;
  const f = fecha.slice(0, 10);
  const { desde, hasta } = rangoPeriodo(p);
  return f >= desde && f <= hasta;
}

export function etiquetaPeriodo(p: Periodo): string {
  return p.mes === null ? `Año ${p.anio}` : `${MESES[p.mes - 1]} ${p.anio}`;
}

// Periodo inmediatamente anterior (mes anterior, o año anterior en vista anual).
export function periodoAnterior(p: Periodo): Periodo {
  if (p.mes === null) return { anio: p.anio - 1, mes: null };
  if (p.mes === 1) return { anio: p.anio - 1, mes: 12 };
  return { anio: p.anio, mes: p.mes - 1 };
}

// Etiqueta corta para comparaciones: "mayo" o "2025".
export function etiquetaCorta(p: Periodo): string {
  return p.mes === null ? String(p.anio) : MESES[p.mes - 1];
}

// Etiqueta de tres letras para el eje del gráfico: "ene". En vista anual, el año.
export function etiquetaMes(p: Periodo): string {
  return p.mes === null ? String(p.anio) : MESES[p.mes - 1].slice(0, 3);
}

/**
 * Los `n` meses que terminan en el periodo elegido, del más viejo al más nuevo.
 * Es la ventana del gráfico de tendencia.
 *
 * `hoy` se pasa (formato YYYY-MM-DD, de hoyChile()) en vez de leer el reloj:
 * el servidor corre en UTC y de noche en Chile allá ya es el día —y a fin de
 * mes, el MES— siguiente. Un gráfico que se adelanta un mes el día 31 muestra
 * una columna vacía y esconde la del mes que se está mirando.
 *
 * En vista anual (mes = null) la ventana termina en el mes en curso si el año
 * elegido es el corriente, y en diciembre si es cualquier otro.
 */
export function mesesVentana(p: Periodo, hoy: string, n = 6): Periodo[] {
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const finMes = p.mes ?? (p.anio === anioHoy ? mesHoy : 12);

  // Aritmética en meses absolutos, sin Date: enero menos uno es diciembre del
  // año anterior y no hay husos horarios de por medio.
  const meses: Periodo[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const absoluto = p.anio * 12 + (finMes - 1) - i;
    meses.push({ anio: Math.floor(absoluto / 12), mes: (absoluto % 12) + 1 });
  }
  return meses;
}

/** ¿Son el mismo mes (o el mismo año, en vista anual)? */
export function mismoPeriodo(a: Periodo, b: Periodo): boolean {
  return a.anio === b.anio && a.mes === b.mes;
}
