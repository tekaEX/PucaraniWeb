// ============================================================================
// MODO DEMOSTRACIÓN
// Cuando no hay credenciales reales de Supabase (o son las de marcador),
// la app funciona con estos datos de ejemplo para poder previsualizarla
// localmente sin configurar nada. Al poner credenciales reales en .env.local
// este modo se desactiva solo.
// ============================================================================

import type {
  Empresa,
  Cliente,
  Cotizacion,
  CotizacionItem,
  Factura,
  Chofer,
  Vehiculo,
  CotizacionConCliente,
  CotizacionCompleta,
  FacturaConRelaciones,
  GastoVehiculo,
} from "@/types/db";

export function isDemo(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return url.trim() === "" || url.includes("placeholder");
}

// --- Fechas dinámicas ---
// El demo genera sus fechas en relación a HOY, así siempre se ve "vivo":
// el mes en curso tiene movimiento, el anterior sirve de comparación
// ("+12% vs. mes pasado") y los vencimientos cuentan una historia curada.
const HOY = new Date();

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Día `dia` (usar 1–28) del mes actual desplazado `offsetMes` meses.
// En el mes en curso nunca genera fechas futuras (se limita a hoy).
function enMes(offsetMes: number, dia: number): string {
  const d = new Date(HOY.getFullYear(), HOY.getMonth() + offsetMes, dia);
  if (offsetMes === 0 && d > HOY) return fmt(HOY);
  return fmt(d);
}

// Hoy + `dias` (vencimientos de documentos).
function enDias(dias: number): string {
  return fmt(new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + dias));
}

// Fecha ISO + `dias` (p. ej., validez de una cotización).
function masDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return fmt(new Date(y, m - 1, d + dias));
}

const now = new Date().toISOString();

export const demoEmpresa: Empresa = {
  id: "demo-empresa",
  nombre: "Transportes Pucarani",
  razon_social: "Cristian Enrique Carreño Rosas",
  rut: "12.345.678-9",
  direccion: "Quinsachata 1749",
  ciudad: "Arica",
  giro: "Traslado de Personal y Operador Turístico",
  telefono: "+569983417385",
  email: null,
  logo_url: null,
  representante: "Cristian Enrique Carreño Rosas",
  proximo_numero_cotizacion: 1189,
  created_at: now,
  updated_at: now,
};

export const demoClientes: Cliente[] = [
  {
    id: "demo-cli-epa",
    nombre: "Empresa Portuaria Arica",
    codigo: "epa",
    rut: "61.945.700-5",
    direccion: "Av. Máximo Lira 389, Arica",
    contacto_nombre: null,
    contacto_email: null,
    contacto_telefono: null,
    notas: null,
    created_at: now,
  },
  {
    id: "demo-cli-tpa",
    nombre: "Terminal Puerto Arica",
    codigo: "tpa",
    rut: "99.567.620-6",
    direccion: "Av. Comandante San Martín 255, Arica",
    contacto_nombre: null,
    contacto_email: null,
    contacto_telefono: null,
    notas: null,
    created_at: now,
  },
  {
    id: "demo-cli-erispe",
    nombre: "Erispe Ltda.",
    codigo: "erispe",
    rut: null,
    direccion: null,
    contacto_nombre: null,
    contacto_email: null,
    contacto_telefono: null,
    notas: null,
    created_at: now,
  },
];

export const demoChoferes: Chofer[] = [
  {
    id: "demo-cho-1",
    nombre: "Raúl Mamani",
    rut: "10.111.222-3",
    telefono: "+56 9 5555 1111",
    licencia_numero: "A3-123456",
    licencia_clase: "A3",
    licencia_vencimiento: enDias(12), // por vencer (alerta ámbar)
    activo: true,
    notas: null,
    created_at: now,
  },
  {
    id: "demo-cho-2",
    nombre: "Juan Pérez",
    rut: "12.333.444-5",
    telefono: "+56 9 5555 2222",
    licencia_numero: "A3-654321",
    licencia_clase: "A3",
    licencia_vencimiento: enDias(540), // vigente
    activo: true,
    notas: null,
    created_at: now,
  },
];

export const demoVehiculos: Vehiculo[] = [
  {
    id: "demo-veh-1",
    patente: "JKLM-12",
    marca: "Mercedes-Benz",
    modelo: "Sprinter",
    anio: 2021,
    capacidad: 19,
    km_actual: 145000,
    revision_tecnica_venc: enDias(20), // por vencer (alerta ámbar)
    soap_venc: enDias(160),
    permiso_circulacion_venc: enDias(260),
    activo: true,
    notas: null,
    created_at: now,
  },
  {
    id: "demo-veh-2",
    patente: "GHPR-34",
    marca: "Hyundai",
    modelo: "County",
    anio: 2018,
    capacidad: 28,
    km_actual: 310000,
    revision_tecnica_venc: enDias(-6), // vencida (alerta roja)
    soap_venc: enDias(45),
    permiso_circulacion_venc: enDias(85),
    activo: true,
    notas: null,
    created_at: now,
  },
];

function cliRef(id: string) {
  const c = demoClientes.find((x) => x.id === id)!;
  return { id: c.id, nombre: c.nombre, codigo: c.codigo };
}

// --- Cotizaciones (con ítems) ---
const items1188: CotizacionItem[] = [
  {
    id: "it-1",
    cotizacion_id: "demo-cot-1188",
    orden: 0,
    descripcion:
      "Día 15 — desde casino el morro al regimiento Rancagua, Museo Azapa, retorno casino el morro.",
    cantidad: 1,
    valor_unitario: 80000,
    total: 80000,
  },
  {
    id: "it-2",
    cotizacion_id: "demo-cot-1188",
    orden: 1,
    descripcion: "Día 16 — Todo el día, desde 07:30 hasta las 20:00. Putre.",
    cantidad: 1,
    valor_unitario: 350000,
    total: 350000,
  },
  {
    id: "it-3",
    cotizacion_id: "demo-cot-1188",
    orden: 2,
    descripcion:
      "Día 17 — Todo el día a Tacna, desde las 07:30 hasta las 21:00 aprox. Regreso a Arica.",
    cantidad: 1,
    valor_unitario: 240000,
    total: 240000,
  },
  {
    id: "it-4",
    cotizacion_id: "demo-cot-1188",
    orden: 3,
    descripcion:
      "Día 18 — Desde las 8:30 hasta las 14:00. Casino morro hacia brigada, Coraceros-morro-restaurant (por indicar).",
    cantidad: 1,
    valor_unitario: 80000,
    total: 80000,
  },
];

type CotConTodo = Cotizacion & {
  cliente: Cliente | null;
  items: CotizacionItem[];
};

export const demoCotizaciones: CotConTodo[] = [
  {
    id: "demo-cot-1188",
    numero: 1188,
    fecha: enMes(0, 3),
    fecha_validez: masDias(enMes(0, 3), 30),
    cliente_id: "demo-cli-epa",
    autor: "c.carreño",
    titulo: "Transporte de pasajeros — bus de acercamiento",
    nota_pie:
      "En caso de sufrir algún desperfecto la máquina en servicio, contamos con máquinas de reemplazo al instante.",
    exento_iva: true,
    estado: "enviada",
    subtotal: 750000,
    iva: 0,
    total: 750000,
    created_at: now,
    updated_at: now,
    cliente: demoClientes[0],
    items: items1188,
  },
  {
    id: "demo-cot-1181",
    numero: 1181,
    fecha: enMes(-1, 11),
    fecha_validez: masDias(enMes(-1, 11), 30),
    cliente_id: "demo-cli-epa",
    autor: "c.carreño",
    titulo: "Interior puerto — traslado de personal",
    nota_pie: null,
    exento_iva: true,
    estado: "aceptada",
    subtotal: 60000,
    iva: 0,
    total: 60000,
    created_at: now,
    updated_at: now,
    cliente: demoClientes[0],
    items: [
      {
        id: "it-5",
        cotizacion_id: "demo-cot-1181",
        orden: 0,
        descripcion: "Recorrido interior puerto, ida y vuelta.",
        cantidad: 1,
        valor_unitario: 60000,
        total: 60000,
      },
    ],
  },
  {
    id: "demo-cot-1179",
    numero: 1179,
    fecha: enMes(-1, 13),
    fecha_validez: masDias(enMes(-1, 13), 30),
    cliente_id: "demo-cli-tpa",
    autor: "c.carreño",
    titulo: "CIOP — traslado de autoridades",
    nota_pie: null,
    exento_iva: true,
    estado: "aceptada",
    subtotal: 180000,
    iva: 0,
    total: 180000,
    created_at: now,
    updated_at: now,
    cliente: demoClientes[1],
    items: [
      {
        id: "it-6",
        cotizacion_id: "demo-cot-1179",
        orden: 0,
        descripcion: "Servicio CIOP, jornada completa.",
        cantidad: 1,
        valor_unitario: 180000,
        total: 180000,
      },
    ],
  },
];

// --- Facturas / seguimiento ---
type CamposNuevos =
  | "chofer_id"
  | "vehiculo_id"
  | "costo_combustible"
  | "costo_peajes"
  | "costo_viaticos"
  | "costo_otros";
type FacturaRaw = Omit<FacturaConRelaciones, CamposNuevos> &
  Partial<Pick<FacturaConRelaciones, CamposNuevos>>;

const demoFacturasRaw: FacturaRaw[] = [
  {
    id: "demo-fac-1",
    numero: "465",
    fecha: enMes(-1, 5),
    descripcion: "Regimiento",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 2,
    valor_servicio: 200000,
    valor_a_pagar: 200000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(-1, 16),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-2",
    numero: "458",
    fecha: enMes(-2, 10),
    descripcion: "Conozca su puerto",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 1,
    valor_servicio: 100000,
    valor_a_pagar: 60000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(-2, 20),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-3",
    numero: "471",
    fecha: enMes(-1, 11),
    descripcion: "Interior puerto",
    cliente_id: "demo-cli-epa",
    cotizacion_id: "demo-cot-1181",
    n_buses: 1,
    valor_servicio: 60000,
    valor_a_pagar: 60000,
    orden_compra: "4800021834",
    estado: "facturada",
    fecha_pago: null,
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: { id: "demo-cot-1181", numero: 1181 },
  },
  {
    id: "demo-fac-4",
    numero: "463",
    fecha: enMes(-1, 13),
    descripcion: "CIOP",
    cliente_id: "demo-cli-tpa",
    cotizacion_id: "demo-cot-1179",
    n_buses: 1,
    valor_servicio: 180000,
    valor_a_pagar: 105000,
    orden_compra: "4800021778",
    estado: "pagada",
    fecha_pago: enMes(0, 2),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-tpa"),
    cotizacion: { id: "demo-cot-1179", numero: 1179 },
    chofer_id: "demo-cho-1",
    vehiculo_id: "demo-veh-1",
    costo_combustible: 35000,
    costo_peajes: 8000,
    costo_viaticos: 12000,
    costo_otros: 0,
  },
  {
    id: "demo-fac-5",
    numero: "468",
    fecha: enMes(0, 1),
    descripcion: "Conozca su puerto",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 4,
    valor_servicio: 400000,
    valor_a_pagar: 180000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(0, 3),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-6",
    numero: "469",
    fecha: enMes(0, 2),
    descripcion: "Día del patrimonio",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 7,
    valor_servicio: 700000,
    valor_a_pagar: 490000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(0, 4),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
    chofer_id: "demo-cho-2",
    vehiculo_id: "demo-veh-2",
    costo_combustible: 90000,
    costo_peajes: 0,
    costo_viaticos: 60000,
    costo_otros: 15000,
  },
  {
    id: "demo-fac-7",
    numero: "473",
    fecha: enMes(0, 3),
    descripcion: "Visitas",
    cliente_id: "demo-cli-tpa",
    cotizacion_id: null,
    n_buses: 1,
    valor_servicio: 120000,
    valor_a_pagar: 70000,
    orden_compra: "4800021997",
    estado: "facturada",
    fecha_pago: null,
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-tpa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-8",
    numero: null,
    fecha: enMes(0, 4),
    descripcion: "Visitas",
    cliente_id: "demo-cli-erispe",
    cotizacion_id: null,
    n_buses: 1,
    valor_servicio: 60000,
    valor_a_pagar: 35000,
    orden_compra: null,
    estado: "en_proceso",
    fecha_pago: null,
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-erispe"),
    cotizacion: null,
  },
  // --- Historia (meses anteriores): alimenta el gráfico de tendencia y las
  //     comparaciones "vs. mes anterior". Ingresos por mes (a pagar):
  //     -5: 420k · -4: 510k · -3: 470k · -2: 610k · -1: 690k · actual: 775k
  {
    id: "demo-fac-9",
    numero: "462",
    fecha: enMes(-1, 7),
    descripcion: "Acercamiento de personal — turno noche",
    cliente_id: "demo-cli-tpa",
    cotizacion_id: null,
    n_buses: 3,
    valor_servicio: 520000,
    valor_a_pagar: 490000,
    orden_compra: "4800021700",
    estado: "pagada",
    fecha_pago: enMes(-1, 21),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-tpa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-10",
    numero: "459",
    fecha: enMes(-2, 9),
    descripcion: "Traslado de faena",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 4,
    valor_servicio: 550000,
    valor_a_pagar: 550000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(-2, 23),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-11",
    numero: "455",
    fecha: enMes(-3, 12),
    descripcion: "City tour — recalada de crucero",
    cliente_id: "demo-cli-erispe",
    cotizacion_id: null,
    n_buses: 3,
    valor_servicio: 470000,
    valor_a_pagar: 470000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(-3, 26),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-erispe"),
    cotizacion: null,
  },
  {
    id: "demo-fac-12",
    numero: "452",
    fecha: enMes(-4, 8),
    descripcion: "Acercamiento de personal — faena portuaria",
    cliente_id: "demo-cli-tpa",
    cotizacion_id: null,
    n_buses: 3,
    valor_servicio: 510000,
    valor_a_pagar: 510000,
    orden_compra: "4800021520",
    estado: "pagada",
    fecha_pago: enMes(-4, 22),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-tpa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-13",
    numero: "448",
    fecha: enMes(-5, 14),
    descripcion: "Traslado de delegación",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 2,
    valor_servicio: 420000,
    valor_a_pagar: 420000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: enMes(-5, 27),
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
  },
];

const facturaDefaults = {
  chofer_id: null as string | null,
  vehiculo_id: null as string | null,
  costo_combustible: 0,
  costo_peajes: 0,
  costo_viaticos: 0,
  costo_otros: 0,
};

export const demoFacturas: FacturaConRelaciones[] = demoFacturasRaw.map((f) => ({
  ...facturaDefaults,
  ...f,
}));

// ---- Accesores con las formas que usan las páginas ----

export function demoCotizacionesConCliente(): CotizacionConCliente[] {
  return demoCotizaciones.map(({ items, cliente, ...rest }) => {
    void items;
    return {
      ...rest,
      cliente: cliente ? { id: cliente.id, nombre: cliente.nombre, codigo: cliente.codigo } : null,
    };
  });
}

export function demoCotizacionCompleta(id: string): CotizacionCompleta | null {
  const c = demoCotizaciones.find((x) => x.id === id) ?? demoCotizaciones[0];
  if (!c) return null;
  return {
    ...c,
    cliente: c.cliente ? { id: c.cliente.id, nombre: c.cliente.nombre, codigo: c.cliente.codigo } : null,
    items: c.items,
  };
}

export function demoCotizacionConItems(
  id: string,
): (Cotizacion & { items: CotizacionItem[] }) | null {
  const c = demoCotizaciones.find((x) => x.id === id);
  if (!c) return null;
  const { cliente, ...rest } = c;
  void cliente;
  return { ...rest, items: c.items };
}

export function demoCotizacionesLite() {
  return demoCotizaciones.map((c) => ({
    id: c.id,
    numero: c.numero,
    cliente_id: c.cliente_id,
    total: c.total,
    titulo: c.titulo,
  }));
}

export function demoFacturaById(id: string): Factura | null {
  const f = demoFacturas.find((x) => x.id === id);
  if (!f) return null;
  const { cliente, cotizacion, ...rest } = f;
  void cliente;
  void cotizacion;
  return rest;
}

// --- Gastos por vehículo (manual + SII) ---
export const demoGastos: GastoVehiculo[] = [
  {
    id: "demo-gas-1",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-1",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "JKLM12",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 880123,
    fecha: enMes(0, 2),
    litros: 120,
    monto_neto: 110000,
    monto_iva: 20900,
    monto_total: 130900,
    created_at: now,
  },
  {
    id: "demo-gas-2",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-1",
    categoria: "mantencion",
    descripcion: "Cambio de aceite y filtros",
    origen: "manual",
    patente_detectada: null,
    proveedor_rut: null,
    proveedor_razon_social: "Taller Don Pedro",
    dte_tipo: null,
    folio: null,
    fecha: enMes(0, 3),
    litros: null,
    monto_neto: 0,
    monto_iva: 0,
    monto_total: 85000,
    created_at: now,
  },
  {
    id: "demo-gas-3",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "GHPR34",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 880140,
    fecha: enMes(0, 4),
    litros: 210,
    monto_neto: 190000,
    monto_iva: 36100,
    monto_total: 226100,
    created_at: now,
  },
  {
    id: "demo-gas-4",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "seguros",
    descripcion: "SOAP 2026",
    origen: "manual",
    patente_detectada: null,
    proveedor_rut: null,
    proveedor_razon_social: null,
    dte_tipo: null,
    folio: null,
    fecha: enMes(-5, 15),
    litros: null,
    monto_neto: 0,
    monto_iva: 0,
    monto_total: 42000,
    created_at: now,
  },
  // --- Historia (meses anteriores) para el gráfico de tendencia ---
  {
    id: "demo-gas-5",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-1",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "JKLM12",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 879950,
    fecha: enMes(-1, 7),
    litros: 180,
    monto_neto: 164200,
    monto_iva: 31200,
    monto_total: 195400,
    created_at: now,
  },
  {
    id: "demo-gas-6",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "mantencion",
    descripcion: "Neumáticos delanteros",
    origen: "manual",
    patente_detectada: null,
    proveedor_rut: null,
    proveedor_razon_social: "Taller Don Pedro",
    dte_tipo: null,
    folio: null,
    fecha: enMes(-1, 18),
    litros: null,
    monto_neto: 0,
    monto_iva: 0,
    monto_total: 120000,
    created_at: now,
  },
  {
    id: "demo-gas-7",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "GHPR34",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 880021,
    fecha: enMes(-1, 25),
    litros: 130,
    monto_neto: 116500,
    monto_iva: 22100,
    monto_total: 138600,
    created_at: now,
  },
  {
    id: "demo-gas-8",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-1",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "JKLM12",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 879800,
    fecha: enMes(-2, 8),
    litros: 190,
    monto_neto: 172300,
    monto_iva: 32700,
    monto_total: 205000,
    created_at: now,
  },
  {
    id: "demo-gas-9",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-1",
    categoria: "mantencion",
    descripcion: "Frenos y suspensión",
    origen: "manual",
    patente_detectada: null,
    proveedor_rut: null,
    proveedor_razon_social: "Taller Don Pedro",
    dte_tipo: null,
    folio: null,
    fecha: enMes(-2, 17),
    litros: null,
    monto_neto: 0,
    monto_iva: 0,
    monto_total: 165000,
    created_at: now,
  },
  {
    id: "demo-gas-10",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "GHPR34",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 879650,
    fecha: enMes(-3, 7),
    litros: 225,
    monto_neto: 201700,
    monto_iva: 38300,
    monto_total: 240000,
    created_at: now,
  },
  {
    id: "demo-gas-11",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "otros",
    descripcion: "Lavado y aseo de flota",
    origen: "manual",
    patente_detectada: null,
    proveedor_rut: null,
    proveedor_razon_social: null,
    dte_tipo: null,
    folio: null,
    fecha: enMes(-3, 20),
    litros: null,
    monto_neto: 0,
    monto_iva: 0,
    monto_total: 35000,
    created_at: now,
  },
  {
    id: "demo-gas-12",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-1",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "JKLM12",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 879400,
    fecha: enMes(-4, 11),
    litros: 185,
    monto_neto: 166400,
    monto_iva: 31600,
    monto_total: 198000,
    created_at: now,
  },
  {
    id: "demo-gas-13",
    empresa_id: "demo-empresa",
    vehiculo_id: "demo-veh-2",
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: "GHPR34",
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: 879200,
    fecha: enMes(-5, 6),
    litros: 172,
    monto_neto: 155500,
    monto_iva: 29500,
    monto_total: 185000,
    created_at: now,
  },
];

export function demoClienteById(id: string): Cliente | null {
  return demoClientes.find((x) => x.id === id) ?? null;
}

export function demoFacturasPorCotizacion(cotizacionId: string): Factura[] {
  return demoFacturas
    .filter((f) => f.cotizacion_id === cotizacionId)
    .map(({ cliente, cotizacion, ...rest }) => {
      void cliente;
      void cotizacion;
      return rest;
    });
}

export function demoChoferById(id: string): Chofer | null {
  return demoChoferes.find((x) => x.id === id) ?? null;
}

export function demoVehiculoById(id: string): Vehiculo | null {
  return demoVehiculos.find((x) => x.id === id) ?? null;
}
