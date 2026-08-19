"use client";

import { useState, useTransition } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { ConfirmarDialogo } from "@/components/ui/confirmar";
import { emitirFactura, type ResultadoEmision } from "./emitir";

// El botón que manda la factura al SII.
//
// Pide confirmación como cualquier acción destructiva, pero el texto cambia
// según el ambiente y eso no es adorno: en producción el documento es real ante
// el SII y anularlo después cuesta una nota de crédito. Que el diálogo diga
// exactamente qué va a pasar es la última barrera antes de un trámite.
export function EmitirBoton({
  facturaId,
  ambiente,
  listo,
  motivo,
}: {
  facturaId: string;
  ambiente: "certificacion" | "produccion";
  /** false cuando falta el certificado, el CAF o la resolución. */
  listo: boolean;
  motivo?: string;
}) {
  const [preguntando, setPreguntando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const [pendiente, iniciar] = useTransition();

  const produccion = ambiente === "produccion";

  function emitir() {
    setPreguntando(false);
    iniciar(async () => {
      setResultado(await emitirFactura(facturaId));
    });
  }

  if (!listo) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={motivo}>
        <TriangleAlert className="h-3.5 w-3.5" />
        {motivo ?? "Falta configuración del SII para emitir."}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPreguntando(true)}
        disabled={pendiente}
        className={buttonClass({ variant: produccion ? "primary" : "secondary", size: "sm" })}
      >
        <Send className="h-4 w-4" />
        {pendiente ? "Emitiendo…" : produccion ? "Emitir al SII" : "Emitir (certificación)"}
      </button>

      {/* El diálogo es controlado y se monta solo cuando hay algo que
          confirmar; sigue en pantalla mientras la emisión corre, porque es
          larga (tres llamadas al SII) y desaparecer sin decir nada parecería
          que no pasó nada. */}
      {preguntando || pendiente ? (
      <ConfirmarDialogo
        titulo={produccion ? "Emitir documento tributario real" : "Emitir en certificación"}
        mensaje={
          produccion
            ? "Se va a tomar un folio y enviar la factura al SII como documento tributario real. " +
              "Un folio consumido no vuelve, y un documento aceptado solo se anula con una nota de crédito."
            : "Se va a tomar un folio de certificación y enviar la factura al ambiente de prueba del SII. " +
              "No tiene efecto tributario, pero el folio igual se consume."
        }
        textoConfirmar="Emitir"
        pending={pendiente}
        onConfirmar={emitir}
        onCancelar={() => setPreguntando(false)}
      />
      ) : null}

      {resultado?.error ? (
        <p
          className={`mt-2 text-sm ${resultado.folioPerdido ? "text-danger" : "text-warn"}`}
          role="alert"
        >
          {resultado.error}
        </p>
      ) : null}
      {resultado?.ok ? (
        <p className="mt-2 text-sm text-ok" role="status">
          Emitida con folio {resultado.folio}. Track id del SII: {resultado.trackId}.
        </p>
      ) : null}
    </>
  );
}
