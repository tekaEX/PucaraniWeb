"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
import { InitialsAvatar } from "@/components/ui/avatar";
import { formatCLP } from "@/lib/format";
import { ClientePanel } from "./cliente-panel";
import { cuentaVacia, type CuentaCliente } from "@/lib/cobranza";
import type { Cliente } from "@/types/db";

export function ClienteAccordion({
  clientes,
  cuentas,
}: {
  clientes: Cliente[];
  cuentas: Record<string, CuentaCliente>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead className="bg-background text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="px-4 py-3 font-medium">Nombre</th>
          <th className="px-4 py-3 font-medium">Código</th>
          <th className="px-4 py-3 font-medium">RUT</th>
          <th className="px-4 py-3 font-medium">Contacto</th>
          <th className="px-4 py-3 font-medium text-right">Ingresos</th>
          <th className="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {clientes.map((c) => {
          const open = openId === c.id;
          const cuenta = cuentas[c.id] ?? cuentaVacia(c.id, c.nombre);
          return (
            <Fragment key={c.id}>
              <tr
                onClick={() => setOpenId(open ? null : c.id)}
                className="cursor-pointer transition-colors hover:bg-brand-soft/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={c.nombre} size={32} />
                    <span className="font-semibold text-foreground">{c.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3 uppercase text-muted">{c.codigo ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{c.rut ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {c.contacto_nombre ?? c.contacto_telefono ?? c.contacto_email ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {cuenta.pagado + cuenta.taxis > 0 ? (
                    <span className="text-ok">
                      {formatCLP(cuenta.pagado + cuenta.taxis)}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={6} className="bg-background px-4 py-5">
                    <div className="animate-expand">
                      <ClientePanel cliente={c} cuenta={cuenta} />
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
