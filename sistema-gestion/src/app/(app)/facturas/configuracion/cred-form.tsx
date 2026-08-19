"use client";

import { useActionState } from "react";
import { guardarCredencialesSii, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export function CredForm({
  rut,
  rutCertificado,
  numeroResolucion,
  fechaResolucion,
  tieneCert,
}: {
  rut: string;
  rutCertificado: string;
  numeroResolucion: string;
  fechaResolucion: string;
  tieneCert: boolean;
}) {
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

      {/* Estos dos RUT casi nunca son el mismo, y confundirlos hace que el SII
          rechace el envío diciendo otra cosa. */}
      <Field
        label="RUT del titular del certificado"
        htmlFor="rut_certificado"
        hint="La PERSONA dueña de la firma electrónica (el representante o el contador), no la empresa."
      >
        <Input
          id="rut_certificado"
          name="rut_certificado"
          defaultValue={rutCertificado}
          placeholder="12.345.678-9"
        />
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

      {/* La resolución viaja en la carátula de CADA envío al SII. Los dos datos
          salen de maullin.sii.cl (certificación) o palena.sii.cl (producción),
          en "Consulta de contribuyentes autorizados". */}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="N° de resolución SII"
          htmlFor="numero_resolucion"
          hint="La que autoriza a emitir. En certificación es 0."
        >
          <Input
            id="numero_resolucion"
            name="numero_resolucion"
            type="number"
            min={0}
            defaultValue={numeroResolucion}
            placeholder="0"
          />
        </Field>

        <Field label="Fecha de la resolución" htmlFor="fecha_resolucion">
          <Input
            id="fecha_resolucion"
            name="fecha_resolucion"
            type="date"
            defaultValue={fechaResolucion}
          />
        </Field>
      </div>

      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}

      {tieneCert ? (
        <p className="flex items-center gap-2 text-sm text-ok">
          <ShieldCheck className="h-4 w-4" />
          Hay credenciales configuradas.
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <Button type="submit" disabled={pending}>
          <ShieldCheck className="h-4 w-4" />
          {pending ? "Guardando…" : "Guardar credenciales"}
        </Button>
      </div>
    </form>
  );
}
