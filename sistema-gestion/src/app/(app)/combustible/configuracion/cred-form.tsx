"use client";

import { useActionState } from "react";
import { guardarCredencialesSii, type FormState } from "../actions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export function CredForm({ rut, tieneCert }: { rut: string; tieneCert: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarCredencialesSii,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <Field
        label="RUT de la empresa"
        htmlFor="rut"
        hint="RUT del contribuyente ante el SII (ej. 76.123.456-7)."
      >
        <Input id="rut" name="rut" defaultValue={rut} placeholder="76.123.456-7" required />
      </Field>

      <Field
        label="Certificado digital (.pfx)"
        htmlFor="certificado"
        hint={
          tieneCert
            ? "Ya hay un certificado cargado. Sube uno nuevo solo si quieres reemplazarlo."
            : "Archivo .pfx / .p12 de tu firma electrónica. Se guarda en un bucket privado."
        }
      >
        <input
          id="certificado"
          name="certificado"
          type="file"
          accept=".pfx,.p12,application/x-pkcs12"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-foreground hover:file:bg-brand-dark"
        />
      </Field>

      <Field
        label="Clave del certificado"
        htmlFor="password"
        hint={
          tieneCert
            ? "Déjala en blanco para conservar la clave actual."
            : "Se guarda cifrada (AES-256-GCM), nunca en texto plano."
        }
      >
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="off"
        />
      </Field>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      {tieneCert ? (
        <p className="flex items-center gap-2 text-sm text-ok">
          <ShieldCheck className="h-4 w-4" />
          Hay credenciales configuradas.
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        <ShieldCheck className="h-4 w-4" />
        {pending ? "Guardando…" : "Guardar credenciales"}
      </Button>
    </form>
  );
}
