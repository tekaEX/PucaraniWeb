// Documentación legal de la flota: qué papel tiene cada vehículo y cada chofer,
// cómo está hoy, y qué de eso hay que avisar.
//
// Es el único lugar donde se define CUÁLES son esos papeles. La lista estaba
// acá para la campana y otra vez, escrita a mano en columnas de tabla, en el
// panel del vehículo y en el formulario: agregar un documento obligaba a
// acordarse de los cuatro lugares. Ahora las pantallas piden `documentos*()` y
// muestran lo que venga.
//
// Las validaciones del registro (patente, año, clases de licencia) viven en
// lib/flota.ts. Acá no se valida nada: se lee el estado de lo ya guardado.

import type { Chofer, Vehiculo } from "@/types/db";
import { hoyChile } from "@/lib/format";

export type VencEstado = "vencido" | "por_vencer" | "ok";

/** El estado de un papel también puede ser "no lo cargaron": un vehículo sin
 *  fecha de revisión técnica no está al día, está sin dato. */
export type EstadoDoc = VencEstado | "sin_datos";

const DIAS_AVISO = 30;

// Evalúa una fecha de vencimiento respecto a hoy.
export function evaluarVenc(
  fecha: string | null | undefined,
  diasAviso = DIAS_AVISO,
): { estado: VencEstado; dias: number } | null {
  if (!fecha) return null;
  // Anclado al día de Chile (el servidor corre en UTC).
  const hoy = new Date(`${hoyChile()}T00:00:00`);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  // Una fecha que no se puede leer NO es un documento vigente. Sin esto, un
  // texto cualquiera caía en el `return "ok"` del final y la pantalla mostraba
  // "Vigente" con un badge verde: el peor error posible acá es el tranquilizador.
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return { estado: "vencido", dias };
  if (dias <= diasAviso) return { estado: "por_vencer", dias };
  return { estado: "ok", dias };
}

/** Un papel concreto de un vehículo o de un chofer, ya evaluado. */
export type Documento = {
  /** Nombre del documento, como lo dice la gente: "Revisión técnica". */
  label: string;
  fecha: string | null;
  estado: EstadoDoc;
  /** Días hasta el vencimiento (negativos si ya pasó); null si no hay fecha. */
  dias: number | null;
};

/** Los papeles del vehículo: el campo donde vive la fecha, su nombre completo
 *  y el corto para encabezados de tabla y formularios angostos. */
export const DOCS_VEHICULO: { campo: keyof Vehiculo; label: string; corto: string }[] = [
  { campo: "revision_tecnica_venc", label: "Revisión técnica", corto: "Rev. técnica" },
  { campo: "soap_venc", label: "SOAP (seguro)", corto: "SOAP" },
  {
    campo: "permiso_circulacion_venc",
    label: "Permiso de circulación",
    corto: "Permiso circ.",
  },
];

export const DOC_LICENCIA = "Licencia de conducir";

/** Los tres papeles del vehículo, en el orden en que se muestran. */
export function documentosVehiculo(
  v: Pick<Vehiculo, "revision_tecnica_venc" | "soap_venc" | "permiso_circulacion_venc">,
  diasAviso = DIAS_AVISO,
): Documento[] {
  return DOCS_VEHICULO.map(({ campo, label }) =>
    documento(label, (v as Partial<Vehiculo>)[campo] as string | null, diasAviso),
  );
}

/** El chofer tiene un solo papel: su licencia. */
export function documentosChofer(
  c: Pick<Chofer, "licencia_vencimiento">,
  diasAviso = DIAS_AVISO,
): Documento[] {
  return [documento(DOC_LICENCIA, c.licencia_vencimiento, diasAviso)];
}

function documento(label: string, fecha: string | null | undefined, diasAviso: number): Documento {
  const ev = evaluarVenc(fecha, diasAviso);
  if (!ev) return { label, fecha: null, estado: "sin_datos", dias: null };
  return { label, fecha: fecha as string, estado: ev.estado, dias: ev.dias };
}

/** Lo urgente primero: es el orden en que hay que mirar los papeles. */
const GRAVEDAD: Record<EstadoDoc, number> = {
  vencido: 0,
  por_vencer: 1,
  sin_datos: 2,
  ok: 3,
};

/**
 * El estado del conjunto es el del peor papel: un bus con el SOAP vencido no
 * está "casi al día" porque los otros dos estén vigentes.
 *
 * "sin_datos" queda entre "por vencer" y "ok" a propósito: un papel que nadie
 * cargó no es una alerta con fecha, pero tampoco es un vehículo en regla.
 */
export function peorEstado(docs: Documento[]): EstadoDoc {
  if (docs.length === 0) return "sin_datos";
  return docs.reduce<EstadoDoc>(
    (peor, d) => (GRAVEDAD[d.estado] < GRAVEDAD[peor] ? d.estado : peor),
    "ok",
  );
}

/**
 * Cómo se nombra una ficha en un desplegable de asignación: "GHPR-34 · papeles
 * vencidos", "Etian · inactivo".
 *
 * Vive acá y no en cada formulario porque el momento en que el vencimiento
 * importa es justo ese —cuando se elige quién sale a la ruta— y tiene que
 * leerse igual en Viajes y en Taxis.
 */
export function marcaDocumentos(
  nombre: string,
  docs: Documento[],
  activo?: boolean | null,
): string {
  const partes: string[] = [];
  if (activo === false) partes.push("inactivo");
  const estado = peorEstado(docs);
  if (estado === "vencido") partes.push("papeles vencidos");
  else if (estado === "por_vencer") partes.push("papeles por vencer");
  else if (estado === "sin_datos") partes.push("papeles sin cargar");
  return partes.length > 0 ? `${nombre} · ${partes.join(", ")}` : nombre;
}

/**
 * La frase de aviso de un papel, o null si no hay nada que avisar.
 *
 * Redactada sin género para que sirva a los cuatro documentos: "SOAP (seguro):
 * venció hace 3 días" y "Revisión técnica: venció hace 3 días".
 */
export function avisoDocumento(nombre: string, doc: Documento): string | null {
  if (doc.estado === "vencido") {
    return `${nombre} · ${doc.label}: venció hace ${Math.abs(doc.dias as number)} día(s).`;
  }
  if (doc.estado === "por_vencer") {
    return `${nombre} · ${doc.label}: vence en ${doc.dias} día(s).`;
  }
  return null;
}

/**
 * Un vehículo dado de baja o un chofer que ya no trabaja acá no tiene papeles
 * que renovar: sus vencimientos son historia, no una tarea. Si siguieran
 * alertando, la campana marcaría para siempre algo que solo se puede callar
 * borrando el registro —y con él, su historial de viajes y gastos.
 *
 * Se toma `activo` distinto de false, no `=== true`: una fila sin el campo
 * (una consulta que no lo pidió) se trata como en uso, que es el lado seguro.
 */
export function enUso(x: { activo?: boolean | null }): boolean {
  return x.activo !== false;
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

/**
 * Construye la lista de alertas a partir de la flota EN USO. Solo entra lo que
 * tiene fecha y ya venció o está por vencer: un papel sin cargar se ve en la
 * ficha (como "sin dato"), pero no puede avisar "vence en N días" de una fecha
 * que no existe.
 */
export function construirAlertas(
  choferes: Chofer[],
  vehiculos: Vehiculo[],
  diasAviso = DIAS_AVISO,
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const v of vehiculos.filter(enUso)) {
    for (const doc of documentosVehiculo(v, diasAviso)) {
      if (doc.estado === "vencido" || doc.estado === "por_vencer") {
        alertas.push({
          tipo: "Vehículo",
          refId: v.patente,
          nombre: v.patente,
          documento: doc.label,
          fecha: doc.fecha as string,
          estado: doc.estado,
          dias: doc.dias as number,
        });
      }
    }
  }

  for (const c of choferes.filter(enUso)) {
    for (const doc of documentosChofer(c, diasAviso)) {
      if (doc.estado === "vencido" || doc.estado === "por_vencer") {
        alertas.push({
          tipo: "Chofer",
          refId: c.id,
          nombre: c.nombre,
          documento: doc.label,
          fecha: doc.fecha as string,
          estado: doc.estado,
          dias: doc.dias as number,
        });
      }
    }
  }

  // Ordenar: primero los vencidos, luego por días restantes (más urgente primero).
  return alertas.sort((a, b) => a.dias - b.dias);
}

export type ResumenDocs = {
  vencidos: number;
  porVencer: number;
  sinDatos: number;
  /** Fichas (vehículos o choferes) que no están en regla. */
  fichas: number;
};

/**
 * Cuenta los papeles de un grupo de fichas para el encabezado de la pantalla:
 * el dueño tiene que ver "2 vencidos" antes de abrir la lista, no después de
 * revisarla fila por fila.
 *
 * `fichas` cuenta vehículos/choferes con algo pendiente, no documentos: un bus
 * con los tres papeles vencidos es un solo vehículo que sacar de circulación.
 */
export function resumenDocumentos(docsPorFicha: Documento[][]): ResumenDocs {
  const r: ResumenDocs = { vencidos: 0, porVencer: 0, sinDatos: 0, fichas: 0 };
  for (const docs of docsPorFicha) {
    for (const d of docs) {
      if (d.estado === "vencido") r.vencidos++;
      else if (d.estado === "por_vencer") r.porVencer++;
      else if (d.estado === "sin_datos") r.sinDatos++;
    }
    if (peorEstado(docs) !== "ok") r.fichas++;
  }
  return r;
}
