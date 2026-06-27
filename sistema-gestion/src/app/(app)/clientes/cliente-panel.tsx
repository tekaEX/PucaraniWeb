"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { guardarCliente, eliminarCliente, type FormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InitialsAvatar } from "@/components/ui/avatar";
import { Trash2, Check, Loader2 } from "lucide-react";
import { formatCLP, formatDate } from "@/lib/format";
import { isDemo } from "@/lib/demo";
import type { Cliente, IngresoCliente } from "@/types/db";

export function ClientePanel({
  cliente,
  ingresos,
}: {
  cliente: Cliente;
  ingresos: IngresoCliente[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    guardarCliente,
    {},
  );
  const totalIngresos = ingresos.reduce((a, i) => a + Number(i.monto), 0);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `cliente-form-${cliente.id}`;
  const demo = isDemo();
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setGuardado(true);
      const t = setTimeout(() => setGuardado(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  function autoguardar() {
    if (demo) return;
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
            {state.error && !demo ? (
              <p className="text-sm text-danger">{state.error}</p>
            ) : null}
          </div>
        </form>

        <div className="flex flex-col items-end gap-2">
          <form action={eliminarCliente}>
            <input type="hidden" name="id" value={cliente.id} />
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

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Notas</p>
          <Textarea
            name="notas"
            form={formId}
            defaultValue={cliente.notas ?? ""}
            onBlur={autoguardar}
            placeholder="Notas del cliente…"
            className="min-h-[120px]"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Ingresos cobrados (periodo)</p>
            <span className="text-sm font-semibold tabular-nums text-ok">
              {formatCLP(totalIngresos)}
            </span>
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            {ingresos.length === 0 ? (
              <p className="text-sm text-muted">
                Sin facturas pagadas en el periodo.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {ingresos.map((i) => (
                      <tr key={i.id}>
                        <td className="py-2 whitespace-nowrap text-muted">
                          {formatDate(i.fecha)}
                        </td>
                        <td className="py-2">{i.numero ? `N° ${i.numero}` : "—"}</td>
                        <td className="py-2 text-right tabular-nums font-medium text-ok">
                          {formatCLP(Number(i.monto))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
