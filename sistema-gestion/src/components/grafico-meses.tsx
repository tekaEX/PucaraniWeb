import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Vacio } from "@/components/ui/vacio";
import { TrendingUp } from "lucide-react";
import { formatCLP } from "@/lib/format";
import type { MesSerie } from "@/lib/finanzas";

// Tendencia de los últimos meses: barras pareadas de ingresos y egresos, un par
// por mes. Solo dibuja — la serie la calcula lib/finanzas.ts con las MISMAS
// funciones que los KPI de arriba, así que la barra de un mes y su tarjeta no
// pueden discrepar.
//
// Dos series y una sola escala: nunca dos ejes. Son la misma unidad (pesos), así
// que comparten altura y se pueden comparar de un vistazo.
//
// El color no lleva la identidad solo: además de la leyenda, cada barra tiene su
// texto al pasar el mouse y su etiqueta accesible. El par está validado para
// daltonismo (ver --chart-ingresos / --chart-egresos en globals.css).

const SERIES = [
  { clave: "ingresos", label: "Ingresos", color: "var(--chart-ingresos)" },
  { clave: "egresos", label: "Egresos", color: "var(--chart-egresos)" },
] as const;

export function GraficoMeses({ serie, titulo }: { serie: MesSerie[]; titulo: string }) {
  // Con todo en cero, unas barras mínimas dibujadas igual se leen como
  // actividad. Un periodo sin movimiento tiene que decirlo con palabras.
  const hayMovimiento = serie.some((m) => m.ingresos > 0 || m.egresos > 0);
  const max = Math.max(1, ...serie.flatMap((m) => [m.ingresos, m.egresos]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <div className="flex items-center gap-4 text-xs text-muted">
          {SERIES.map((s) => (
            <span key={s.clave} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: s.color }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardBody>
        {!hayMovimiento ? (
          <Vacio
            titulo="Sin ingresos ni egresos en estos meses."
            icono={<TrendingUp className="h-7 w-7" />}
          />
        ) : (
          <div className="flex items-end gap-2 sm:gap-4">
            {serie.map((m) => (
              <div
                key={`${m.periodo.anio}-${m.periodo.mes}`}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-36 w-full items-end justify-center gap-1.5">
                  {SERIES.map((s) => {
                    const valor = m[s.clave];
                    const texto = `${m.label} ${m.periodo.anio} · ${s.label}: ${formatCLP(valor)}`;
                    return (
                      <div
                        key={s.clave}
                        role="img"
                        aria-label={texto}
                        title={texto}
                        className="w-4 rounded-t-md sm:w-6"
                        style={{
                          background: s.color,
                          // Un mes en cero deja el hueco vacío: una barra mínima
                          // dibujada para "que se vea algo" es plata que no existe.
                          height: valor > 0 ? `${Math.max(2, Math.round((valor / max) * 100))}%` : 0,
                        }}
                      />
                    );
                  })}
                </div>
                <span
                  className={
                    m.actual ? "text-xs font-semibold text-foreground" : "text-xs text-muted"
                  }
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
