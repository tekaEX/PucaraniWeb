// Utilidades de formato para Chile (es-CL): pesos chilenos y fechas.

export function formatCLP(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatNumber(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

function toDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  // Fechas tipo "2026-06-16" se interpretan en hora local (evita corrimiento de día).
  return new Date(d.length === 10 ? `${d}T00:00:00` : d);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(toDate(d));
}

// Distancia corta, para navegación: metros hasta el kilómetro y de ahí en km
// con un decimal (nadie necesita "1348 m" manejando).
export function formatDistancia(metros: number): string {
  return metros >= 1000 ? `${(metros / 1000).toFixed(1)} km` : `${Math.round(metros)} m`;
}

// Duración de un trayecto, redondeada al minuto: "45 min", "1 h 20 min". Los
// segundos no le sirven a nadie para planificar una jornada de reparto.
export function formatDuracion(segundos: number): string {
  const minutos = Math.max(1, Math.round(segundos / 60));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

// Hora local (Chile) de un timestamp — para listas donde la fecha ya se
// sabe de antemano (ej. "pendientes de hoy") y lo útil es a qué hora entró.
export function formatTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  }).format(toDate(d));
}

export function formatDateLong(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(toDate(d));
}

// Para inputs <input type="date"> que requieren formato YYYY-MM-DD.
export function toInputDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = toDate(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Valor "hoy" para un <input type="date">. Sale de hoyChile() y no del reloj
// del proceso: estos formularios son componentes de cliente, pero Next igual
// los renderiza primero en el servidor (UTC), así que pasadas las ~20:00 de
// Chile el campo aparecía con la fecha de MAÑANA. Un viaje o un servicio de
// taxi cargados de noche quedaban con fecha del día siguiente —y, el último día
// del mes, en el periodo equivocado.
export function todayInput(): string {
  return hoyChile();
}

// Suma (o resta, con negativo) días a una fecha "YYYY-MM-DD" y devuelve el
// resultado en el mismo formato — para la navegación día a día de Encomiendas.
export function sumarDias(fecha: string, dias: number): string {
  const d = toDate(fecha);
  d.setDate(d.getDate() + dias);
  return toInputDate(d);
}

// Fecha de HOY (YYYY-MM-DD) en la zona horaria del negocio (Chile).
// En el servidor (Vercel corre en UTC) usar toISOString() daría la fecha de
// MAÑANA pasadas las ~20:00 de Chile, corriendo pagos/viajes al mes siguiente.
// Toda fecha "hoy" que se persista debe salir de aquí.
export function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Nombre seguro para un archivo que se descarga.
 *
 * Va en la cabecera `Content-Disposition: attachment; filename="…"`, así que
 * una comilla o un salto de línea en el nombre de un cliente no solo rompen el
 * nombre: rompen la cabecera. Y los acentos, mandados crudos, llegan como
 * caracteres raros según el navegador.
 *
 * Estaba resuelto de tres formas distintas en los cinco endpoints de
 * exportación. La que menos servía era `replace(/[^\w-]/g, "")`, que borra las
 * letras acentuadas en vez de reemplazarlas: "Ñuñoa" quedaba en "uoa".
 *
 * Acá se descompone primero (NFD separa la letra de su tilde), se sacan los
 * diacríticos y recién después se filtra: "Ñuñoa" queda "Nunoa", que se lee.
 */
export function nombreArchivo(base: string, fallback = "documento"): string {
  const limpio = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return limpio || fallback;
}
