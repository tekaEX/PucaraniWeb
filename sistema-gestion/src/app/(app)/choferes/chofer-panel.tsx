"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { guardarChofer, eliminarChofer, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VencimientoBadge } from "@/components/ui/badge";
import { FotoUploader } from "./foto-uploader";
import { LicenciaForm } from "./licencia-form";
import { Trash2, Check, Loader2 } from "lucide-react";
import { isDemo } from "@/lib/demo";
import type { Chofer } from "@/types/db";

export function ChoferPanel({ chofer }: { chofer: Chofer }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarChofer,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `chofer-form-${chofer.id}`;
  const demo = isDemo();
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setGuardado(true);
      const t = setTimeout(() => setGuardado(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Guarda automáticamente cuando el foco sale del formulario (o de las notas).
  function autoguardar() {
    if (demo) return; // en modo demo no se persiste
    formRef.current?.requestSubmit();
  }

  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoguardar();
  }

  return (
    <div className="space-y-5">
      {/* Perfil editable (autoguardado) */}
      <div className="flex items-start gap-3">
        <form
          id={formId}
          ref={formRef}
          action={formAction}
          onBlur={onBlurForm}
          className="flex flex-1 items-start gap-5"
        >
          <input type="hidden" name="id" value={chofer.id} />
          <FotoUploader
            choferId={chofer.id}
            fotoUrl={chofer.foto_url}
            nombre={chofer.nombre}
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Input
              name="nombre"
              defaultValue={chofer.nombre}
              required
              className="max-w-md text-base font-semibold"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Input
                name="rut"
                defaultValue={chofer.rut ?? ""}
                placeholder="RUT"
                className="w-40"
              />
              <Input
                name="telefono"
                defaultValue={chofer.telefono ?? ""}
                placeholder="Teléfono"
                className="w-44"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={chofer.activo}
                  onChange={autoguardar}
                  className="h-4 w-4"
                />
                Activo
              </label>
            </div>
            {state.error && !demo ? (
              <p className="text-sm text-danger">{state.error}</p>
            ) : null}
          </div>
        </form>

        <div className="flex flex-col items-end gap-2">
          <form action={eliminarChofer}>
            <input type="hidden" name="id" value={chofer.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          </form>
          <span className="flex h-4 items-center gap-1.5 text-xs text-muted">
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Guardando…
              </>
            ) : guardado ? (
              <>
                <Check className="h-3.5 w-3.5 text-ok" />
                Guardado
              </>
            ) : demo ? (
              "Autoguardado (no en demo)"
            ) : (
              ""
            )}
          </span>
        </div>
      </div>

      {/* Documentos (izquierda) · Notas (derecha) */}
      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <div className="flex flex-col">
          <p className="mb-2 text-sm font-semibold">Documentos</p>
          <div className="flex flex-1 flex-col rounded-xl border border-border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">Licencia de conducir</p>
                <p className="text-sm text-muted">
                  {chofer.licencia_clase
                    ? `Clases: ${chofer.licencia_clase}`
                    : "Sin clases"}
                  {" · "}
                  {chofer.licencia_numero ?? "Sin número"}
                </p>
              </div>
              <VencimientoBadge fecha={chofer.licencia_vencimiento} />
            </div>
            <div className="mt-3 flex flex-1 flex-col border-t border-[#f0f0f2] pt-3">
              <LicenciaForm chofer={chofer} />
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          <p className="mb-2 text-sm font-semibold">Notas</p>
          <Textarea
            name="notas"
            form={formId}
            defaultValue={chofer.notas ?? ""}
            onBlur={autoguardar}
            placeholder="Notas sobre el chofer…"
            className="min-h-[160px] flex-1"
          />
        </div>
      </div>
    </div>
  );
}
