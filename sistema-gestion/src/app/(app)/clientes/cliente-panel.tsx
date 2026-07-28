"use client";

import { useActionState, useRef } from "react";
import { guardarCliente, eliminarCliente, type FormState } from "./actions";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InitialsAvatar } from "@/components/ui/avatar";
import { EstadoCuenta } from "@/components/estado-cuenta";
import { Trash2, Check, Loader2 } from "lucide-react";
import type { CuentaCliente } from "@/lib/cobranza";
import type { Cliente } from "@/types/db";

export function ClientePanel({
  cliente,
  cuenta,
}: {
  cliente: Cliente;
  cuenta: CuentaCliente;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarCliente,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `cliente-form-${cliente.id}`;

  function autoguardar() {
    formRef.current?.requestSubmit();
  }
  function onBlurForm(e: React.FocusEvent<HTMLFormElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) autoguardar();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <form
          id={formId}
          ref={formRef}
          action={formAction}
          onBlur={onBlurForm}
          className="flex flex-1 items-start gap-4"
        >
          <input type="hidden" name="id" value={cliente.id} />
          <InitialsAvatar name={cliente.nombre} size={56} />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                name="nombre"
                defaultValue={cliente.nombre}
                required
                className="max-w-md text-base font-semibold"
              />
              <Input
                name="codigo"
                defaultValue={cliente.codigo ?? ""}
                placeholder="Código"
                className="w-32 uppercase"
              />
            </div>
            <div className="grid max-w-2xl gap-2 sm:grid-cols-2">
              <Input name="rut" defaultValue={cliente.rut ?? ""} placeholder="RUT" />
              <Input
                name="direccion"
                defaultValue={cliente.direccion ?? ""}
                placeholder="Dirección"
              />
              <Input
                name="contacto_nombre"
                defaultValue={cliente.contacto_nombre ?? ""}
                placeholder="Contacto (nombre)"
              />
              <Input
                name="contacto_telefono"
                defaultValue={cliente.contacto_telefono ?? ""}
                placeholder="Contacto (teléfono)"
              />
              <Input
                name="contacto_email"
                type="email"
                defaultValue={cliente.contacto_email ?? ""}
                placeholder="Contacto (correo)"
                className="sm:col-span-2"
              />
            </div>
            {state.error ? (
              <p className="text-sm text-danger">{state.error}</p>
            ) : null}
          </div>
        </form>

        <div className="flex flex-col items-end gap-2">
          <ConfirmForm
            action={eliminarCliente}
            mensaje={`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`}
          >
            <input type="hidden" name="id" value={cliente.id} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          </ConfirmForm>
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

      <div>
        <p className="mb-2 text-sm font-semibold">Notas</p>
        <Textarea
          name="notas"
          form={formId}
          defaultValue={cliente.notas ?? ""}
          onBlur={autoguardar}
          placeholder="Notas del cliente…"
          className="min-h-20"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Estado de cuenta</p>
        <EstadoCuenta cuenta={cuenta} />
      </div>
    </div>
  );
}
