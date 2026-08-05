"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";
import { confirmarPagosPeriodo } from "./actions";

// Deja registrada la liquidación de todo el periodo de una vez. Lo que se ve
// en la tabla ya está calculado al vuelo; esto lo congela en encomienda_pagos
// con la regla que se usó, para que un cambio de regla posterior no reescriba
// lo que ya se pagó.
export function ConfirmarPagos({ desde, hasta }: { desde: string; hasta: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  function onConfirmar() {
    setError(null);
    setListo(false);
    startTransition(async () => {
      const res = await confirmarPagosPeriodo(desde, hasta);
      if (res.error) setError(res.error);
      else setListo(true);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button onClick={onConfirmar} disabled={pending} size="sm" variant="secondary">
        <CheckCheck className="h-4 w-4" />
        {pending ? "Confirmando…" : "Confirmar pagos del periodo"}
      </Button>
      {error ? (
        <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {listo ? <p className="text-xs text-ok">Liquidación registrada.</p> : null}
    </div>
  );
}
