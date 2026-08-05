"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  guardarChofer,
  eliminarChofer,
  desactivarChofer,
  tieneHistorialChofer,
  guardarCategoriasChofer,
  invitarChofer,
  reenviarInvitacionChofer,
  type FormState,
  type InvitarState,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button, buttonClass } from "@/components/ui/button";
import { VencimientoBadge } from "@/components/ui/badge";
import { FotoUploader } from "./foto-uploader";
import { LicenciaForm } from "./licencia-form";
import { Trash2, Check, Loader2, Copy, RefreshCw } from "lucide-react";
import { VEHICULO_CATEGORIAS, type Chofer } from "@/types/db";

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
      <div className="flex flex-wrap gap-3">
        {Object.entries(VEHICULO_CATEGORIAS).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="categorias"
              value={value}
              defaultChecked={categorias.includes(value)}
              onChange={autoguardar}
              className="h-4 w-4 accent-brand"
            />
            {label}
          </label>
        ))}
      </div>
      {state.error ? <p className="mt-2 text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}

// Muestra el link de acceso generado, con botón de copiar. No se manda por
// correo automáticamente (eso agota rápido el límite de envío de Supabase
// en el plan gratuito) — el admin lo copia y se lo pasa al chofer por
// donde prefiera (WhatsApp, correo, SMS).
function LinkAcceso({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 truncate bg-transparent text-xs text-muted outline-none"
      />
      <button
        type="button"
        onClick={copiar}
        className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark"
      >
        <Copy className="h-4 w-4" />
        {copiado ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

// Invita al chofer (crea su login con rol "chofer") o, si ya tiene cuenta,
// permite regenerar el link de acceso ("Reenviar invitación") — por si el
// link anterior venció o no le llegó.
function AccesoChofer({ chofer }: { chofer: Chofer }) {
  const [state, formAction, pending] = useActionState<InvitarState, FormData>(
    invitarChofer,
    {},
  );
  const [reenviarState, setReenviarState] = useState<InvitarState>({});
  const [reenviarPending, startReenviar] = useTransition();

  function onReenviar() {
    setReenviarState({});
    startReenviar(async () => {
      setReenviarState(await reenviarInvitacionChofer(chofer.id));
    });
  }

  if (chofer.user_id) {
    return (
      <div>
        <p className="text-sm text-muted">
          Cuenta vinculada{chofer.email ? `: ${chofer.email}` : ""}.
        </p>
        <button
          type="button"
          onClick={onReenviar}
          disabled={reenviarPending}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-dark disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reenviarPending ? "animate-spin" : ""}`} />
          {reenviarPending ? "Generando…" : "Reenviar invitación"}
        </button>
        {reenviarState.error ? (
          <p className="mt-2 text-sm text-danger">{reenviarState.error}</p>
        ) : null}
        {reenviarState.link ? (
          <>
            <p className="mt-2 text-xs text-muted">
              Copia este link y envíaselo al chofer (WhatsApp, correo, SMS):
            </p>
            <LinkAcceso link={reenviarState.link} />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={chofer.id} />
        <Input
          name="email"
          type="email"
          placeholder="correo@ejemplo.com"
          defaultValue={chofer.email ?? ""}
          className="max-w-xs"
          required
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Invitando…" : "Invitar"}
        </Button>
      </div>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.link ? (
        <>
          <p className="text-xs text-muted">
            Cuenta creada. Copia este link y envíaselo al chofer (WhatsApp, correo, SMS):
          </p>
          <LinkAcceso link={state.link} />
        </>
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
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={chofer.activo}
                  onChange={autoguardar}
                  className="h-4 w-4 accent-brand"
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
          <span className="flex h-4 items-center gap-1.5 text-xs text-muted">
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Guardando…
              </>
            ) : state.ok ? (
              <>
                <Check className="h-3.5 w-3.5 text-ok" />
                Guardado
              </>
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

      {/* Categorías (líneas de trabajo) · Acceso a la app del chofer */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Categorías</p>
          <div className="rounded-xl border border-border bg-white p-4">
            <CategoriasChofer choferId={chofer.id} categorias={categorias} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Acceso a la app del chofer</p>
          <div className="rounded-xl border border-border bg-white p-4">
            <AccesoChofer chofer={chofer} />
          </div>
        </div>
      </div>
    </div>
  );
}
