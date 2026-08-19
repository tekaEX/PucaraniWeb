"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import {
  actualizarContrasena,
  type NuevaContrasenaState,
} from "@/app/login/actions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function NuevaContrasenaForm() {
  const [state, formAction, pending] = useActionState<
    NuevaContrasenaState,
    FormData
  >(actualizarContrasena, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Contraseña nueva" htmlFor="password" hint="Mínimo 8 caracteres.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={8}
          required
        />
      </Field>
      <Field label="Repite la contraseña" htmlFor="password2">
        <Input
          id="password2"
          name="password2"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={8}
          required
        />
      </Field>

      {state.error ? (
        <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <KeyRound className="h-4 w-4" />
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
