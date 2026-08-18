import { Badge } from "@/components/ui/badge";
import type { ResumenDocs } from "@/lib/vencimientos";

/**
 * Cómo está la documentación de una lista, arriba de la lista.
 *
 * La campana avisa desde cualquier pantalla, pero no dice cuántos papeles son
 * ni de qué tipo. Acá el dueño ve el estado de la flota (o de los choferes)
 * antes de recorrer las filas, que es el punto de la User Story 5: que el
 * vencimiento sea visible sin ir a buscarlo.
 *
 * `sinDatos` se muestra en gris y separado a propósito: no es un papel vencido,
 * es un papel que nadie cargó — y hasta que se cargue, esa fila no se puede
 * afirmar que esté en regla.
 */
export function DocsResumen({ resumen }: { resumen: ResumenDocs }) {
  const { vencidos, porVencer, sinDatos } = resumen;
  const plural = (n: number, s: string) => (n === 1 ? s : `${s}s`);

  if (vencidos === 0 && porVencer === 0 && sinDatos === 0) {
    return (
      <div className="mb-4">
        <Badge tone="green">Documentación al día</Badge>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {vencidos > 0 ? (
        <Badge tone="red">
          {vencidos} {plural(vencidos, "documento")} {plural(vencidos, "vencido")}
        </Badge>
      ) : null}
      {porVencer > 0 ? (
        <Badge tone="amber">
          {porVencer} por vencer (30 días)
        </Badge>
      ) : null}
      {sinDatos > 0 ? (
        <Badge tone="gray">
          {sinDatos} sin cargar
        </Badge>
      ) : null}
    </div>
  );
}
