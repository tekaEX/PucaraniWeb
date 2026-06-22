"use client";

import { actualizarEstadoFactura } from "./actions";
import { FACTURA_ESTADOS, type FacturaEstado } from "@/types/db";

const clases: Record<FacturaEstado, string> = {
  en_proceso: "bg-gray-100 text-gray-700 border-gray-300",
  por_facturar: "bg-blue-50 text-blue-700 border-blue-300",
  facturada: "bg-amber-100 text-amber-800 border-amber-300",
  pagada: "bg-green-100 text-green-800 border-green-300",
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
