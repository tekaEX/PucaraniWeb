import * as React from "react";
import { cn } from "@/lib/utils";
import {
  COTIZACION_ESTADOS,
  FACTURA_ESTADOS,
  type CotizacionEstado,
  type FacturaEstado,
} from "@/types/db";
import { evaluarVenc } from "@/lib/vencimientos";
import { formatDate } from "@/lib/format";

const tones = {
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-100 text-green-800 border-green-200",
  amber: "bg-amber-100 text-amber-800 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  violet: "bg-violet-100 text-violet-800 border-violet-200",
} as const;

type Tone = keyof typeof tones;

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const facturaTone: Record<FacturaEstado, Tone> = {
  en_proceso: "gray",
  por_facturar: "blue",
  facturada: "amber",
  pagada: "green",
};

export function FacturaBadge({ estado }: { estado: FacturaEstado }) {
  return <Badge tone={facturaTone[estado]}>{FACTURA_ESTADOS[estado]}</Badge>;
}

const cotizacionTone: Record<CotizacionEstado, Tone> = {
  borrador: "gray",
  enviada: "blue",
  aceptada: "green",
  rechazada: "red",
};

export function CotizacionBadge({ estado }: { estado: CotizacionEstado }) {
  return (
    <Badge tone={cotizacionTone[estado]}>{COTIZACION_ESTADOS[estado]}</Badge>
  );
}

export function VencimientoBadge({ fecha }: { fecha: string | null }) {
  if (!fecha) return <span className="text-xs text-muted">Sin dato</span>;
  const ev = evaluarVenc(fecha);
  if (!ev) return <span className="text-xs text-muted">Sin dato</span>;
  if (ev.estado === "vencido")
    return <Badge tone="red">Vencido · {formatDate(fecha)}</Badge>;
  if (ev.estado === "por_vencer")
    return (
      <Badge tone="amber">
        Vence en {ev.dias} día{ev.dias === 1 ? "" : "s"}
      </Badge>
    );
  return <Badge tone="green">Vigente · {formatDate(fecha)}</Badge>;
}
