import Link from "next/link";
import { FacturaBadge } from "@/components/ui/badge";
import { formatCLP, formatDate } from "@/lib/format";
import { facturaEstadoDerivado } from "@/types/db";
import { DIAS_VENCE, diasDesde, type CuentaCliente } from "@/lib/cobranza";

function Monto({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone}`}>
        {value ? formatCLP(value) : "—"}
      </p>
    </div>
  );
}

// Estado de cuenta de un cliente (ex "Cobranzas"): los 4 montos del ciclo de
// cobro + los viajes por facturar + la tabla de facturas con antigüedad.
export function EstadoCuenta({ cuenta }: { cuenta: CuentaCliente }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Monto label="Por facturar" value={cuenta.pendienteFacturar} />
        <Monto label="Por cobrar" value={cuenta.porCobrar} tone="text-warn" />
        <Monto
          label="Vencido"
          value={cuenta.vencido}
          tone={cuenta.vencido ? "text-danger" : ""}
        />
        <Monto label="Pagado" value={cuenta.pagado} tone={cuenta.pagado ? "text-ok" : ""} />
      </div>

      {cuenta.viajesPendientes.length > 0 ? (
        <div>
          <p className="mb-2 text-sm font-semibold">Viajes por facturar</p>
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {cuenta.viajesPendientes.map((v) => (
                  <tr key={v.id}>
                    <td className="w-28 whitespace-nowrap px-4 py-2.5 text-muted">
                      {formatDate(v.fecha_inicio)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/viajes/${v.id}`} className="hover:underline">
                        {v.descripcion}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatCLP(v.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-semibold">Facturas</p>
        {cuenta.facturas.length === 0 ? (
          <p className="text-sm text-muted">Sin facturas en el periodo.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Emisión</th>
                  <th className="px-4 py-2.5 font-medium">Folio</th>
                  <th className="px-4 py-2.5 font-medium">Viajes incluidos</th>
                  <th className="px-4 py-2.5 font-medium text-right">Monto</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-right">Antigüedad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cuenta.facturas.map((fx) => {
                  const derivado = facturaEstadoDerivado(fx);
                  const dias = fx.fecha_emision ? diasDesde(fx.fecha_emision) : null;
                  const vencida =
                    derivado === "por_cobrar" && dias !== null && dias > DIAS_VENCE;
                  return (
                    <tr key={fx.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                        {fx.fecha_emision ? formatDate(fx.fecha_emision) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/facturas/${fx.id}`} className="hover:underline">
                          {fx.folio ?? "Borrador"}
                        </Link>
                      </td>
                      <td className="max-w-48 truncate px-4 py-2.5">
                        {fx.viajes.length === 0
                          ? "—"
                          : fx.viajes.map((v) => v.descripcion).join(" · ")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {formatCLP(Number(fx.total))}
                      </td>
                      <td className="px-4 py-2.5">
                        <FacturaBadge estado={derivado} />
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {dias !== null ? (
                          <span className={vencida ? "font-medium text-danger" : "text-muted"}>
                            {dias} día{dias === 1 ? "" : "s"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
