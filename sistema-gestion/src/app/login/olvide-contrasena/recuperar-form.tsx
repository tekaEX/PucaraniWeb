"use client";

import { useActionState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { enviarRecuperacion, type RecuperarState } from "../actions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<RecuperarState, FormData>(
    enviarRecuperacion,
    {},
  );

  // Enviado el correo, el formulario deja de tener sentido: si sigue en
  // pantalla, se aprieta otra vez y se choca con el límite de envíos de
  // Supabase (2 por hora) sin entender por qué falla.
  if (state.enviado) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-lg border border-ok/20 bg-ok-bg px-3 py-2.5 text-sm text-ok">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Si esa cuenta existe, le enviamos un correo con el enlace para
            elegir una contraseña nueva. Revisa también el correo no deseado.
          </span>
        </p>
        <p className="text-xs text-muted">
          El enlace sirve una sola vez y caduca a la hora.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted">
        Escribe el correo con el que entras al sistema y te mandamos un enlace
        para elegir una contraseña nueva.
      </p>

      <Field label="Correo" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          required
        />
      </Field>

      {state.error ? (
        <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <Mail className="h-4 w-4" />
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
