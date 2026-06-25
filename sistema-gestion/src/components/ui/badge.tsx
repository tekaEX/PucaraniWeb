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
  gray: { wrap: "bg-[#ececef] text-[#6e6e73]", dot: "#86868b" },
  blue: { wrap: "bg-info-bg text-info", dot: "var(--info)" },
  green: { wrap: "bg-ok-bg text-ok", dot: "var(--ok)" },
  amber: { wrap: "bg-warn-bg text-warn", dot: "var(--warn)" },
  red: { wrap: "bg-danger-bg text-danger", dot: "var(--danger)" },
  violet: { wrap: "bg-[#ece8f8] text-[#5b3aa8]", dot: "#5b3aa8" },
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
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
        t.wrap,
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: t.dot }}
        aria-hidden
      />
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
