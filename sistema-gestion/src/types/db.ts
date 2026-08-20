// Tipos del dominio (espejo del esquema v2 en Supabase/Postgres).
//
// Principio del esquema v2: estados DERIVADOS, no declarados.
//   - "Por facturar" = viaje realizado sin factura_id.
//   - "Por cobrar"   = factura emitida sin fecha_pago.
//   - "Pagada"       = fecha_pago not null.
// Los helpers de más abajo son la única forma correcta de leer esos estados.

export type CotizacionEstado =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada";

export type ViajeEstado = "programado" | "realizado" | "cancelado";

/** Estado del DOCUMENTO tributario (no de la cobranza). */
export type FacturaEstado = "borrador" | "emitida" | "anulada";

export type RolUsuario = "admin" | "operador";

export type GastoCategoria = "combustible" | "mantencion" | "seguros" | "otros";
export type GastoOrigen = "manual" | "sii";

/** Los siete servicios del talonario. Los seis primeros son las casillas
 *  impresas del vale; "especial" no tiene casilla y se escribe a mano, por eso
 *  es el único que pide descripción. */
export type TaxiTipo =
  | "aeropuerto_arica"
  | "arica_aeropuerto"
  | "tacna_peru"
  | "local"
  | "taxi_exclusivo"
  | "taxi_compartido"
  | "especial";

export interface Perfil {
  id: string; // = auth.users.id
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
  /**
   * A qué empresa pertenece la cuenta (migración 0050). Es la columna que
   * decide qué datos ve: todas las policies RLS filtran por ella, así que dos
   * cuentas con empresa_id distinto no comparten ni un cliente.
   */
  empresa_id: string;
  created_at: string;
  updated_at: string;
}

export interface Empresa {
  id: string;
  nombre: string;
  razon_social: string | null;
  rut: string | null;
  direccion: string | null;
  ciudad: string | null;
  /** El SII distingue comuna de ciudad. Si falta, se cae a `ciudad`. */
  comuna: string | null;
  giro: string | null;
  /** Códigos de actividad económica del SII. Sin al menos uno no se puede emitir. */
  actividad_economica: number[];
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
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  rut: string | null;
  direccion: string | null;
  /** Obligatorios para facturarle electrónicamente. */
  giro: string | null;
  comuna: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Cotizacion {
  id: string;
  empresa_id: string;
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
  /** Fecha del servicio (se usa como fecha_inicio del viaje al aceptar). */
  fecha: string | null;
  valor_unitario: number;
  total: number;
  created_at: string;
}

/** La operación: un servicio de transporte (puede durar varios días). */
export interface Viaje {
  id: string;
  empresa_id: string;
  cliente_id: string;
  cotizacion_id: string | null;
  /** null = aún sin facturar. */
  factura_id: string | null;
  descripcion: string;
  fecha_inicio: string;
  /** null = servicio de un solo día. */
  fecha_fin: string | null;
  estado: ViajeEstado;
  valor: number;
  orden_compra: string | null;
  costo_combustible: number;
  costo_peajes: number;
  costo_viaticos: number;
  costo_otros: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** Chofer y/o vehículo asignado a un viaje (N por viaje; fecha = día
 *  específico en servicios multi-día, null = todo el servicio). */
export interface ViajeAsignacion {
  id: string;
  viaje_id: string;
  chofer_id: string | null;
  /** Patente del vehículo (FK a vehiculos.patente). */
  vehiculo_id: string | null;
  fecha: string | null;
  notas: string | null;
  created_at: string;
}

/** El documento tributario + su cobranza. Los datos de operación viven en
 *  los viajes que apuntan a esta factura (viajes.factura_id). */
export interface Factura {
  id: string;
  empresa_id: string;
  cliente_id: string;
  /** 33 afecta · 34 exenta · 56 nota débito · 61 nota crédito. */
  tipo_dte: number;
  folio: number | null;
  fecha_emision: string | null;
  estado: FacturaEstado;
  neto: number;
  iva: number;
  total: number;
  /** Única fuente de verdad de la cobranza. */
  fecha_pago: string | null;
  /** Código crudo de la última respuesta del SII, más los propios de la app
   *  ('enviado', 'error'). Se traduce al leer, con clasificarEstadoSii(). */
  estado_sii: string | null;
  sii_track_id: string | null;
  /** Ambiente contra el que se emitió. null = no pasó por el SII (carga manual). */
  sii_ambiente: "certificacion" | "produccion" | null;
  /** Lo que el SII explicó: aceptado, reparo, rechazo y su motivo. */
  sii_glosa: string | null;
  sii_enviado_at: string | null;
  /** DTE timbrado y su representación impresa, en el bucket 'adjuntos'. */
  sii_xml_path: string | null;
  sii_pdf_path: string | null;
  /** Ruta en el bucket privado 'adjuntos' (usar URL firmada). */
  archivo_path: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

/** La ficha de quien maneja. No es un usuario: el chofer no entra al sistema.
 *  Tuvo cuenta (user_id/email, borrados en la migración 0036) mientras existió
 *  la app de reparto, que se fue a Ares junto con encomiendas. */
export interface Chofer {
  id: string;
  empresa_id: string;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  foto_url: string | null;
  licencia_numero: string | null;
  licencia_clase: string | null;
  licencia_vencimiento: string | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehiculo {
  empresa_id: string;
  /** PK: la patente en formato canónico ("ABCD-12" / "AB-1234"). */
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  capacidad: number | null;
  km_actual: number | null;
  revision_tecnica_venc: string | null;
  soap_venc: string | null;
  permiso_circulacion_venc: string | null;
  /** Línea de trabajo donde se ocupa; null = aún sin clasificar. */
  categoria: VehiculoCategoria | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export const VEHICULO_CATEGORIAS = {
  operacion: "Operación",
  taxis: "Taxis",
} as const;
export type VehiculoCategoria = keyof typeof VEHICULO_CATEGORIAS;

export interface SiiCredencial {
  id: string;
  empresa_id: string;
  rut: string;
  cert_path: string;
  cert_password_enc: string;
  created_at: string;
  updated_at: string;
}

export interface GastoVehiculo {
  id: string;
  empresa_id: string;
  /** Patente del vehículo (FK a vehiculos.patente). */
  vehiculo_id: string | null;
  categoria: GastoCategoria;
  descripcion: string | null;
  origen: GastoOrigen;
  patente_detectada: string | null;
  proveedor_rut: string | null;
  proveedor_razon_social: string | null;
  dte_tipo: number | null;
  folio: number | null;
  fecha: string;
  litros: number | null;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  created_at: string;
  updated_at: string;
}

// Servicio del área de taxis: se gestiona aislado (no toca viajes/facturas)
// pero suma a los ingresos por cliente. cliente/chofer_texto conservan el
// nombre cuando una importación desde la app antigua no encontró match.
export interface ServicioTaxi {
  id: string;
  empresa_id: string;
  fecha: string;
  tipo: TaxiTipo;
  /** Qué fue el servicio, cuando el tipo no lo dice: solo para "especial"
   *  ("Tour Lauca medio día"). En el vale sale como la línea escrita a mano. */
  descripcion: string | null;
  monto: number;
  /** Nombre del pasajero. */
  pasajero: string | null;
  cliente_id: string | null;
  chofer_id: string | null;
  cliente_texto: string | null;
  chofer_texto: string | null;
  /** Id del registro en la app antigua (importación idempotente). */
  origen_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Estados derivados (la única forma correcta de leerlos)
// ---------------------------------------------------------------------------

export function viajePorFacturar(v: Pick<Viaje, "estado" | "factura_id">): boolean {
  return v.estado === "realizado" && v.factura_id === null;
}

export function facturaPagada(f: Pick<Factura, "fecha_pago">): boolean {
  return f.fecha_pago !== null && f.fecha_pago !== undefined && f.fecha_pago !== "";
}

/** Estado combinado documento+cobranza para mostrar en la UI. */
export type FacturaEstadoDerivado = "borrador" | "por_cobrar" | "pagada" | "anulada";

export function facturaEstadoDerivado(
  f: Pick<Factura, "estado" | "fecha_pago">,
): FacturaEstadoDerivado {
  if (f.estado === "anulada") return "anulada";
  if (f.estado === "borrador") return "borrador";
  return facturaPagada(f) ? "pagada" : "por_cobrar";
}

export type CostosViaje = {
  costo_combustible?: number;
  costo_peajes?: number;
  costo_viaticos?: number;
  costo_otros?: number;
};

export function costoTotalViaje(v: CostosViaje): number {
  return (
    Number(v.costo_combustible ?? 0) +
    Number(v.costo_peajes ?? 0) +
    Number(v.costo_viaticos ?? 0) +
    Number(v.costo_otros ?? 0)
  );
}

/**
 * Lo que deja un viaje: su valor menos lo que costó moverlo.
 *
 * El `valor` es lo que se le cobra al cliente SIN IVA — el IVA no es plata de
 * la empresa, se le entrega al Estado. Meterlo acá inflaría la utilidad de cada
 * viaje en un 19% que nunca fue suyo.
 *
 * Puede dar negativo, y así se muestra: un viaje que costó más de lo que se
 * cobró es exactamente lo que hay que poder ver.
 */
export function utilidadViaje(v: CostosViaje & { valor?: number }): number {
  return Number(v.valor ?? 0) - costoTotalViaje(v);
}

/**
 * Margen del viaje en porcentaje. `null` si no tiene valor cargado: 0% diría
 * que se trabajó a pérdida total, y lo que pasa es que todavía no se sabe.
 */
export function margenViaje(v: CostosViaje & { valor?: number }): number | null {
  const valor = Number(v.valor ?? 0);
  if (valor <= 0) return null;
  return Math.round((utilidadViaje(v) / valor) * 100);
}

// ---------------------------------------------------------------------------
// Tipos compuestos para vistas (joins)
// ---------------------------------------------------------------------------

export type ClienteRef = Pick<Cliente, "id" | "nombre" | "codigo">;

export type CotizacionConCliente = Cotizacion & {
  cliente: ClienteRef | null;
};

export type CotizacionCompleta = CotizacionConCliente & {
  items: CotizacionItem[];
};

export type AsignacionConDetalle = ViajeAsignacion & {
  chofer: Pick<Chofer, "id" | "nombre"> | null;
  vehiculo: Pick<Vehiculo, "patente"> | null;
};

export type ViajeConRelaciones = Viaje & {
  cliente: ClienteRef | null;
  cotizacion: Pick<Cotizacion, "id" | "numero"> | null;
  factura: Pick<Factura, "id" | "folio" | "tipo_dte" | "estado" | "fecha_pago"> | null;
  asignaciones: AsignacionConDetalle[];
};

export type FacturaConRelaciones = Factura & {
  cliente: ClienteRef | null;
  viajes: Viaje[];
};

export type GastoVehiculoConVehiculo = GastoVehiculo & {
  vehiculo: Pick<Vehiculo, "patente" | "marca" | "modelo"> | null;
};

export type ServicioTaxiConRelaciones = ServicioTaxi & {
  cliente: ClienteRef | null;
  chofer: Pick<Chofer, "id" | "nombre"> | null;
};

/** Nombre de empresa a mostrar: FK viva, o el texto conservado de la importación. */
export function taxiNombreCliente(s: ServicioTaxiConRelaciones): string | null {
  return s.cliente?.nombre ?? s.cliente_texto ?? null;
}

/** Nombre de chofer a mostrar: FK viva, o el texto conservado de la importación. */
export function taxiNombreChofer(s: ServicioTaxiConRelaciones): string | null {
  return s.chofer?.nombre ?? s.chofer_texto ?? null;
}

// ---------------------------------------------------------------------------
// Etiquetas legibles
// ---------------------------------------------------------------------------

export const COTIZACION_ESTADOS: Record<CotizacionEstado, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export const VIAJE_ESTADOS: Record<ViajeEstado, string> = {
  programado: "Programado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

// Estado del DOCUMENTO. No confundir con FACTURA_ESTADOS_DERIVADOS, que es lo
// que la app muestra al usuario y sale de cruzar este estado con la fecha de
// pago: una factura "emitida" se ve como "por cobrar" o "pagada" según cobre.
export const FACTURA_ESTADOS: Record<FacturaEstado, string> = {
  borrador: "Borrador",
  emitida: "Emitida",
  anulada: "Anulada",
};

export const FACTURA_ESTADOS_DERIVADOS: Record<FacturaEstadoDerivado, string> = {
  borrador: "Borrador",
  por_cobrar: "Emitida (por cobrar)",
  pagada: "Pagada",
  anulada: "Anulada",
};

/**
 * Los tipos de servicio de taxi, en el MISMO ORDEN que el talonario físico.
 * Una sola tabla para las tres cosas que hay que saber de cada tipo:
 *
 *   `label`  — cómo se lee en la pantalla y en el informe Excel
 *   `monto`  — tarifa que precarga el formulario, editable. null = no hay fija
 *   `vale`   — el texto TAL CUAL va impreso en el vale
 *   `casilla`— si tiene casilla propia en el papel. "Especial" no la tiene: en
 *              el talonario se escribe a mano, así que en el vale sale como
 *              línea aparte con su descripción
 *
 * Estaba partida en dos —las etiquetas acá y los textos del vale escritos otra
 * vez dentro del PDF—, y el papel y la pantalla podían dejar de coincidir sin
 * que nada avisara.
 */
export const TAXI_TIPOS: Record<
  TaxiTipo,
  { label: string; monto: number | null; vale: string; casilla: boolean }
> = {
  aeropuerto_arica: {
    label: "Aeropuerto → Ciudad Arica",
    monto: 8000,
    vale: "AEROPUERTO CIUDAD ARICA",
    casilla: true,
  },
  arica_aeropuerto: {
    label: "Ciudad Arica → Aeropuerto",
    monto: 8000,
    vale: "CIUDAD ARICA AEROPUERTO",
    casilla: true,
  },
  tacna_peru: { label: "Tacna – Perú", monto: null, vale: "TACNA-PERÚ", casilla: true },
  local: { label: "Servicio local", monto: null, vale: "SERVICIO LOCAL", casilla: true },
  taxi_exclusivo: {
    label: "Taxi exclusivo",
    monto: null,
    vale: "TAXI EXCLUSIVO",
    casilla: true,
  },
  taxi_compartido: {
    label: "Taxi compartido",
    monto: null,
    vale: "TAXI COMPARTIDO",
    casilla: true,
  },
  especial: { label: "Especial", monto: null, vale: "ESPECIAL", casilla: false },
};

/** El único tipo que necesita que alguien escriba QUÉ fue el servicio. */
export const TAXI_TIPO_CON_DESCRIPCION: TaxiTipo = "especial";

export function taxiPideDescripcion(tipo: string): boolean {
  return tipo === TAXI_TIPO_CON_DESCRIPCION;
}

/**
 * El nombre del tipo para mostrar. Un valor que la app no conozca —una fila
 * vieja de un respaldo restaurado— se muestra crudo en vez de reventar la
 * pantalla entera con `undefined.label`. Mismo criterio que la categoría del
 * vehículo.
 */
export function taxiTipoLabel(tipo: string): string {
  return TAXI_TIPOS[tipo as TaxiTipo]?.label ?? tipo;
}

export const TIPOS_DTE: Record<number, string> = {
  33: "Factura afecta",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

export const ROLES: Record<RolUsuario, string> = {
  admin: "Administrador",
  operador: "Operador",
};

export const GASTO_CATEGORIAS: Record<GastoCategoria, string> = {
  combustible: "Combustible",
  mantencion: "Mantención y repuestos",
  seguros: "Seguros y permisos",
  otros: "Otros",
};
