"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  guardarChofer,
  eliminarChofer,
  desactivarChofer,
  tieneHistorialChofer,
  guardarCategoriasChofer,
  type FormState,
} from "./actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buttonClass } from "@/components/ui/button";
import { VencimientoBadge } from "@/components/ui/badge";
import { FotoUploader } from "./foto-uploader";
import { LicenciaForm } from "./licencia-form";
import { Trash2 } from "lucide-react";
import { VEHICULO_CATEGORIAS, type Chofer } from "@/types/db";
import { EstadoGuardado } from "@/components/ui/estado-guardado";

// Diálogo al eliminar un chofer: distingue "ya no trabaja aquí" (se
// desactiva, se conserva todo) de "eliminar todo el registro" (borrado real,
// avisando antes si tiene historial de viajes asignados).
function EliminarChoferDialog({
  chofer,
  onClose,
}: {
  chofer: Chofer;
  onClose: () => void;
}) {
  const [historial, setHistorial] = useState<boolean | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [desactivarState, desactivarAction, desactivarPending] = useActionState<
    FormState,
    FormData
  >(desactivarChofer, {});
  const [eliminarState, eliminarActionState, eliminarPending] = useActionState<
    FormState,
    FormData
  >(eliminarChofer, {});

  useEffect(() => {
    let vivo = true;
    tieneHistorialChofer(chofer.id).then((tiene) => {
      if (vivo) setHistorial(tiene);
    });
    return () => {
      vivo = false;
    };
  }, [chofer.id]);

  useEffect(() => {
    if (desactivarState.ok) onClose();
  }, [desactivarState.ok, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Eliminar ${chofer.nombre}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scale-in w-full max-w-md rounded-[18px] bg-white p-5 shadow-card"
      >
        <p className="text-base font-semibold">¿Qué quieres hacer con {chofer.nombre}?</p>
        {historial ? (
          <p className="mt-1.5 text-sm text-warn">
            Este chofer tiene viajes asignados en su historial.
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <form action={desactivarAction}>
            <input type="hidden" name="id" value={chofer.id} />
            <button
              type="submit"
              disabled={desactivarPending}
              className="w-full rounded-xl border border-border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-background disabled:opacity-50"
            >
              Ya no trabaja aquí
              <span className="block text-xs font-normal text-muted">
                Se marca como inactivo. Se conserva junto con su historial.
              </span>
            </button>
          </form>

          {!confirmarBorrado ? (
            <button
              type="button"
              onClick={() => setConfirmarBorrado(true)}
              className="w-full rounded-xl border border-danger/20 bg-white px-4 py-3 text-left text-sm font-medium text-danger hover:bg-danger-bg"
            >
              Eliminar todo el registro
              <span className="block text-xs font-normal text-danger/80">
                Borra al chofer del sistema. No se puede deshacer.
              </span>
            </button>
          ) : (
            <div className="rounded-xl border border-danger/20 bg-danger-bg p-3">
              <p className="text-sm text-danger">
                ¿Confirmas eliminar a {chofer.nombre} y todo su registro
                {historial ? "? Su historial de viajes quedará sin chofer asignado." : "?"}
              </p>
              <form action={eliminarActionState} className="mt-2">
                <input type="hidden" name="id" value={chofer.id} />
                <button
                  type="submit"
                  disabled={eliminarPending}
                  className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-[#a32a21] disabled:opacity-50"
                >
                  Sí, eliminar definitivamente
                </button>
              </form>
            </div>
          )}
        </div>

        {desactivarState.error ? (
          <p className="mt-3 text-sm text-danger">{desactivarState.error}</p>
        ) : null}
        {eliminarState.error ? (
          <p className="mt-3 text-sm text-danger">{eliminarState.error}</p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm text-muted hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}

// Líneas de trabajo del chofer (puede tener varias a la vez, a diferencia
// del vehículo). Autoguardado: cada cambio reemplaza el set completo.
function CategoriasChofer({
  choferId,
  categorias,
}: {
  choferId: string;
  categorias: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    guardarCategoriasChofer,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  function autoguardar() {
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="id" value={choferId} />
      {/* justify-center y gap más ancho: las categorías son pocas y cortas, así
          que alineadas a la izquierda dejaban la mitad derecha de la caja en
          blanco. Centradas ocupan el medio y la caja se ve pareja. */}
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
        {Object.entries(VEHICULO_CATEGORIAS).map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              name="categorias"
              value={value}
              defaultChecked={categorias.includes(value)}
              onChange={autoguardar}
            />
            {label}
          </label>
        ))}
      </div>
      {state.error ? (
        <p className="mt-2 text-center text-sm text-danger">{state.error}</p>
      ) : null}
    </form>
  );
}

export function ChoferPanel({
  chofer,
  categorias,
}: {
  chofer: Chofer;
  categorias: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarChofer,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `chofer-form-${chofer.id}`;
  const [eliminarAbierto, setEliminarAbierto] = useState(false);

  // Guarda automáticamente cuando el foco sale del formulario (o de las notas).
  function autoguardar() {
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
                <Checkbox
                  name="activo"
                  defaultChecked={chofer.activo}
                  onChange={autoguardar}
                />
                Activo
              </label>
            </div>
            {state.error ? (
              <p className="text-sm text-danger">{state.error}</p>
            ) : null}
          </div>
        </form>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setEliminarAbierto(true)}
            className={buttonClass({ variant: "dangerOutline", size: "sm" })}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
          {eliminarAbierto ? (
            <EliminarChoferDialog
              chofer={chofer}
              onClose={() => setEliminarAbierto(false)}
            />
          ) : null}
          <EstadoGuardado pending={pending} ok={state.ok} />
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
            <div className="mt-3 flex flex-1 flex-col border-t border-divider pt-3">
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

      {/* Categorías (líneas de trabajo). Ocupa el ancho completo: al lado tenía
          la caja de "Acceso a la app del chofer", que se fue con encomiendas —
          el chofer ya no tiene cuenta. */}
      <div>
        <p className="mb-2 text-sm font-semibold">Categorías</p>
        <div className="flex items-center justify-center rounded-xl border border-border bg-white p-4">
          <CategoriasChofer choferId={chofer.id} categorias={categorias} />
        </div>
      </div>
    </div>
  );
}
