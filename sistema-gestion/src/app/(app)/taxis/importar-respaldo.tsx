"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { importarRespaldoTaxis, type ResumenImport } from "./actions";
import { isDemo } from "@/lib/demo";

const LOTE = 200; // límite de tamaño de las Server Actions

type Estado =
  | { fase: "idle" }
  | { fase: "trabajando"; hecho: number; total: number }
  | { fase: "listo"; resumen: ResumenImport }
  | { fase: "error"; mensaje: string };

// Importa el respaldo JSON de la app antigua de taxis (menú ⚙ → Respaldar).
// Acepta el archivo con envoltorio {app, data:{servicios,...}} o el JSON plano.
export function ImportarRespaldo() {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "idle" });
  const demo = isDemo();

  async function onArchivo(file: File) {
    try {
      const json = JSON.parse(await file.text());
      const servicios: unknown[] | undefined =
        json?.data?.servicios ?? json?.servicios;
      if (!Array.isArray(servicios) || servicios.length === 0) {
        setEstado({
          fase: "error",
          mensaje: "El archivo no contiene servicios (¿es el respaldo de la app de taxis?).",
        });
        return;
      }

      const total = servicios.length;
      const acumulado: ResumenImport = {
        creados: 0,
        duplicados: 0,
        invalidos: 0,
        sinMatchEmpresa: 0,
        sinMatchChofer: 0,
      };
      for (let i = 0; i < total; i += LOTE) {
        setEstado({ fase: "trabajando", hecho: i, total });
        const r = await importarRespaldoTaxis(servicios.slice(i, i + LOTE));
        if (r.error) {
          setEstado({ fase: "error", mensaje: r.error });
          return;
        }
        acumulado.creados += r.creados;
        acumulado.duplicados += r.duplicados;
        acumulado.invalidos += r.invalidos;
        acumulado.sinMatchEmpresa += r.sinMatchEmpresa;
        acumulado.sinMatchChofer += r.sinMatchChofer;
      }
      setEstado({ fase: "listo", resumen: acumulado });
      router.refresh();
    } catch {
      setEstado({ fase: "error", mensaje: "No se pudo leer el archivo (JSON inválido)." });
    }
  }

  const ocupado = estado.fase === "trabajando";

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = ""; // permite re-elegir el mismo archivo
          if (f) onArchivo(f);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ocupado || demo}
        title={
          demo
            ? "No disponible en modo demostración"
            : "Importar el respaldo JSON de la app antigua de taxis"
        }
        className={buttonClass({ variant: "outline" })}
      >
        {ocupado ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Importar respaldo
      </button>

      {estado.fase === "trabajando" ? (
        <span className="text-xs text-muted">
          Importando… {estado.hecho}/{estado.total}
        </span>
      ) : estado.fase === "listo" ? (
        <span className="text-xs text-muted">
          <span className="font-medium text-ok">{estado.resumen.creados} importados</span>
          {estado.resumen.duplicados > 0 ? ` · ${estado.resumen.duplicados} ya existían` : ""}
          {estado.resumen.sinMatchEmpresa > 0
            ? ` · ${estado.resumen.sinMatchEmpresa} sin match de empresa`
            : ""}
          {estado.resumen.sinMatchChofer > 0
            ? ` · ${estado.resumen.sinMatchChofer} sin match de chofer`
            : ""}
          {estado.resumen.invalidos > 0 ? ` · ${estado.resumen.invalidos} inválidos` : ""}
        </span>
      ) : estado.fase === "error" ? (
        <span className="text-xs text-danger">{estado.mensaje}</span>
      ) : null}
    </div>
  );
}
