import { Truck, Wallet, FileText } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Vacio } from "@/components/ui/vacio";
import { GraficoMeses } from "@/components/grafico-meses";
import { formatCLP } from "@/lib/format";
import { etiquetaPeriodo, type Periodo } from "@/lib/periodo";
import {
  egresosPorCategoria,
  egresosPorVehiculo,
  ingresosPorCliente,
  serieMensual,
  type DatosFinancieros,
} from "@/lib/finanzas";
import { GASTO_CATEGORIAS, type GastoCategoria } from "@/types/db";

// Secciones financieras del Dashboard: tendencia de los últimos meses, egresos
// por vehículo y por categoría, e ingresos cobrados por cliente.
//
// No consulta nada. Antes hacía SIETE consultas propias —sobre las mismas
// tablas que el dashboard ya había leído para sus KPI— y derivaba de nuevo qué
// cuenta como ingreso y como egreso. Hoy recibe el conjunto de filas que cargó
// lib/finanzas-server.ts y le pide los cortes a lib/finanzas.ts: una sola
// definición de cada cifra, y la mitad de viajes a la base.

const catChip: Record<GastoCategoria, string> = {
  combustible: "bg-warn-bg text-warn",
  mantencion: "bg-info-bg text-info",
  seguros: "bg-[#ece8f8] text-[#5b3aa8]",
  otros: "bg-[#ececef] text-[#6e6e73]",
};

export function FinanzasSecciones({
  datos,
  periodo,
  meses,
}: {
  datos: DatosFinancieros;
  periodo: Periodo;
  /** Los meses del gráfico, en el orden en que se dibujan. */
  meses: Periodo[];
}) {
  const serie = serieMensual(datos, meses, periodo);
  const porCategoria = egresosPorCategoria(datos, periodo);
  const porVehiculo = egresosPorVehiculo(datos, periodo);
  const porCliente = ingresosPorCliente(datos, periodo);
  const maxVeh = Math.max(1, ...porVehiculo.map((x) => x.total));
  const sinEgresos = `Sin egresos en ${etiquetaPeriodo(periodo).toLowerCase()}.`;

  return (
    <div className="space-y-4">
      <GraficoMeses serie={serie} titulo={`Últimos ${meses.length} meses`} />

      {/* Egresos por vehículo y por categoría */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Egresos por vehículo</CardTitle>
          </CardHeader>
          <CardBody>
            {porVehiculo.length === 0 ? (
              <Vacio titulo={sinEgresos} icono={<Truck className="h-7 w-7" />} />
            ) : (
              <div className="space-y-3">
                {porVehiculo.map((v) => (
                  <div key={v.clave}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-mono">{v.clave}</span>
                      <span className="tabular-nums text-muted">{formatCLP(v.total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border/40">
                      <div
                        className="h-1.5 rounded-full bg-brand"
                        style={{ width: `${Math.round((v.total / maxVeh) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Egresos por categoría</CardTitle>
          </CardHeader>
          <CardBody>
            {porCategoria.length === 0 ? (
              <Vacio titulo={sinEgresos} icono={<Wallet className="h-7 w-7" />} />
            ) : (
              <div className="flex flex-col gap-2.5">
                {porCategoria.map((x) => (
                  <div
                    key={x.categoria}
                    className={`flex items-center justify-between rounded-full px-3.5 py-2 text-sm font-medium ${catChip[x.categoria]}`}
                  >
                    <span>{GASTO_CATEGORIAS[x.categoria]}</span>
                    <span className="tabular-nums">{formatCLP(x.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Ingresos por cliente */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Ingresos cobrados por cliente</CardTitle>
        </CardHeader>
        {porCliente.length === 0 ? (
          <CardBody>
            <Vacio
              titulo="No hay facturas pagadas ni servicios de taxi en este periodo."
              icono={<FileText className="h-7 w-7" />}
            />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {porCliente.map((c) => (
                  <tr key={c.clave} className="hover:bg-background">
                    <td className="px-5 py-3">{c.clave}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium text-ok">
                      {formatCLP(c.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
