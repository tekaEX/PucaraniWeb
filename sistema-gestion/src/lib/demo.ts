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

const now = "2026-06-20T00:00:00.000Z";

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
    licencia_vencimiento: "2026-07-15", // por vencer
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
    licencia_vencimiento: "2028-01-01",
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
    revision_tecnica_venc: "2026-07-10", // por vencer
    soap_venc: "2026-12-31",
    permiso_circulacion_venc: "2027-03-31",
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
    revision_tecnica_venc: "2026-06-10", // vencida
    soap_venc: "2026-07-05", // por vencer
    permiso_circulacion_venc: "2026-09-30",
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
    fecha: "2026-06-16",
    fecha_validez: "2026-07-16",
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
    fecha: "2026-05-11",
    fecha_validez: "2026-06-11",
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
    fecha: "2026-05-13",
    fecha_validez: "2026-06-13",
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
    fecha: "2026-02-10",
    descripcion: "Regimiento",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 2,
    valor_servicio: 200000,
    valor_a_pagar: 200000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: "2026-03-02",
    archivo_url: null,
    notas: null,
    created_at: now,
    updated_at: now,
    cliente: cliRef("demo-cli-epa"),
    cotizacion: null,
  },
  {
    id: "demo-fac-2",
    numero: "465",
    fecha: "2026-03-24",
    descripcion: "Conozca su puerto",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 1,
    valor_servicio: 100000,
    valor_a_pagar: 60000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: "2026-04-10",
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
    fecha: "2026-05-11",
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
    fecha: "2026-05-13",
    descripcion: "CIOP",
    cliente_id: "demo-cli-tpa",
    cotizacion_id: "demo-cot-1179",
    n_buses: 1,
    valor_servicio: 180000,
    valor_a_pagar: 105000,
    orden_compra: "4800021778",
    estado: "pagada",
    fecha_pago: "2026-06-10",
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
    fecha: "2026-05-28",
    descripcion: "Conozca su puerto",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 4,
    valor_servicio: 400000,
    valor_a_pagar: 180000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: "2026-06-15",
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
    fecha: "2026-05-30",
    descripcion: "Día del patrimonio",
    cliente_id: "demo-cli-epa",
    cotizacion_id: null,
    n_buses: 7,
    valor_servicio: 700000,
    valor_a_pagar: 490000,
    orden_compra: null,
    estado: "pagada",
    fecha_pago: "2026-06-18",
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
    fecha: "2026-06-03",
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
    fecha: "2026-06-16",
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
    fecha: "2026-06-05",
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
    fecha: "2026-06-09",
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
    fecha: "2026-06-12",
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
    fecha: "2026-01-15",
    litros: null,
    monto_neto: 0,
    monto_iva: 0,
    monto_total: 42000,
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
