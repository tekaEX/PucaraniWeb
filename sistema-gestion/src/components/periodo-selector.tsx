"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

// Selector de periodo global. Guarda la elección en una cookie y refresca
// la página actual (los Server Components la leen y re-filtran los datos).
export function PeriodoSelector({
  anio,
  mes,
}: {
  anio: number;
  mes: number | null;
}) {
  const router = useRouter();

  function aplicar(a: number, m: number | null) {
    const val = `${a}-${m === null ? "ALL" : String(m).padStart(2, "0")}`;
    document.cookie = `periodo=${val}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  function anterior() {
    if (mes === null) return aplicar(anio - 1, null);
    if (mes === 1) return aplicar(anio - 1, 12);
    aplicar(anio, mes - 1);
  }
  function siguiente() {
    if (mes === null) return aplicar(anio + 1, null);
    if (mes === 12) return aplicar(anio + 1, 1);
    aplicar(anio, mes + 1);
  }

  const esAnio = mes === null;
  const label = esAnio ? `Año ${anio}` : `${MESES[mes - 1]} ${anio}`;

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-1 py-0.5">
        <button
          onClick={anterior}
          aria-label="Periodo anterior"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-gray-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[112px] text-center text-sm font-semibold capitalize">
          {label}
        </span>
        <button
          onClick={siguiente}
          aria-label="Periodo siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-gray-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={() => aplicar(anio, esAnio ? new Date().getMonth() + 1 : null)}
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          esAnio
            ? "border-brand bg-brand text-brand-foreground"
            : "border-border bg-white text-foreground hover:bg-gray-50"
        }`}
      >
        {esAnio ? "Ver mes" : "Año completo"}
      </button>
    </div>
  );
}
