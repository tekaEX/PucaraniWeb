// ============================================================================
// MODO DEMOSTRACIÓN (esquema v2)
// Cuando no hay credenciales reales de Supabase (o son las de marcador),
// la app funciona con estos datos de ejemplo para poder previsualizarla
// localmente sin configurar nada. Al poner credenciales reales en .env.local
// este modo se desactiva solo.
//
// El dataset cuenta la historia del esquema v2: viajes separados de facturas
// (la factura 469 agrupa DOS viajes), un viaje realizado sin facturar (estado
// derivado "por facturar") y otro programado a futuro.
// ============================================================================

import type {
  Empresa,
  Cliente,
  Cotizacion,
  CotizacionItem,
  Chofer,
  Vehiculo,
  Viaje,
  ViajeAsignacion,
  Factura,
  CotizacionConCliente,
  CotizacionCompleta,
  ViajeConRelaciones,
  AsignacionConDetalle,
  FacturaConRelaciones,
  GastoVehiculo,
  ClienteRef,
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

// Hoy + `dias` (vencimientos, viajes programados).
function enDias(dias: number): string {
  return fmt(new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + dias));
}

// Fecha ISO + `dias` (p. ej., validez de una cotización).
function masDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return fmt(new Date(y, m - 1, d + dias));
}

const now = new Date().toISOString();
const EMPRESA_ID = "demo-empresa";

export const demoEmpresa: Empresa = {
  id: EMPRESA_ID,
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
    empresa_id: EMPRESA_ID,
    nombre: "Empresa Portuaria Arica",
    codigo: "epa",
    rut: "61.945.700-5",
    direccion: "Av. Máximo Lira 389, Arica",
    contacto_nombre: null,
    contacto_email: null,
    contacto_telefono: null,
    activo: true,
    notas: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-cli-tpa",
    empresa_id: EMPRESA_ID,
    nombre: "Terminal Puerto Arica",
    codigo: "tpa",
    rut: "99.567.620-6",
    direccion: "Av. Comandante San Martín 255, Arica",
    contacto_nombre: null,
    contacto_email: null,
    contacto_telefono: null,
    activo: true,
    notas: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-cli-erispe",
    empresa_id: EMPRESA_ID,
    nombre: "Erispe Ltda.",
    codigo: "erispe",
    rut: null,
    direccion: null,
    contacto_nombre: null,
    contacto_email: null,
    contacto_telefono: null,
    activo: true,
    notas: null,
    created_at: now,
    updated_at: now,
  },
];

export const demoChoferes: Chofer[] = [
  {
    id: "demo-cho-1",
    empresa_id: EMPRESA_ID,
    user_id: null,
    nombre: "Raúl Mamani",
    rut: "10.111.222-3",
    telefono: "+56 9 5555 1111",
    foto_url: null,
    licencia_numero: "A3-123456",
    licencia_clase: "A3",
    licencia_vencimiento: enDias(12), // por vencer (alerta ámbar)
    activo: true,
    notas: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: "demo-cho-2",
    empresa_id: EMPRESA_ID,
    user_id: null,
    nombre: "Juan Pérez",
    rut: "12.333.444-5",
    telefono: "+56 9 5555 2222",
    foto_url: null,
    licencia_numero: "A3-654321",
    licencia_clase: "A3",
    licencia_vencimiento: enDias(540), // vigente
    activo: true,
    notas: null,
    created_at: now,
    updated_at: now,
  },
];

export const demoVehiculos: Vehiculo[] = [
  {
    id: "demo-veh-1",
    empresa_id: EMPRESA_ID,
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
    updated_at: now,
  },
  {
    id: "demo-veh-2",
    empresa_id: EMPRESA_ID,
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
    updated_at: now,
  },
];

function cliRef(id: string): ClienteRef {
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
    created_at: now,
  },
  {
    id: "it-2",
    cotizacion_id: "demo-cot-1188",
    orden: 1,
    descripcion: "Día 16 — Todo el día, desde 07:30 hasta las 20:00. Putre.",
    cantidad: 1,
    valor_unitario: 350000,
    total: 350000,
    created_at: now,
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
    created_at: now,
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
    created_at: now,
  },
];

type CotConTodo = Cotizacion & {
  cliente: Cliente | null;
  items: CotizacionItem[];
};

export const demoCotizaciones: CotConTodo[] = [
  {
    id: "demo-cot-1188",
    empresa_id: EMPRESA_ID,
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
    empresa_id: EMPRESA_ID,
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
        created_at: now,
      },
    ],
  },
  {
    id: "demo-cot-1179",
    empresa_id: EMPRESA_ID,
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
        created_at: now,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Facturas (documento) y Viajes (operación)
// Historia de ingresos por mes (total facturado y pagado):
//   -5: 420k · -4: 510k · -3: 470k · -2: 610k · -1: 690k · actual: 775k
// ---------------------------------------------------------------------------

const facturaBase = {
  empresa_id: EMPRESA_ID,
  tipo_dte: 34, // exenta (transporte de pasajeros)
  iva: 0,
  estado: "emitida" as const,
  estado_sii: null,
  sii_track_id: null,
  archivo_path: null,
  notas: null,
  created_at: now,
  updated_at: now,
};

function mkFactura(f: {
  id: string;
  cliente_id: string;
  folio: number;
  fecha_emision: string;
  total: number;
  fecha_pago: string | null;
}): Factura {
  return {
    ...facturaBase,
    ...f,
    neto: f.total, // exenta: sin IVA
  };
}

const demoFacturasBase: Factura[] = [
  mkFactura({ id: "demo-fac-1", cliente_id: "demo-cli-epa", folio: 465, fecha_emision: enMes(-1, 5), total: 200000, fecha_pago: enMes(-1, 16) }),
  mkFactura({ id: "demo-fac-2", cliente_id: "demo-cli-epa", folio: 458, fecha_emision: enMes(-2, 10), total: 60000, fecha_pago: enMes(-2, 20) }),
  mkFactura({ id: "demo-fac-3", cliente_id: "demo-cli-epa", folio: 471, fecha_emision: enMes(-1, 11), total: 60000, fecha_pago: null }),
  mkFactura({ id: "demo-fac-4", cliente_id: "demo-cli-tpa", folio: 463, fecha_emision: enMes(-1, 13), total: 105000, fecha_pago: enMes(0, 2) }),
  mkFactura({ id: "demo-fac-5", cliente_id: "demo-cli-epa", folio: 468, fecha_emision: enMes(0, 1), total: 180000, fecha_pago: enMes(0, 3) }),
  // La 469 agrupa DOS viajes (facturación mensual) — la razón de ser del esquema v2.
  mkFactura({ id: "demo-fac-6", cliente_id: "demo-cli-epa", folio: 469, fecha_emision: enMes(0, 2), total: 490000, fecha_pago: enMes(0, 4) }),
  mkFactura({ id: "demo-fac-7", cliente_id: "demo-cli-tpa", folio: 473, fecha_emision: enMes(0, 3), total: 70000, fecha_pago: null }),
  // Historia (meses anteriores) para el gráfico de tendencia.
  mkFactura({ id: "demo-fac-9", cliente_id: "demo-cli-tpa", folio: 462, fecha_emision: enMes(-1, 7), total: 490000, fecha_pago: enMes(-1, 21) }),
  mkFactura({ id: "demo-fac-10", cliente_id: "demo-cli-epa", folio: 459, fecha_emision: enMes(-2, 9), total: 550000, fecha_pago: enMes(-2, 23) }),
  mkFactura({ id: "demo-fac-11", cliente_id: "demo-cli-erispe", folio: 455, fecha_emision: enMes(-3, 12), total: 470000, fecha_pago: enMes(-3, 26) }),
  mkFactura({ id: "demo-fac-12", cliente_id: "demo-cli-tpa", folio: 452, fecha_emision: enMes(-4, 8), total: 510000, fecha_pago: enMes(-4, 22) }),
  mkFactura({ id: "demo-fac-13", cliente_id: "demo-cli-epa", folio: 448, fecha_emision: enMes(-5, 14), total: 420000, fecha_pago: enMes(-5, 27) }),
];

const viajeBase = {
  empresa_id: EMPRESA_ID,
  cotizacion_id: null as string | null,
  fecha_fin: null as string | null,
  estado: "realizado" as const,
  orden_compra: null as string | null,
  costo_combustible: 0,
  costo_peajes: 0,
  costo_viaticos: 0,
  costo_otros: 0,
  notas: null as string | null,
  created_at: now,
  updated_at: now,
};

function mkViaje(
  v: { id: string; cliente_id: string; factura_id: string | null; descripcion: string; fecha_inicio: string; valor: number } & Partial<Viaje>,
): Viaje {
  return { ...viajeBase, ...v };
}

const demoViajesBase: Viaje[] = [
  mkViaje({ id: "demo-via-1", cliente_id: "demo-cli-epa", factura_id: "demo-fac-1", descripcion: "Regimiento", fecha_inicio: enMes(-1, 5), valor: 200000 }),
  mkViaje({ id: "demo-via-2", cliente_id: "demo-cli-epa", factura_id: "demo-fac-2", descripcion: "Conozca su puerto", fecha_inicio: enMes(-2, 10), valor: 60000 }),
  mkViaje({ id: "demo-via-3", cliente_id: "demo-cli-epa", factura_id: "demo-fac-3", descripcion: "Interior puerto", fecha_inicio: enMes(-1, 11), valor: 60000, cotizacion_id: "demo-cot-1181", orden_compra: "4800021834" }),
  mkViaje({
    id: "demo-via-4", cliente_id: "demo-cli-tpa", factura_id: "demo-fac-4", descripcion: "CIOP", fecha_inicio: enMes(-1, 13), valor: 105000,
    cotizacion_id: "demo-cot-1179", orden_compra: "4800021778",
    costo_combustible: 35000, costo_peajes: 8000, costo_viaticos: 12000,
  }),
  mkViaje({ id: "demo-via-5", cliente_id: "demo-cli-epa", factura_id: "demo-fac-5", descripcion: "Conozca su puerto", fecha_inicio: enMes(0, 1), valor: 180000 }),
  // Dos viajes agrupados en la factura 469:
  mkViaje({
    id: "demo-via-6", cliente_id: "demo-cli-epa", factura_id: "demo-fac-6", descripcion: "Día del patrimonio — jornada mañana", fecha_inicio: enMes(0, 2), valor: 280000,
    costo_combustible: 90000, costo_viaticos: 60000, costo_otros: 15000,
  }),
  mkViaje({ id: "demo-via-7", cliente_id: "demo-cli-epa", factura_id: "demo-fac-6", descripcion: "Día del patrimonio — jornada tarde", fecha_inicio: enMes(0, 2), valor: 210000 }),
  mkViaje({ id: "demo-via-8", cliente_id: "demo-cli-tpa", factura_id: "demo-fac-7", descripcion: "Visitas", fecha_inicio: enMes(0, 3), valor: 70000, orden_compra: "4800021997" }),
  // Realizado y SIN factura: aparece como "por facturar" (estado derivado).
  mkViaje({ id: "demo-via-9", cliente_id: "demo-cli-erispe", factura_id: null, descripcion: "Visitas", fecha_inicio: enMes(0, 4), valor: 60000, costo_combustible: 12000 }),
  // Programado a futuro (multi-día).
  mkViaje({
    id: "demo-via-10", cliente_id: "demo-cli-tpa", factura_id: null, descripcion: "Traslado delegación — gira al altiplano", fecha_inicio: enDias(6), valor: 350000,
    fecha_fin: enDias(8), estado: "programado",
  }),
  // Historia (meses anteriores).
  mkViaje({ id: "demo-via-11", cliente_id: "demo-cli-tpa", factura_id: "demo-fac-9", descripcion: "Acercamiento de personal — turno noche", fecha_inicio: enMes(-1, 7), valor: 490000, orden_compra: "4800021700" }),
  mkViaje({ id: "demo-via-12", cliente_id: "demo-cli-epa", factura_id: "demo-fac-10", descripcion: "Traslado de faena", fecha_inicio: enMes(-2, 9), valor: 550000 }),
  mkViaje({ id: "demo-via-13", cliente_id: "demo-cli-erispe", factura_id: "demo-fac-11", descripcion: "City tour — recalada de crucero", fecha_inicio: enMes(-3, 12), valor: 470000 }),
  mkViaje({ id: "demo-via-14", cliente_id: "demo-cli-tpa", factura_id: "demo-fac-12", descripcion: "Acercamiento de personal — faena portuaria", fecha_inicio: enMes(-4, 8), valor: 510000, orden_compra: "4800021520" }),
  mkViaje({ id: "demo-via-15", cliente_id: "demo-cli-epa", factura_id: "demo-fac-13", descripcion: "Traslado de delegación", fecha_inicio: enMes(-5, 14), valor: 420000 }),
];

export const demoAsignaciones: ViajeAsignacion[] = [
  { id: "demo-asig-1", viaje_id: "demo-via-4", chofer_id: "demo-cho-1", vehiculo_id: "demo-veh-1", fecha: null, notas: null, created_at: now },
  // Multi-bus: la jornada mañana del patrimonio salió con dos máquinas.
  { id: "demo-asig-2", viaje_id: "demo-via-6", chofer_id: "demo-cho-1", vehiculo_id: "demo-veh-1", fecha: null, notas: null, created_at: now },
  { id: "demo-asig-3", viaje_id: "demo-via-6", chofer_id: "demo-cho-2", vehiculo_id: "demo-veh-2", fecha: null, notas: null, created_at: now },
  { id: "demo-asig-4", viaje_id: "demo-via-7", chofer_id: "demo-cho-2", vehiculo_id: "demo-veh-2", fecha: null, notas: null, created_at: now },
  { id: "demo-asig-5", viaje_id: "demo-via-10", chofer_id: "demo-cho-2", vehiculo_id: "demo-veh-1", fecha: null, notas: null, created_at: now },
];

// ---- Vistas compuestas (las formas que usan las páginas) ----

function asignacionesDe(viajeId: string): AsignacionConDetalle[] {
  return demoAsignaciones
    .filter((a) => a.viaje_id === viajeId)
    .map((a) => ({
      ...a,
      chofer: demoChoferes.find((c) => c.id === a.chofer_id) ?? null,
      vehiculo: demoVehiculos.find((v) => v.id === a.vehiculo_id) ?? null,
    }))
    .map((a) => ({
      ...a,
      chofer: a.chofer ? { id: a.chofer.id, nombre: a.chofer.nombre } : null,
      vehiculo: a.vehiculo ? { id: a.vehiculo.id, patente: a.vehiculo.patente } : null,
    }));
}

export const demoViajes: ViajeConRelaciones[] = demoViajesBase.map((v) => {
  const cot = v.cotizacion_id
    ? demoCotizaciones.find((c) => c.id === v.cotizacion_id) ?? null
    : null;
  const fac = v.factura_id
    ? demoFacturasBase.find((f) => f.id === v.factura_id) ?? null
    : null;
  return {
    ...v,
    cliente: cliRef(v.cliente_id),
    cotizacion: cot ? { id: cot.id, numero: cot.numero } : null,
    factura: fac
      ? { id: fac.id, folio: fac.folio, tipo_dte: fac.tipo_dte, estado: fac.estado, fecha_pago: fac.fecha_pago }
      : null,
    asignaciones: asignacionesDe(v.id),
  };
});

export const demoFacturas: FacturaConRelaciones[] = demoFacturasBase.map((f) => ({
  ...f,
  cliente: cliRef(f.cliente_id),
  viajes: demoViajesBase.filter((v) => v.factura_id === f.id),
}));

export function demoViajeById(id: string): ViajeConRelaciones | null {
  return demoViajes.find((x) => x.id === id) ?? null;
}

export function demoViajesPorFacturar(clienteId?: string): ViajeConRelaciones[] {
  return demoViajes.filter(
    (v) =>
      v.estado === "realizado" &&
      v.factura_id === null &&
      (!clienteId || v.cliente_id === clienteId),
  );
}

export function demoViajesPorCotizacion(cotizacionId: string): Viaje[] {
  return demoViajesBase.filter((v) => v.cotizacion_id === cotizacionId);
}

export function demoFacturaById(id: string): FacturaConRelaciones | null {
  return demoFacturas.find((x) => x.id === id) ?? null;
}

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

export function demoClienteById(id: string): Cliente | null {
  return demoClientes.find((x) => x.id === id) ?? null;
}

export function demoChoferById(id: string): Chofer | null {
  return demoChoferes.find((x) => x.id === id) ?? null;
}

export function demoVehiculoById(id: string): Vehiculo | null {
  return demoVehiculos.find((x) => x.id === id) ?? null;
}

// --- Gastos por vehículo (manual + SII) ---
const gastoBase = {
  empresa_id: EMPRESA_ID,
  patente_detectada: null as string | null,
  proveedor_rut: null as string | null,
  proveedor_razon_social: null as string | null,
  dte_tipo: null as number | null,
  folio: null as number | null,
  litros: null as number | null,
  monto_neto: 0,
  monto_iva: 0,
  created_at: now,
  updated_at: now,
};

function mkGastoSii(g: {
  id: string; vehiculo_id: string; patente: string; folio: number; fecha: string; litros: number; neto: number; iva: number;
}): GastoVehiculo {
  return {
    ...gastoBase,
    id: g.id,
    vehiculo_id: g.vehiculo_id,
    categoria: "combustible",
    descripcion: "Carga de diésel",
    origen: "sii",
    patente_detectada: g.patente,
    proveedor_rut: "99500000-0",
    proveedor_razon_social: "Copec S.A.",
    dte_tipo: 33,
    folio: g.folio,
    fecha: g.fecha,
    litros: g.litros,
    monto_neto: g.neto,
    monto_iva: g.iva,
    monto_total: g.neto + g.iva,
  };
}

function mkGastoManual(g: {
  id: string; vehiculo_id: string; categoria: GastoVehiculo["categoria"]; descripcion: string; proveedor?: string; fecha: string; total: number;
}): GastoVehiculo {
  return {
    ...gastoBase,
    id: g.id,
    vehiculo_id: g.vehiculo_id,
    categoria: g.categoria,
    descripcion: g.descripcion,
    origen: "manual",
    proveedor_razon_social: g.proveedor ?? null,
    fecha: g.fecha,
    monto_total: g.total,
  };
}

export const demoGastos: GastoVehiculo[] = [
  mkGastoSii({ id: "demo-gas-1", vehiculo_id: "demo-veh-1", patente: "JKLM12", folio: 880123, fecha: enMes(0, 2), litros: 120, neto: 110000, iva: 20900 }),
  mkGastoManual({ id: "demo-gas-2", vehiculo_id: "demo-veh-1", categoria: "mantencion", descripcion: "Cambio de aceite y filtros", proveedor: "Taller Don Pedro", fecha: enMes(0, 3), total: 85000 }),
  mkGastoSii({ id: "demo-gas-3", vehiculo_id: "demo-veh-2", patente: "GHPR34", folio: 880140, fecha: enMes(0, 4), litros: 210, neto: 190000, iva: 36100 }),
  mkGastoManual({ id: "demo-gas-4", vehiculo_id: "demo-veh-2", categoria: "seguros", descripcion: "SOAP 2026", fecha: enMes(-5, 15), total: 42000 }),
  // Historia (meses anteriores) para el gráfico de tendencia.
  mkGastoSii({ id: "demo-gas-5", vehiculo_id: "demo-veh-1", patente: "JKLM12", folio: 879950, fecha: enMes(-1, 7), litros: 180, neto: 164200, iva: 31200 }),
  mkGastoManual({ id: "demo-gas-6", vehiculo_id: "demo-veh-2", categoria: "mantencion", descripcion: "Neumáticos delanteros", proveedor: "Taller Don Pedro", fecha: enMes(-1, 18), total: 120000 }),
  mkGastoSii({ id: "demo-gas-7", vehiculo_id: "demo-veh-2", patente: "GHPR34", folio: 880021, fecha: enMes(-1, 25), litros: 130, neto: 116500, iva: 22100 }),
  mkGastoSii({ id: "demo-gas-8", vehiculo_id: "demo-veh-1", patente: "JKLM12", folio: 879800, fecha: enMes(-2, 8), litros: 190, neto: 172300, iva: 32700 }),
  mkGastoManual({ id: "demo-gas-9", vehiculo_id: "demo-veh-1", categoria: "mantencion", descripcion: "Frenos y suspensión", proveedor: "Taller Don Pedro", fecha: enMes(-2, 17), total: 165000 }),
  mkGastoSii({ id: "demo-gas-10", vehiculo_id: "demo-veh-2", patente: "GHPR34", folio: 879650, fecha: enMes(-3, 7), litros: 225, neto: 201700, iva: 38300 }),
  mkGastoManual({ id: "demo-gas-11", vehiculo_id: "demo-veh-2", categoria: "otros", descripcion: "Lavado y aseo de flota", fecha: enMes(-3, 20), total: 35000 }),
  mkGastoSii({ id: "demo-gas-12", vehiculo_id: "demo-veh-1", patente: "JKLM12", folio: 879400, fecha: enMes(-4, 11), litros: 185, neto: 166400, iva: 31600 }),
  mkGastoSii({ id: "demo-gas-13", vehiculo_id: "demo-veh-2", patente: "GHPR34", folio: 879200, fecha: enMes(-5, 6), litros: 172, neto: 155500, iva: 29500 }),
];
