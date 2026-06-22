// Tipos del dominio (espejo de las tablas en Supabase/Postgres).

export type CotizacionEstado =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada";

export type FacturaEstado =
  | "en_proceso"
  | "por_facturar"
  | "facturada"
  | "pagada";

export interface Empresa {
  id: string;
  nombre: string;
  razon_social: string | null;
  rut: string | null;
  direccion: string | null;
  ciudad: string | null;
  giro: string | null;
  telefono: string | null;
  email: string | null;
  logo_url: string | null;
  representante: string | null;
  proximo_numero_cotizacion: number;
  created_at: string;
  updated_at: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  codigo: string | null;
  rut: string | null;
  direccion: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  notas: string | null;
  created_at: string;
}

export interface Cotizacion {
  id: string;
  numero: number;
  fecha: string;
  fecha_validez: string | null;
  cliente_id: string | null;
  autor: string | null;
  titulo: string | null;
  nota_pie: string | null;
  exento_iva: boolean;
  estado: CotizacionEstado;
  subtotal: number;
  iva: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface CotizacionItem {
  id: string;
  cotizacion_id: string;
  orden: number;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  total: number;
}

export interface Factura {
  id: string;
  numero: string | null;
  fecha: string;
  descripcion: string | null;
  cliente_id: string | null;
  cotizacion_id: string | null;
  chofer_id: string | null;
  vehiculo_id: string | null;
  n_buses: number | null;
  valor_servicio: number;
  valor_a_pagar: number | null;
  orden_compra: string | null;
  estado: FacturaEstado;
  fecha_pago: string | null;
  archivo_url: string | null;
  costo_combustible: number;
  costo_peajes: number;
  costo_viaticos: number;
  costo_otros: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chofer {
  id: string;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  licencia_numero: string | null;
  licencia_clase: string | null;
  licencia_vencimiento: string | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
}

export interface Vehiculo {
  id: string;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  capacidad: number | null;
  km_actual: number | null;
  revision_tecnica_venc: string | null;
  soap_venc: string | null;
  permiso_circulacion_venc: string | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
}

// Suma de costos y utilidad de un servicio/factura.
export function costoTotalFactura(f: {
  costo_combustible?: number;
  costo_peajes?: number;
  costo_viaticos?: number;
  costo_otros?: number;
}): number {
  return (
    Number(f.costo_combustible ?? 0) +
    Number(f.costo_peajes ?? 0) +
    Number(f.costo_viaticos ?? 0) +
    Number(f.costo_otros ?? 0)
  );
}

export function montoFactura(f: {
  valor_a_pagar?: number | null;
  valor_servicio: number;
}): number {
  return Number(f.valor_a_pagar ?? f.valor_servicio);
}

// Tipos compuestos para vistas (joins).
export type CotizacionConCliente = Cotizacion & {
  cliente: Pick<Cliente, "id" | "nombre" | "codigo"> | null;
};

export type CotizacionCompleta = CotizacionConCliente & {
  items: CotizacionItem[];
};

export type FacturaConRelaciones = Factura & {
  cliente: Pick<Cliente, "id" | "nombre" | "codigo"> | null;
  cotizacion: Pick<Cotizacion, "id" | "numero"> | null;
};

// Etiquetas legibles para los estados.
export const COTIZACION_ESTADOS: Record<CotizacionEstado, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export const FACTURA_ESTADOS: Record<FacturaEstado, string> = {
  en_proceso: "En proceso",
  por_facturar: "Por facturar",
  facturada: "Facturada (por pagar)",
  pagada: "Pagada",
};
