import * as React from "react";
import { cn } from "@/lib/utils";
import {
  COTIZACION_ESTADOS,
  FACTURA_ESTADOS_DERIVADOS,
  VIAJE_ESTADOS,
  viajePorFacturar,
  type CotizacionEstado,
  type FacturaEstadoDerivado,
  type Viaje,
} from "@/types/db";
import { ESTADOS_SII, type EstadoSii } from "@/lib/sii/estado";
import { evaluarVenc } from "@/lib/vencimientos";
import { formatDate } from "@/lib/format";

export const tones = {
  gray: { wrap: "bg-[#ececef] text-[#6e6e73]", dot: "#86868b" },
  blue: { wrap: "bg-info-bg text-info", dot: "var(--info)" },
  green: { wrap: "bg-ok-bg text-ok", dot: "var(--ok)" },
  amber: { wrap: "bg-warn-bg text-warn", dot: "var(--warn)" },
  red: { wrap: "bg-danger-bg text-danger", dot: "var(--danger)" },
  violet: { wrap: "bg-[#ece8f8] text-[#5b3aa8]", dot: "#5b3aa8" },
} as const;

export type Tone = keyof typeof tones;

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

const facturaTone: Record<FacturaEstadoDerivado, Tone> = {
  borrador: "gray",
  por_cobrar: "amber",
  pagada: "green",
  anulada: "red",
};

export function FacturaBadge({ estado }: { estado: FacturaEstadoDerivado }) {
  return <Badge tone={facturaTone[estado]}>{FACTURA_ESTADOS_DERIVADOS[estado]}</Badge>;
}

// El estado ante el SII va en una pastilla APARTE de la de cobranza, y no
// mezclado con ella, porque son dos preguntas distintas: una es "¿esto se
// cobró?" y la otra "¿esto vale ante el SII?". Se pueden dar juntas y en la
// combinación peligrosa —por cobrar + rechazada— hay que ver las dos, no una
// sola etiqueta que las promedie.
const siiTone: Record<EstadoSii, Tone> = {
  sin_enviar: "gray",
  emitiendo: "blue",
  enviado: "blue",
  en_proceso: "blue",
  aceptado: "green",
  reparos: "amber",
  rechazado: "red",
  error: "red",
  sin_clasificar: "violet",
};

export function SiiBadge({ estado }: { estado: EstadoSii }) {
  return <Badge tone={siiTone[estado]}>{ESTADOS_SII[estado]}</Badge>;
}

// El sub-estado de un viaje realizado se deriva de su factura.
export function ViajeBadge({ viaje }: { viaje: Pick<Viaje, "estado" | "factura_id"> }) {
  if (viaje.estado === "cancelado") return <Badge tone="gray">{VIAJE_ESTADOS.cancelado}</Badge>;
  if (viaje.estado === "programado") return <Badge tone="blue">{VIAJE_ESTADOS.programado}</Badge>;
  if (viajePorFacturar(viaje)) return <Badge tone="amber">Por facturar</Badge>;
  return <Badge tone="green">{VIAJE_ESTADOS.realizado}</Badge>;
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

// Volante de auto. Unicode no tiene un emoji de volante (🛞 es un neumático y
// lucide solo trae el timón de barco), así que va dibujado: aro, centro y los
// tres rayos. Usa currentColor, así queda del mismo azul que la pastilla.
function VolanteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M3 12h6.5M14.5 12H21M12 14.5V21" />
    </svg>
  );
}

// Etiqueta de conductor. El nombre del chofer se muestra igual en Taxis que en
// Viajes: pastilla azul con volante, para reconocerlo de un vistazo entre las
// otras columnas (decisión del dueño, 19-08-2026).
export function ChoferBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium whitespace-nowrap text-info",
        className,
      )}
    >
      <VolanteIcon />
      {children}
    </span>
  );
}
