// Verificación del ESQUEMA COMPLETO de la base contra lo que el código espera.
// SOLO LECTURA.
//
//   npm run test:esquema
//
// El contrato lo definen los tipos de src/types/db.ts: cada `export interface`
// que corresponde a una tabla lista, campo por campo, lo que el código da por
// hecho que existe. Se leen de ahí y no de una lista escrita a mano para que
// esta prueba no envejezca sola: agregar un campo al tipo lo agrega a la
// verificación.
//
// Por qué hace falta: tsc, eslint y next build pueden estar los tres en verde
// con la app rota, porque ninguno sabe qué columnas tiene la base. Pasó de
// verdad: una migración sin correr dejó una columna que todas las consultas de
// una pantalla pedían, y la pantalla mostraba "sin datos" con los KPI en $0 en
// vez de un error. Corré esto después de cada migración.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Usá: npm run test:esquema");
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false } });

const fallas = [];
const avisos = [];
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  console.log(`  FALLA ${m}`);
  fallas.push(m);
};
const aviso = (m) => {
  console.log(`  ⚠     ${m}`);
  avisos.push(m);
};

// Qué interfaz describe qué tabla. Las que no están acá son tipos compuestos
// (joins) o restos de tablas ya retiradas.
const TABLAS = {
  Perfil: "perfiles",
  Empresa: "empresa",
  Cliente: "clientes",
  Cotizacion: "cotizaciones",
  CotizacionItem: "cotizacion_items",
  Viaje: "viajes",
  ViajeAsignacion: "viaje_asignaciones",
  Factura: "facturas",
  Chofer: "choferes",
  Vehiculo: "vehiculos",
  SiiCredencial: "sii_credenciales",
  GastoVehiculo: "gastos_vehiculo",
  ServicioTaxi: "servicios_taxi",
};

// Tablas que el código usa pero que no tienen una interfaz propia.
// Ojo: "adjuntos", "fotos", "logos" y "certificados" NO son tablas — son
// buckets de Storage, y se llaman igual con supabase.storage.from(). Van en la
// sección 4.
const SIN_TIPO = ["chofer_categorias"];

// Encomiendas se fue a Ares y la 0036 borró su rastro de esta base. Si alguna
// de estas tablas reaparece, alguien restauró un respaldo viejo: además de
// resucitar un negocio que ya no es de esta empresa, las tres primeras traen
// datos personales de destinatarios que no deberían existir acá.
const RETIRADAS = [
  "encomienda_pedidos",
  "encomienda_rutas",
  "encomienda_paradas",
  "encomienda_actividad",
  "encomienda_reglas_pago",
  "encomienda_ingresos_reales",
  "encomienda_pagos",
  "encomienda_jornadas",
  "encomienda_periodos_facturacion",
];

// ---------------------------------------------------------------------------
// Campos de cada interfaz, leídos del propio archivo de tipos
// ---------------------------------------------------------------------------
function camposDeInterfaces(ruta) {
  const fuente = readFileSync(ruta, "utf8");
  const campos = {};
  for (const m of fuente.matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
    const [, nombre, cuerpo] = m;
    campos[nombre] = cuerpo
      // Fuera los comentarios: /** ... */ y // ...
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .split("\n")
      .map((l) => l.trim().match(/^(\w+)\s*[?]?\s*:/))
      .filter(Boolean)
      .map((m2) => m2[1]);
  }
  return campos;
}

const campos = camposDeInterfaces("src/types/db.ts");

console.log(`\nProyecto: ${url}`);

// ---------------------------------------------------------------------------
console.log("\n=== 1. Existencia de las tablas ===");
for (const tabla of [...Object.values(TABLAS), ...SIN_TIPO]) {
  // Sin head:true: una petición HEAD no trae cuerpo, así que error.message
  // llega vacío y "no existe" se confunde con "todo bien".
  const { error } = await db.from(tabla).select("*").limit(1);
  if (error && /does not exist|Could not find the table/i.test(error.message)) {
    mal(`${tabla}: NO existe y el código la usa`);
  }
}
for (const tabla of RETIRADAS) {
  const { error } = await db.from(tabla).select("*").limit(1);
  if (!error) mal(`${tabla}: volvió a existir después de la 0036 (encomiendas se fue a Ares)`);
}
if (fallas.length === 0)
  ok(
    `las ${Object.keys(TABLAS).length + SIN_TIPO.length} tablas existen y las ${RETIRADAS.length} retiradas no están`,
  );

// ---------------------------------------------------------------------------
console.log("\n=== 2. Cada campo de cada tipo existe como columna ===");
for (const [interfaz, tabla] of Object.entries(TABLAS)) {
  const esperados = campos[interfaz];
  if (!esperados?.length) {
    aviso(`no pude leer los campos de la interfaz ${interfaz}`);
    continue;
  }
  // De a una: PostgREST informa solo la primera columna que no encuentra.
  const faltan = [];
  for (const col of esperados) {
    const { error } = await db.from(tabla).select(col).limit(1);
    if (error) faltan.push(col);
  }
  if (faltan.length) mal(`${tabla}: el tipo ${interfaz} espera ${faltan.join(", ")} y no está(n)`);
  else ok(`${tabla} — ${esperados.length} campos de ${interfaz}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. Los joins que arma el código ===");
// Un join mal nombrado no lo ve TypeScript: es un string que PostgREST resuelve
// por la foreign key. Si la FK cambia de nombre, la consulta falla en runtime.
const JOINS = [
  ["facturas", "*, cliente:clientes(id,nombre,codigo), viajes:viajes(id,descripcion,fecha_inicio,valor)"],
  ["cotizaciones", "*, cliente:clientes(*), items:cotizacion_items(*)"],
  ["viajes", "*, cliente:clientes(id,nombre), asignaciones:viaje_asignaciones(*)"],
  ["servicios_taxi", "*, cliente:clientes(id,nombre), chofer:choferes(id,nombre)"],
  ["gastos_vehiculo", "*, vehiculo:vehiculos(patente)"],
  ["chofer_categorias", "chofer:choferes(id, nombre, activo)"],
];
for (const [tabla, select] of JOINS) {
  const { error } = await db.from(tabla).select(select).limit(1);
  if (error) mal(`join en ${tabla}: ${error.message}`);
  else ok(`join en ${tabla}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Buckets de Storage ===");
for (const bucket of ["fotos", "logos", "certificados", "adjuntos"]) {
  const { error } = await db.storage.from(bucket).list("", { limit: 1 });
  if (error) mal(`bucket '${bucket}': ${error.message}`);
  else ok(`bucket '${bucket}'`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Volumen y truncado de PostgREST ===");
// Ninguna pantalla pagina: si una tabla pasa el tope de filas por respuesta
// (1000 por defecto en Supabase), los totales salen cortos EN SILENCIO.
for (const tabla of [...Object.values(TABLAS), ...SIN_TIPO]) {
  const { data, count, error } = await db.from(tabla).select("*", { count: "exact" });
  if (error) continue;
  if (count > 0 && (data?.length ?? 0) < count) {
    mal(`${tabla}: la API devolvió ${data.length} de ${count} filas — los totales salen cortos`);
  } else if (count >= 900) {
    aviso(`${tabla}: ${count} filas, cerca del tope de 1000 por respuesta`);
  }
}
if (!fallas.some((f) => f.includes("devolvió"))) ok("ninguna tabla se está truncando hoy");

// ---------------------------------------------------------------------------
console.log("\n=== 6. RLS: sin sesión no se ve nada ===");
if (anon) {
  const publico = createClient(url, anon, { auth: { persistSession: false } });
  const filtradas = [];
  for (const tabla of [...Object.values(TABLAS), ...SIN_TIPO]) {
    const { data, error } = await publico.from(tabla).select("*").limit(1);
    if (!error && (data?.length ?? 0) > 0) filtradas.push(tabla);
  }
  if (filtradas.length) mal(`¡un anónimo lee ${filtradas.join(", ")}!`);
  else ok(`ninguna de las ${Object.keys(TABLAS).length + SIN_TIPO.length} tablas se lee sin sesión`);
}

// ---------------------------------------------------------------------------
console.log(
  fallas.length === 0
    ? `\n=== ESQUEMA OK ===${avisos.length ? ` (${avisos.length} aviso/s)` : ""}\n`
    : `\n=== ${fallas.length} FALLA(S) ===\n${fallas.map((f) => " - " + f).join("\n")}\n`,
);
// exitCode y no process.exit(): salir a la fuerza mientras el hilo del
// resolvedor de módulos sigue vivo hace que libuv aborte en Windows con un
// "Assertion failed" después de todo el informe.
process.exitCode = fallas.length === 0 ? 0 : 1;
