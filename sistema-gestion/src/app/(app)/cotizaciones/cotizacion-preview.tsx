import { formatCLP, formatDate } from "@/lib/format";
import type { Empresa, Cotizacion, CotizacionItem, Cliente } from "@/types/db";

// Vista previa del presupuesto, con el mismo aspecto que el PDF.
export function CotizacionPreview({
  empresa,
  cot,
  items,
}: {
  empresa: Empresa | null;
  cot: Cotizacion & { cliente: Pick<Cliente, "id" | "nombre" | "codigo"> | null };
  items: CotizacionItem[];
}) {
  const logo = empresa?.logo_url || "/logo.png";
  const empresaLine = [empresa?.direccion, empresa?.ciudad]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-border bg-white p-5 shadow-sm sm:p-7">
      {/* Encabezado */}
      <div className="flex items-center justify-between rounded-lg bg-brand px-4 py-3 text-white sm:px-5 sm:py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="Logo" className="h-14 w-auto rounded bg-white p-1" />
        <div className="text-2xl font-bold sm:text-3xl">Presupuesto</div>
      </div>

      {/* Datos empresa / meta */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="text-sm">
          <div className="font-semibold">{empresa?.nombre ?? "Transportes Pucarani"}</div>
          {empresa?.representante ? (
            <div className="text-muted">{empresa.representante}</div>
          ) : null}
          {empresaLine ? <div className="text-muted">{empresaLine}</div> : null}
          {empresa?.giro ? <div className="text-muted">Giro: {empresa.giro}</div> : null}
          {empresa?.telefono ? (
            <div className="text-muted">Teléfono: {empresa.telefono}</div>
          ) : null}
          {empresa?.rut ? <div className="text-muted">RUT: {empresa.rut}</div> : null}
        </div>
        <div className="text-sm sm:text-right">
          <div>
            <span className="text-muted">N°: </span>
            <span className="font-semibold">{cot.numero}</span>
          </div>
          <div>
            <span className="text-muted">Fecha: </span>
            <span className="font-semibold">{formatDate(cot.fecha)}</span>
          </div>
          <div>
            <span className="text-muted">Válido hasta: </span>
            <span className="font-semibold">{formatDate(cot.fecha_validez)}</span>
          </div>
          {cot.autor ? (
            <div>
              <span className="text-muted">Autor: </span>
              <span className="font-semibold">{cot.autor}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Cliente */}
      <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wide text-muted">Presupuesto para</div>
        <div className="font-semibold">{cot.cliente?.nombre ?? "—"}</div>
      </div>

      {cot.titulo ? <div className="mt-4 font-semibold">{cot.titulo}</div> : null}

      {/* Tabla de ítems */}
      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-xs text-white">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Descripción</th>
              <th className="px-3 py-2 text-right font-semibold">Cant.</th>
              <th className="px-3 py-2 text-right font-semibold">V. unitario</th>
              <th className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((it, i) => (
              <tr key={it.id}>
                <td className="px-3 py-2 align-top text-muted">{i + 1}</td>
                <td className="px-3 py-2 align-top whitespace-pre-wrap">{it.descripcion}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">{it.cantidad}</td>
                <td className="px-3 py-2 text-right align-top tabular-nums">
                  {formatCLP(it.valor_unitario)}
                </td>
                <td className="px-3 py-2 text-right align-top tabular-nums">
                  {formatCLP(it.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-end gap-8">
          <span className="text-muted">Subtotal</span>
          <span className="w-28 text-right tabular-nums">{formatCLP(cot.subtotal)}</span>
        </div>
        {!cot.exento_iva ? (
          <div className="flex justify-end gap-8">
            <span className="text-muted">IVA (19%)</span>
            <span className="w-28 text-right tabular-nums">{formatCLP(cot.iva)}</span>
          </div>
        ) : null}
        <div className="flex justify-end gap-8 border-t border-border pt-1 text-base font-bold">
          <span>{cot.exento_iva ? "Total (exento de IVA)" : "Total"}</span>
          <span className="w-28 text-right tabular-nums">{formatCLP(cot.total)}</span>
        </div>
      </div>

      {cot.nota_pie ? (
        <p className="mt-5 border-t border-border pt-3 text-xs text-muted">
          {cot.nota_pie}
        </p>
      ) : null}
    </div>
  );
}
