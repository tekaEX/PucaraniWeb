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

export function todayInput(): string {
  return toInputDate(new Date());
}
