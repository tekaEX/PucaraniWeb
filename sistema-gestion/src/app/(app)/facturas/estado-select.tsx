"use client";

import { actualizarEstadoFactura } from "./actions";
import { FACTURA_ESTADOS, type FacturaEstado } from "@/types/db";

const clases: Record<FacturaEstado, string> = {
  en_proceso: "bg-[#ececef] text-[#6e6e73] border-transparent",
  por_facturar: "bg-info-bg text-info border-transparent",
  facturada: "bg-warn-bg text-warn border-transparent",
  pagada: "bg-ok-bg text-ok border-transparent",
};

// Selector de estado inline: al cambiarlo, guarda automáticamente.
export function EstadoFacturaSelect({
  id,
  estado,
}: {
  id: string;
  estado: FacturaEstado;
}) {
  return (
    <form action={actualizarEstadoFactura}>
      <input type="hidden" name="id" value={id} />
      <select
        name="estado"
        defaultValue={estado}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand/40 ${clases[estado]}`}
        title="Cambiar estado"
      >
        {Object.entries(FACTURA_ESTADOS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </form>
  );
}
