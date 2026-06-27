"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { InitialsAvatar } from "@/components/ui/avatar";
import { formatCLP } from "@/lib/format";
import { ClientePanel } from "./cliente-panel";
import type { Cliente, IngresoCliente } from "@/types/db";

export function ClienteAccordion({
  clientes,
  ingresos,
}: {
  clientes: Cliente[];
  ingresos: IngresoCliente[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const porCliente = useMemo(() => {
    const m = new Map<string, IngresoCliente[]>();
    for (const i of ingresos) {
      if (!i.cliente_id) continue;
      const arr = m.get(i.cliente_id) ?? [];
      arr.push(i);
      m.set(i.cliente_id, arr);
    }
    return m;
  }, [ingresos]);

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
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
          const cIngresos = porCliente.get(c.id) ?? [];
          const total = cIngresos.reduce((a, i) => a + Number(i.monto), 0);
          return (
            <Fragment key={c.id}>
              <tr
                onClick={() => setOpenId(open ? null : c.id)}
                className="cursor-pointer transition-colors hover:bg-gray-100/60"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <InitialsAvatar name={c.nombre} size={32} />
                    <span className="font-medium text-foreground">{c.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3 uppercase text-muted">{c.codigo ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{c.rut ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {c.contacto_nombre ?? c.contacto_telefono ?? c.contacto_email ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {total ? formatCLP(total) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronDown
                    className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </td>
              </tr>

              {open ? (
                <tr>
                  <td colSpan={6} className="bg-gray-50/50 px-4 py-5">
                    <ClientePanel cliente={c} ingresos={cIngresos} />
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
