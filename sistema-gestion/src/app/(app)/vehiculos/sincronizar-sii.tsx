"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

// Dispara la sincronización de gastos desde el SII (compras del día) y refresca.
export function SincronizarSiiButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sincronizar() {
    setLoading(true);
    setMsg(null);
    try {
      const ahora = new Date();
      const res = await fetch("/api/combustible/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dia: ahora.getDate(),
          mes: ahora.getMonth() + 1,
          anio: ahora.getFullYear(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "No se pudo sincronizar.");
        return;
      }
      setMsg(`Listo: ${data.procesadas ?? 0} (${data.sinAsignar ?? 0} sin asignar).`);
      router.refresh();
    } catch {
      setMsg("Error de red al sincronizar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      <button
        onClick={sincronizar}
        disabled={loading}
        className={buttonClass({ variant: "secondary" })}
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Sincronizando…" : "Sincronizar SII"}
      </button>
    </div>
  );
}
