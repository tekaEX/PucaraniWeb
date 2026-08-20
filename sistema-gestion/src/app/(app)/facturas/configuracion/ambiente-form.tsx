"use client";

import { useActionState, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PALABRA_PRODUCCION } from "@/lib/sii/estado";
import { cambiarAmbienteSii, type FormState } from "./ambiente-actions";

// El cambio de ambiente.
//
// La asimetría es a propósito: volver a certificación es un botón, y pasar a
// producción obliga a desplegar un aviso y escribir una palabra. No es fricción
// gratuita — es la única barrera entre "estoy probando" y "acabo de emitir un
// documento tributario que solo se anula con una nota de crédito".
export function AmbienteForm({ ambiente }: { ambiente: "certificacion" | "produccion" }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    cambiarAmbienteSii,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (ambiente === "produccion") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          La empresa está emitiendo en <strong className="text-danger">producción</strong>. Cada
          factura es un documento tributario real.
        </p>
        <form action={formAction}>
          <input type="hidden" name="ambiente" value="certificacion" />
          <button
            type="submit"
            disabled={pending}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {pending ? "Cambiando…" : "Volver a certificación"}
          </button>
        </form>
        <Mensajes state={state} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        La empresa está en <strong>certificación</strong>. Lo que se emita es de prueba y no tiene
        efecto tributario.
      </p>

      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Pasar a producción…
        </button>
      ) : (
        <form action={formAction} className="space-y-3 rounded-xl border border-danger/30 bg-danger-bg/40 p-3">
          <input type="hidden" name="ambiente" value="produccion" />

          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <div className="space-y-1 text-sm text-danger">
              <p className="font-medium">Esto no es una prueba más.</p>
              <p>
                Desde que cambies, cada factura que emitas es un documento tributario real ante el
                SII. Un folio consumido no vuelve y un documento aceptado solo se anula con una
                nota de crédito, que este sistema todavía no emite.
              </p>
              <p>
                Hacelo solo después de aprobar el set de pruebas del SII y con el certificado, la
                resolución y los folios <strong>de producción</strong> ya cargados.
              </p>
            </div>
          </div>

          <Field
            label={`Escribí ${PALABRA_PRODUCCION} para confirmar`}
            htmlFor="confirmacion"
            hint="Se pide escribirlo porque un botón de confirmar se aprieta sin leer."
          >
            <Input
              id="confirmacion"
              name="confirmacion"
              autoComplete="off"
              placeholder={PALABRA_PRODUCCION}
              required
            />
          </Field>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className={buttonClass({ variant: "danger", size: "sm" })}
            >
              {pending ? "Cambiando…" : "Pasar a producción"}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <Mensajes state={state} />
    </div>
  );
}

/** El resultado se anuncia: cambiar de ambiente no puede pasar en silencio. */
function Mensajes({ state }: { state: FormState }) {
  return (
    <div aria-live="assertive" className="empty:hidden">
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-ok">{state.ok}</p> : null}
    </div>
  );
}
