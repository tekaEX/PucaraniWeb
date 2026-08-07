// Integridad de los DATOS que ya están guardados. SOLO LECTURA.
//
//   npm run test:datos
//
// El esquema puede estar perfecto y los números igual no cuadrar: una cotización
// cuyo total no es subtotal + IVA, un gasto apuntando a una patente que ya no
// existe, una factura pagada antes de emitirse. Nada de eso lo ve el typecheck
// —son datos, no tipos— y ninguna pantalla lo grita: simplemente muestra una
// cifra equivocada.
//
// Cada chequeo dice qué habría que mirar si falla, no solo que falló.
import { createClient } from "@supabase/supabase-js";
import { facturaEstadoDerivado, costoTotalViaje } from "@/types/db";
import { formatearPatente } from "@/lib/patentes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) {
  console.error("Faltan las variables de .env.local. Usá: npm run test:datos");
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false } });

const fallas = [];
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m, detalle = []) => {
  console.log(`  FALLA ${m}`);
  for (const d of detalle.slice(0, 5)) console.log(`          ${d}`);
  if (detalle.length > 5) console.log(`          …y ${detalle.length - 5} más`);
  fallas.push(m);
};
const n = (v) => Number(v ?? 0);
const clp = (v) => `$${n(v).toLocaleString("es-CL")}`;

const [
  { data: clientes },
  { data: vehiculos },
  { data: choferes },
  { data: cotizaciones },
  { data: items },
  { data: viajes },
  { data: facturas },
  { data: gastos },
  { data: taxis },
  { data: asignaciones },
] = await Promise.all([
  db.from("clientes").select("id, nombre"),
  db.from("vehiculos").select("patente, activo"),
  db.from("choferes").select("id, nombre"),
  db.from("cotizaciones").select("*"),
  db.from("cotizacion_items").select("*"),
  db.from("viajes").select("*"),
  db.from("facturas").select("*"),
  db.from("gastos_vehiculo").select("*"),
  db.from("servicios_taxi").select("*"),
  db.from("viaje_asignaciones").select("*"),
]);

console.log(`\nProyecto: ${url}`);
console.log(
  `Volumen: ${clientes.length} clientes · ${vehiculos.length} vehículos · ${choferes.length} choferes · ` +
    `${cotizaciones.length} cotizaciones · ${viajes.length} viajes · ${facturas.length} facturas · ` +
    `${gastos.length} gastos · ${taxis.length} taxis`,
);

// ---------------------------------------------------------------------------
console.log("\n=== 1. Las cuentas de cada documento cuadran ===");

const cotMal = cotizaciones.filter((c) => n(c.subtotal) + n(c.iva) !== n(c.total));
if (cotMal.length) {
  mal(
    `${cotMal.length} cotización(es) donde subtotal + IVA ≠ total`,
    cotMal.map((c) => `N° ${c.numero}: ${clp(c.subtotal)} + ${clp(c.iva)} ≠ ${clp(c.total)}`),
  );
} else ok(`las ${cotizaciones.length} cotizaciones cuadran (subtotal + IVA = total)`);

// El IVA chileno es 19 % del neto, salvo servicio exento.
const ivaMal = cotizaciones.filter((c) =>
  c.exento_iva ? n(c.iva) !== 0 : n(c.iva) !== Math.round(n(c.subtotal) * 0.19),
);
if (ivaMal.length) {
  mal(
    `${ivaMal.length} cotización(es) con el IVA mal calculado`,
    ivaMal.map(
      (c) =>
        `N° ${c.numero}${c.exento_iva ? " (exenta)" : ""}: IVA ${clp(c.iva)}, ` +
        `esperado ${clp(c.exento_iva ? 0 : Math.round(n(c.subtotal) * 0.19))}`,
    ),
  );
} else ok("el IVA es 19 % del neto en todas (y 0 en las exentas)");

// El subtotal tiene que ser la suma de sus ítems.
const porCotizacion = new Map();
for (const i of items) {
  porCotizacion.set(i.cotizacion_id, n(porCotizacion.get(i.cotizacion_id)) + n(i.total));
}
const subMal = cotizaciones.filter(
  (c) => porCotizacion.has(c.id) && porCotizacion.get(c.id) !== n(c.subtotal),
);
if (subMal.length) {
  mal(
    `${subMal.length} cotización(es) cuyo subtotal no es la suma de sus ítems`,
    subMal.map((c) => `N° ${c.numero}: ítems ${clp(porCotizacion.get(c.id))} vs subtotal ${clp(c.subtotal)}`),
  );
} else ok("cada subtotal es la suma de los ítems de su cotización");

const facMal = facturas.filter((f) => n(f.neto) + n(f.iva) !== n(f.total));
if (facMal.length) {
  mal(
    `${facMal.length} factura(s) donde neto + IVA ≠ total`,
    facMal.map((f) => `folio ${f.folio}: ${clp(f.neto)} + ${clp(f.iva)} ≠ ${clp(f.total)}`),
  );
} else ok(`las ${facturas.length} facturas cuadran (neto + IVA = total)`);

// ---------------------------------------------------------------------------
console.log("\n=== 2. Referencias que apuntan a algo que existe ===");
const idsCliente = new Set(clientes.map((c) => c.id));
const patentes = new Set(vehiculos.map((v) => v.patente));
const idsChofer = new Set(choferes.map((c) => c.id));
const idsFactura = new Set(facturas.map((f) => f.id));
const idsViaje = new Set(viajes.map((v) => v.id));
const idsCotizacion = new Set(cotizaciones.map((c) => c.id));

const huerfanos = [
  ["viajes.cliente_id", viajes.filter((v) => v.cliente_id && !idsCliente.has(v.cliente_id))],
  ["viajes.factura_id", viajes.filter((v) => v.factura_id && !idsFactura.has(v.factura_id))],
  ["viajes.cotizacion_id", viajes.filter((v) => v.cotizacion_id && !idsCotizacion.has(v.cotizacion_id))],
  ["facturas.cliente_id", facturas.filter((f) => f.cliente_id && !idsCliente.has(f.cliente_id))],
  ["cotizaciones.cliente_id", cotizaciones.filter((c) => c.cliente_id && !idsCliente.has(c.cliente_id))],
  ["cotizacion_items.cotizacion_id", items.filter((i) => !idsCotizacion.has(i.cotizacion_id))],
  ["viaje_asignaciones.viaje_id", asignaciones.filter((a) => !idsViaje.has(a.viaje_id))],
  ["viaje_asignaciones.chofer_id", asignaciones.filter((a) => a.chofer_id && !idsChofer.has(a.chofer_id))],
  ["viaje_asignaciones.vehiculo_id", asignaciones.filter((a) => a.vehiculo_id && !patentes.has(a.vehiculo_id))],
  ["servicios_taxi.cliente_id", taxis.filter((t) => t.cliente_id && !idsCliente.has(t.cliente_id))],
  ["servicios_taxi.chofer_id", taxis.filter((t) => t.chofer_id && !idsChofer.has(t.chofer_id))],
];
// gastos_vehiculo apunta al vehículo por patente (migración 0008).
const colGasto = gastos[0] && "patente" in gastos[0] ? "patente" : "vehiculo_id";
huerfanos.push([
  `gastos_vehiculo.${colGasto}`,
  gastos.filter((g) => g[colGasto] && !patentes.has(g[colGasto])),
]);

let rotas = 0;
for (const [campo, filas] of huerfanos) {
  if (filas.length) {
    rotas += filas.length;
    mal(`${filas.length} fila(s) en ${campo} apuntan a algo que ya no existe`);
  }
}
if (rotas === 0) ok(`las ${huerfanos.length} relaciones apuntan a filas que existen`);

// ---------------------------------------------------------------------------
console.log("\n=== 3. Estados y fechas coherentes ===");

// Una factura pagada antes de emitirse es un error de carga.
const pagoAntes = facturas.filter(
  (f) => f.fecha_pago && f.fecha_emision && f.fecha_pago < f.fecha_emision,
);
if (pagoAntes.length) {
  mal(
    `${pagoAntes.length} factura(s) con fecha de pago ANTERIOR a la de emisión`,
    pagoAntes.map((f) => `folio ${f.folio}: emitida ${f.fecha_emision}, pagada ${f.fecha_pago}`),
  );
} else ok("ninguna factura se pagó antes de emitirse");

// El estado se DERIVA de fecha_pago (ver facturaEstadoDerivado): una emitida
// sin fecha de emisión no puede fecharse en ningún periodo y desaparece de
// cobranzas sin avisar.
const sinEmision = facturas.filter(
  (f) => facturaEstadoDerivado(f) !== "borrador" && !f.fecha_emision,
);
if (sinEmision.length) {
  mal(
    `${sinEmision.length} factura(s) no-borrador SIN fecha de emisión: no entran en ningún periodo`,
    sinEmision.map((f) => `folio ${f.folio ?? "—"} (${f.estado})`),
  );
} else ok("toda factura emitida tiene fecha de emisión");

const finAntes = viajes.filter((v) => v.fecha_fin && v.fecha_fin < v.fecha_inicio);
if (finAntes.length) {
  mal(`${finAntes.length} viaje(s) que terminan antes de empezar`,
    finAntes.map((v) => `${v.descripcion}: ${v.fecha_inicio} → ${v.fecha_fin}`));
} else ok("ningún viaje termina antes de empezar");

// Un viaje facturado tiene que apuntar a su factura, y uno con factura no
// debería seguir "pendiente".
const facturadoSinFactura = viajes.filter((v) => v.estado === "facturado" && !v.factura_id);
if (facturadoSinFactura.length) {
  mal(`${facturadoSinFactura.length} viaje(s) marcados "facturado" sin factura asociada`);
} else ok("todo viaje facturado apunta a su factura");

// ---------------------------------------------------------------------------
console.log("\n=== 4. Valores dentro de lo permitido ===");
const ENUMS = [
  ["cotizaciones.estado", cotizaciones, "estado", ["borrador", "enviada", "aceptada", "rechazada"]],
  ["viajes.estado", viajes, "estado", ["pendiente", "en_curso", "realizado", "facturado", "cancelado"]],
  ["facturas.estado", facturas, "estado", ["borrador", "emitida", "anulada"]],
];
let fuera = 0;
for (const [nombre, filas, campo, permitidos] of ENUMS) {
  const raros = [...new Set(filas.map((f) => f[campo]).filter((v) => v && !permitidos.includes(v)))];
  if (raros.length) {
    fuera += raros.length;
    mal(`${nombre}: valores desconocidos → ${raros.join(", ")}`);
  }
}
if (fuera === 0) ok("todos los estados están dentro de los valores que el código conoce");

// La patente es la PK del vehículo: guardada en dos formatos, parte el
// historial en dos (ver lib/patentes.ts).
const patenteMal = vehiculos.filter((v) => formatearPatente(v.patente) !== v.patente);
if (patenteMal.length) {
  mal(
    `${patenteMal.length} patente(s) fuera del formato canónico`,
    patenteMal.map((v) => `"${v.patente}" debería ser "${formatearPatente(v.patente) ?? "— no es una patente válida"}"`),
  );
} else ok(`las ${vehiculos.length} patentes están en formato canónico`);

const negativos = [
  ["viajes.valor", viajes.filter((v) => n(v.valor) < 0)],
  ["facturas.total", facturas.filter((f) => n(f.total) < 0)],
  ["gastos_vehiculo.monto", gastos.filter((g) => n(g.monto) < 0)],
  ["servicios_taxi.monto", taxis.filter((t) => n(t.monto) < 0)],
];
const conNegativos = negativos.filter(([, f]) => f.length);
if (conNegativos.length) {
  for (const [campo, filas] of conNegativos) mal(`${filas.length} valor(es) negativo(s) en ${campo}`);
} else ok("ningún monto es negativo");

// ---------------------------------------------------------------------------
console.log("\n=== 5. Numeración sin repetidos ===");
for (const [nombre, filas, campo] of [
  ["cotizaciones.numero", cotizaciones, "numero"],
  ["facturas.folio", facturas.filter((f) => f.folio != null), "folio"],
]) {
  const vistos = new Map();
  const repes = [];
  for (const f of filas) {
    const k = f[campo];
    if (vistos.has(k)) repes.push(k);
    vistos.set(k, true);
  }
  if (repes.length) mal(`${nombre}: números repetidos → ${[...new Set(repes)].join(", ")}`);
  else ok(`${nombre}: sin repetidos (${filas.length} documentos)`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Costos de viaje ===");
const costoMayor = viajes.filter((v) => costoTotalViaje(v) > n(v.valor) && n(v.valor) > 0);
if (costoMayor.length) {
  // No es un error de datos, es plata perdida: se informa para que se mire.
  console.log(`  ⚠     ${costoMayor.length} viaje(s) cuyo costo supera lo cobrado:`);
  for (const v of costoMayor.slice(0, 5)) {
    console.log(`          ${v.descripcion}: costo ${clp(costoTotalViaje(v))} vs valor ${clp(v.valor)}`);
  }
} else ok("ningún viaje costó más de lo que se cobró");

// ---------------------------------------------------------------------------
console.log(
  fallas.length === 0
    ? "\n=== DATOS CONSISTENTES ===\n"
    : `\n=== ${fallas.length} PROBLEMA(S) DE DATOS ===\n${fallas.map((f) => " - " + f).join("\n")}\n`,
);
// exitCode y no process.exit(): salir a la fuerza mientras el hilo del
// resolvedor de módulos sigue vivo hace que libuv aborte en Windows con un
// "Assertion failed" después de todo el informe.
process.exitCode = fallas.length === 0 ? 0 : 1;
