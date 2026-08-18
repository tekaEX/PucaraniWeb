"use client";

import { useState } from "react";
import { PlugZap } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { SERVICIOS, type UsoServicio } from "@/lib/sii/servicios";

// "Probar conexión": confirma que la key de SimpleAPI está bien puesta y
// muestra cuánto queda de cada servicio en el mes.
//
// Se dispara a mano y no al cargar la página a propósito: consultar en cada
// render agregaría una llamada externa a una pantalla que se abre seguido, y el
// dato solo interesa cuando alguien lo va a mirar.
export function EstadoSimpleApi() {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servicios, setServicios] = useState<UsoServicio[] | null>(null);

  async function probar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/sii/estado");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo consultar SimpleAPI.");
        setServicios(null);
        return;
      }
      setServicios(data.servicios ?? []);
    } catch {
      setError("Error de red al consultar SimpleAPI.");
      setServicios(null);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={probar}
          disabled={cargando}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          <PlugZap className="h-4 w-4" />
          {cargando ? "Consultando…" : "Probar conexión"}
        </button>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {servicios ? (
        servicios.length === 0 ? (
          <p className="text-sm text-muted">SimpleAPI no informó servicios.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Servicio</th>
                  <th className="px-3 py-2 font-medium text-right">Usado</th>
                  <th className="px-3 py-2 font-medium text-right">Tope del mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {servicios.map((s) => {
                  // Se avisa desde el 80%: el tope es mensual y no se acumula,
                  // así que quedarse corto a fin de mes es dejar de facturar.
                  const apretado = s.maximo > 0 && s.uso / s.maximo >= 0.8;
                  return (
                    <tr key={s.servicio}>
                      <td className="px-3 py-2">{SERVICIOS[s.servicio] ?? s.servicio}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${apretado ? "font-medium text-warn" : ""}`}
                      >
                        {s.uso}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.maximo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Los topes son mensuales, se reinician el día 1 y no se acumulan.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
