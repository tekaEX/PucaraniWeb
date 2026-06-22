import { formatCLP, formatDate } from "@/lib/format";
import { FACTURA_ESTADOS, montoFactura } from "@/types/db";
import type { FacturasInforme } from "@/lib/queries";

// Vista previa del informe, con el mismo aspecto que el PDF/Excel.
export function InformePreview({ data }: { data: FacturasInforme }) {
  const { empresa, facturas, periodoLabel, empresaLabel, total } = data;
  const logo = empresa?.logo_url || "/logo.png";
  const empresaLine = [empresa?.direccion, empresa?.ciudad]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm sm:p-7">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 border-b-2 border-brand pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Logo" className="h-12 w-auto" />
          <div>
            <div className="font-semibold text-brand">
              {empresa?.nombre ?? "Transportes Pucarani"}
            </div>
            {empresaLine ? (
              <div className="text-xs text-muted">{empresaLine}</div>
            ) : null}
            {empresa?.telefono ? (
              <div className="text-xs text-muted">Teléfono: {empresa.telefono}</div>
            ) : null}
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-lg font-bold">Informe de servicios</div>
          <div className="text-sm text-muted">Período: {periodoLabel}</div>
          <div className="text-sm text-muted">Empresa: {empresaLabel}</div>
        </div>
      </div>

      {/* Tabla */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand text-left text-xs text-white">
            <tr>
              <th className="px-3 py-2 font-semibold">Fecha</th>
              <th className="px-3 py-2 font-semibold">Empresa</th>
              <th className="px-3 py-2 font-semibold">Descripción</th>
              <th className="px-3 py-2 font-semibold">N° Fact.</th>
              <th className="px-3 py-2 font-semibold">OC</th>
              <th className="px-3 py-2 font-semibold">Estado</th>
              <th className="px-3 py-2 text-right font-semibold">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {facturas.map((f, i) => (
              <tr key={f.id} className={i % 2 ? "bg-gray-50" : ""}>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(f.fecha)}</td>
                <td className="px-3 py-2">{f.cliente?.nombre ?? "—"}</td>
                <td className="px-3 py-2">{f.descripcion ?? "—"}</td>
                <td className="px-3 py-2">{f.numero ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{f.orden_compra ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{FACTURA_ESTADOS[f.estado]}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCLP(montoFactura(f))}
                </td>
              </tr>
            ))}
            {facturas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No hay servicios con esos filtros.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Total */}
      <div className="mt-3 flex items-center justify-end gap-10 border-t-2 border-brand pt-3">
        <span className="text-base font-bold">TOTAL</span>
        <span className="w-32 text-right text-lg font-bold tabular-nums">
          {formatCLP(total)}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">{facturas.length} servicio(s).</p>
    </div>
  );
}
