import type { Chofer, Vehiculo } from "@/types/db";

export type VencEstado = "vencido" | "por_vencer" | "ok";

const DIAS_AVISO = 30;

// Evalúa una fecha de vencimiento respecto a hoy.
export function evaluarVenc(
  fecha: string | null | undefined,
  diasAviso = DIAS_AVISO,
): { estado: VencEstado; dias: number } | null {
  if (!fecha) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return { estado: "vencido", dias };
  if (dias <= diasAviso) return { estado: "por_vencer", dias };
  return { estado: "ok", dias };
}

export type Alerta = {
  tipo: "Vehículo" | "Chofer";
  refId: string;
  nombre: string; // patente o nombre del chofer
  documento: string; // "Revisión técnica", "SOAP", etc.
  fecha: string;
  estado: VencEstado;
  dias: number;
};

const DOCS_VEHICULO: { campo: keyof Vehiculo; label: string }[] = [
  { campo: "revision_tecnica_venc", label: "Revisión técnica" },
  { campo: "soap_venc", label: "SOAP (seguro)" },
  { campo: "permiso_circulacion_venc", label: "Permiso de circulación" },
];

// Construye la lista de alertas (solo vencidos o por vencer) a partir de la flota.
export function construirAlertas(
  choferes: Chofer[],
  vehiculos: Vehiculo[],
  diasAviso = DIAS_AVISO,
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const v of vehiculos) {
    for (const doc of DOCS_VEHICULO) {
      const fecha = v[doc.campo] as string | null;
      const ev = evaluarVenc(fecha, diasAviso);
      if (ev && ev.estado !== "ok") {
        alertas.push({
          tipo: "Vehículo",
          refId: v.id,
          nombre: v.patente,
          documento: doc.label,
          fecha: fecha as string,
          estado: ev.estado,
          dias: ev.dias,
        });
      }
    }
  }

  for (const c of choferes) {
    const ev = evaluarVenc(c.licencia_vencimiento, diasAviso);
    if (ev && ev.estado !== "ok") {
      alertas.push({
        tipo: "Chofer",
        refId: c.id,
        nombre: c.nombre,
        documento: "Licencia de conducir",
        fecha: c.licencia_vencimiento as string,
        estado: ev.estado,
        dias: ev.dias,
      });
    }
  }

  // Ordenar: primero los vencidos, luego por días restantes (más urgente primero).
  return alertas.sort((a, b) => a.dias - b.dias);
}
