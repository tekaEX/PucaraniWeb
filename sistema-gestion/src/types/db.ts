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

export type RolUsuario = "admin" | "operador" | "contador" | "chofer";

export type GastoCategoria = "combustible" | "mantencion" | "seguros" | "otros";
export type GastoOrigen = "manual" | "sii";

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
  empresa_id: string;
  nombre: string;
  codigo: string | null;
  rut: string | null;
  direccion: string | null;
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
  estado_sii: string | null;
  sii_track_id: string | null;
  /** Ruta en el bucket privado 'adjuntos' (usar URL firmada). */
  archivo_path: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chofer {
  id: string;
  empresa_id: string;
  /** Cuenta de acceso del chofer (rol 'chofer'), si la tiene. */
  user_id: string | null;
  /** Correo con el que se invitó/vinculó su login (no viene de auth.users). */
  email: string | null;
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
  encomiendas: "Encomiendas",
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
  /** Solo cuando tipo = "especial". */
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

export function costoTotalViaje(v: {
  costo_combustible?: number;
  costo_peajes?: number;
  costo_viaticos?: number;
  costo_otros?: number;
}): number {
  return (
    Number(v.costo_combustible ?? 0) +
    Number(v.costo_peajes ?? 0) +
    Number(v.costo_viaticos ?? 0) +
    Number(v.costo_otros ?? 0)
  );
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

export const FACTURA_ESTADOS_DERIVADOS: Record<FacturaEstadoDerivado, string> = {
  borrador: "Borrador",
  por_cobrar: "Emitida (por cobrar)",
  pagada: "Pagada",
  anulada: "Anulada",
};

// Tipos de servicio de taxi (mismo orden que el talonario físico; los 6
// primeros son las casillas del vale, "especial" se escribe a mano).
// `monto` es el valor por defecto que precarga el formulario.
export const TAXI_TIPOS: Record<TaxiTipo, { label: string; monto: number | null }> = {
  aeropuerto_arica: { label: "Aeropuerto → Ciudad Arica", monto: 8000 },
  arica_aeropuerto: { label: "Ciudad Arica → Aeropuerto", monto: 8000 },
  tacna_peru: { label: "Tacna – Perú", monto: null },
  local: { label: "Servicio local", monto: null },
  taxi_exclusivo: { label: "Taxi exclusivo", monto: null },
  taxi_compartido: { label: "Taxi compartido", monto: null },
  especial: { label: "Especial", monto: null },
};

export const TIPOS_DTE: Record<number, string> = {
  33: "Factura afecta",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

export const ROLES: Record<RolUsuario, string> = {
  admin: "Administrador",
  operador: "Operador",
  contador: "Contador",
  chofer: "Chofer",
};

export const GASTO_CATEGORIAS: Record<GastoCategoria, string> = {
  combustible: "Combustible",
  mantencion: "Mantención y repuestos",
  seguros: "Seguros y permisos",
  otros: "Otros",
};

// ----------------------------------------------------------------------------
// Encomiendas: pedidos, rutas diarias, paradas, reglas y pago a conductores.
// Los destinatarios NO son "clientes" de la empresa (son personas puntuales);
// el conductor SÍ es un chofer más del sistema (tabla choferes).
// ----------------------------------------------------------------------------

// Se empieza con el mínimo de estados posible; se agregan más (ej.
// "programado", "cancelado") solo cuando realmente se necesiten.
export const ENCOMIENDA_ESTADOS = {
  pendiente: "Pendiente",
  entregado: "Entregado",
} as const;
export type EncomiendaEstado = keyof typeof ENCOMIENDA_ESTADOS;

export interface EncomiendaPedido {
  id: string;
  empresa_id: string;
  fecha_pedido: string;
  destinatario_nombre: string;
  destinatario_telefono: string;
  destinatario_direccion: string;
  destinatario_lat: number | null;
  destinatario_lng: number | null;
  estado: EncomiendaEstado;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export const ENCOMIENDA_RUTA_ESTADOS = {
  generada: "Generada",
  en_curso: "En curso",
  finalizada: "Finalizada",
} as const;
export type EncomiendaRutaEstado = keyof typeof ENCOMIENDA_RUTA_ESTADOS;

export interface EncomiendaRuta {
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  fecha: string;
  estado: EncomiendaRutaEstado;
  distancia_total_m: number | null;
  duracion_total_s: number | null;
  /** Trazado real por calles (OSRM), [lng, lat] por punto — formato GeoJSON.
   *  null si OSRM no respondió al generar la ruta (el mapa se queda solo
   *  con los puntos, sin el trazado). */
  geometria: [number, number][] | null;
  created_at: string;
  updated_at: string;
}

export const ENCOMIENDA_ESTADO_LLAMADA = {
  pendiente: "Pendiente",
  contesto: "Contestó",
  no_contesto: "No contestó",
} as const;
export type EncomiendaEstadoLlamada = keyof typeof ENCOMIENDA_ESTADO_LLAMADA;

export const ENCOMIENDA_ESTADO_ENTREGA = {
  pendiente: "Pendiente",
  entregado: "Entregado",
  omitido: "Omitido",
} as const;
export type EncomiendaEstadoEntrega = keyof typeof ENCOMIENDA_ESTADO_ENTREGA;

export interface EncomiendaParada {
  id: string;
  ruta_id: string;
  pedido_id: string;
  secuencia: number;
  estado_llamada: EncomiendaEstadoLlamada;
  estado_entrega: EncomiendaEstadoEntrega;
  hora_llamada: string | null;
  hora_entrega: string | null;
  created_at: string;
  updated_at: string;
}

export interface EncomiendaParadaConPedido extends EncomiendaParada {
  pedido: EncomiendaPedido;
}

export interface EncomiendaRutaConParadas extends EncomiendaRuta {
  chofer: { id: string; nombre: string } | null;
  paradas: EncomiendaParadaConPedido[];
}

// ----------------------------------------------------------------------------
// Actividad en terreno (0026) — reemplaza pedidos/rutas/paradas del lado del
// servidor. Los datos del destinatario y el orden de la ruta viven en el
// teléfono del chofer: acá solo queda el hecho de que la acción ocurrió, que es
// lo único que la empresa necesita para el ingreso estimado y la liquidación.
// ----------------------------------------------------------------------------
export const ENCOMIENDA_ACTIVIDAD_TIPOS = {
  entrega: "Entregado",
  omision: "Omitido",
  llamada: "Llamada",
} as const;
export type EncomiendaActividadTipo = keyof typeof ENCOMIENDA_ACTIVIDAD_TIPOS;

// De dónde salió el evento (0028). 'app' es el default en la base: la app del
// chofer no manda esta columna.
export const ENCOMIENDA_ACTIVIDAD_ORIGENES = {
  app: "App del conductor",
  manual: "Carga manual",
} as const;
export type EncomiendaActividadOrigen = keyof typeof ENCOMIENDA_ACTIVIDAD_ORIGENES;

export interface EncomiendaActividad {
  /** Generado en el TELÉFONO (UUIDv7), no en la base: es la clave de
   *  idempotencia que hace que reenviar un evento desde la cola offline no
   *  pueda contarlo dos veces (ver 0026). */
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  /** Día de trabajo en fecha local de Chile (hoyChile()), no derivada de la
   *  hora del servidor: una entrega de las 21:30 en Arica ya es del día
   *  siguiente en UTC y el pago se movería de día. */
  fecha: string;
  tipo: EncomiendaActividadTipo;
  /** Cuándo ocurrió según el teléfono — puede ser bastante anterior a
   *  created_at si se marcó sin señal. En las filas de origen 'manual' es de
   *  relleno (mediodía UTC del día cargado): nadie sabe la hora real. */
  hora: string;
  /** Cuándo llegó al servidor. */
  created_at: string;
  /** 'app' = lo envió el teléfono del chofer · 'manual' = lo cargó la oficina
   *  (ver 0028). Los dos cuentan igual para el pago. */
  origen: EncomiendaActividadOrigen;
}

export const ENCOMIENDA_TIPO_PAGO = {
  porcentaje: "% por pedido entregado",
  monto_fijo: "Monto fijo por pedido entregado",
} as const;
export type EncomiendaTipoPago = keyof typeof ENCOMIENDA_TIPO_PAGO;

export interface EncomiendaReglaPago {
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  tipo_pago: EncomiendaTipoPago;
  /** numeric en Postgres: PostgREST lo devuelve como string ("15.00"). */
  valor_pago: number;
  /** CLP que se estima que entra por cada entrega (0029). Antes era una
   *  constante del código; vive acá porque con tipo_pago 'porcentaje' entra en
   *  la fórmula del sueldo y tiene que quedar congelado con la regla. */
  valor_pedido: number;
  /** Fijo en CLP por día trabajado, aparte de lo que pague por pedido (0024). */
  monto_dia: number;
  meta_entregas_dia: number | null;
  bono_monto: number | null;
  vigente_desde: string;
  created_at: string;
}

/** Lo que Starken liquidó DE VERDAD en un mes (0029). Se contrasta contra el
 *  ingreso estimado para saber si valor_pedido está bien calibrado. */
export interface EncomiendaIngresoReal {
  id: string;
  empresa_id: string;
  anio: number;
  mes: number;
  monto: number;
  /** De dónde salió el número: nº de liquidación, si es parcial, etc. */
  nota: string | null;
  created_at: string;
  updated_at: string;
}

export interface EncomiendaPago {
  id: string;
  empresa_id: string;
  chofer_id: string | null;
  fecha: string;
  pedidos_entregados: number;
  pedidos_no_entregados: number;
  ingresos_totales: number;
  /** Por cantidad de pedidos entregados. */
  pago_base: number;
  /** Fijo por el día trabajado (0024). */
  pago_dia: number;
  pago_bono: number;
  /** Columna generada: pago_base + pago_bono + pago_dia. */
  pago_total: number;
  regla_id: string | null;
  calculado_en: string;
}
