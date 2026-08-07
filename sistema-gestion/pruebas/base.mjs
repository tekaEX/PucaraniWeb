// Verificación del ESQUEMA de la base contra lo que el código da por hecho.
// SOLO LECTURA: no escribe, no borra, no toca ninguna fila.
//
//   npm run test:base
//
// Existe por un caso real: la migración 0028 agregaba encomienda_actividad.origen
// y no se había corrido en la base. Todas las consultas del panel la pedían, así
// que fallaban; la página descartaba el error y mostraba "No hay actividad
// registrada en este periodo" con los KPI en $0. Ni el typecheck, ni el lint, ni
// el build lo pueden ver: para todos ellos el código está perfecto. Esto sí.
//
// Corré esto después de cada migración.
import { createClient } from "@supabase/supabase-js";
import {
  agruparPorDia,
  calcularPagoDia,
  ingresoEstimado,
  reglaVigente,
  valorPedido,
} from "@/lib/encomiendas/pago";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !service) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Corré:  npm run test:base   (que lee .env.local)",
  );
  process.exit(1);
}
const db = createClient(url, service, { auth: { persistSession: false } });

const fallas = [];
const ok = (m) => console.log(`  OK    ${m}`);
const mal = (m) => {
  console.log(`  FALLA ${m}`);
  fallas.push(m);
};

console.log(`\nProyecto: ${url}\n`);

// ---------------------------------------------------------------------------
console.log("=== 1. Tablas ===");
// Ojo con head:true acá: una petición HEAD no trae cuerpo, así que error.message
// llega VACÍO y "la tabla no existe" se confunde con "todo bien". Por eso se
// pide una fila de verdad.
for (const [tabla, deberia] of [
  ["encomienda_actividad", true],
  ["encomienda_pagos", true],
  ["encomienda_reglas_pago", true],
  ["chofer_categorias", true],
  // Retiradas por la 0027: si reaparecen, alguien restauró un respaldo viejo y
  // volvieron con datos personales de destinatarios que no deberían existir.
  ["encomienda_pedidos", false],
  ["encomienda_rutas", false],
  ["encomienda_paradas", false],
]) {
  const { error } = await db.from(tabla).select("*").limit(1);
  const existe = !error || !/does not exist|Could not find the table/i.test(error.message);
  if (existe === deberia) ok(`${tabla} ${deberia ? "existe" : "retirada (0027)"}`);
  else if (deberia) mal(`${tabla}: NO existe y el código la usa — ${error?.message}`);
  else mal(`${tabla}: volvió a existir después de la 0027`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Las consultas exactas del código ===");
for (const [tabla, select, quien] of [
  ["encomienda_actividad", "chofer_id, fecha, tipo, origen", "encomiendas/actions.ts"],
  ["encomienda_reglas_pago", "valor_pedido", "valor por entrega (0029)"],
  ["encomienda_ingresos_reales", "id, anio, mes, monto, nota", "ingresos reales (0029)"],
  [
    "encomienda_actividad",
    "chofer_id, fecha, tipo, origen, chofer:choferes(id,nombre)",
    "/encomiendas",
  ],
  [
    "encomienda_actividad",
    "id, chofer_id, fecha, tipo, origen, hora, created_at, chofer:choferes(id,nombre)",
    "/encomiendas/dia",
  ],
  [
    "encomienda_pagos",
    "id, empresa_id, chofer_id, fecha, pedidos_entregados, pedidos_no_entregados, ingresos_totales, pago_base, pago_dia, pago_bono, pago_total, regla_id, calculado_en",
    "tipo EncomiendaPago",
  ],
  [
    "encomienda_reglas_pago",
    "id, empresa_id, chofer_id, tipo_pago, valor_pago, monto_dia, meta_entregas_dia, bono_monto, vigente_desde, created_at",
    "tipo EncomiendaReglaPago",
  ],
  ["chofer_categorias", "chofer:choferes(id, nombre, activo)", "selector de Agregar día"],
]) {
  const { error } = await db.from(tabla).select(select).limit(1);
  if (error) mal(`${quien}: ${error.message}`);
  else ok(quien);
}

console.log("\n=== 3. Columnas que el código ESCRIBE ===");
for (const [tabla, columnas] of Object.entries({
  encomienda_actividad: ["id", "chofer_id", "fecha", "tipo", "hora", "origen"],
  encomienda_pagos: [
    "chofer_id", "fecha", "pedidos_entregados", "pedidos_no_entregados", "ingresos_totales",
    "pago_base", "pago_dia", "pago_bono", "regla_id", "calculado_en",
  ],
  encomienda_reglas_pago: [
    "tipo_pago", "valor_pago", "valor_pedido", "monto_dia", "meta_entregas_dia",
    "bono_monto", "vigente_desde",
  ],
  encomienda_ingresos_reales: ["anio", "mes", "monto", "nota"],
})) {
  const faltan = [];
  for (const col of columnas) {
    const { error } = await db.from(tabla).select(col).limit(1);
    if (error) faltan.push(col);
  }
  if (faltan.length) mal(`${tabla}: faltan las columnas ${faltan.join(", ")}`);
  else ok(`${tabla}: las ${columnas.length} columnas que se escriben existen`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Valores fuera de los check de la base ===");
const { data: actividad } = await db
  .from("encomienda_actividad")
  .select("chofer_id, fecha, tipo, origen, hora, chofer:choferes(id,nombre)");
const raros = (actividad ?? []).filter(
  (a) => !["entrega", "omision", "llamada"].includes(a.tipo) || !["app", "manual"].includes(a.origen),
);
if (raros.length) mal(`${raros.length} evento(s) con tipo u origen desconocido`);
else ok(`${actividad?.length ?? 0} eventos, todos con tipo y origen válidos`);

// La fecha la manda el TELÉFONO en hora de Chile (hoyChile), no se deduce de la
// hora del servidor: una entrega de las 21:30 en Arica ya es del día siguiente
// en UTC y el pago se correría de día. Acá se comprueba que efectivamente sea así.
const desfasados = (actividad ?? []).filter(
  (e) => new Date(e.hora).toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) !== e.fecha,
);
if (desfasados.length) {
  mal(`${desfasados.length} evento(s) imputados a un día distinto del que ocurrieron (zona horaria)`);
} else ok("todos los eventos caen en su día de calendario chileno");

// ---------------------------------------------------------------------------
console.log("\n=== 5. Liquidaciones ya confirmadas ===");
const { data: pagos } = await db.from("encomienda_pagos").select("*");
if (!pagos?.length) console.log("  (ninguna todavía)");
else {
  // pago_total es una columna GENERADA (0017/0024). Si deja de cuadrar, alguien
  // la recreó mal en una migración.
  const descuadres = pagos.filter(
    (p) => Number(p.pago_total) !== Number(p.pago_base) + Number(p.pago_bono) + Number(p.pago_dia),
  );
  if (descuadres.length) mal(`${descuadres.length} pago(s) donde pago_total != base + bono + día`);
  else ok(`pago_total cuadra en las ${pagos.length} liquidaciones`);

  // El panel hace `total += snapshot.pago_total` y `snapshot.pago_total !== calculado`.
  // Si llegara como string, la suma concatenaría y el badge diría siempre
  // "Por recalcular".
  if (typeof pagos[0].pago_total !== "number") {
    mal(`pago_total llega como ${typeof pagos[0].pago_total}, no como number`);
  } else ok("pago_total llega como number");
}

// ---------------------------------------------------------------------------
console.log("\n=== 6. Truncado de PostgREST ===");
// El panel del periodo pide TODA la actividad del mes de una vez, sin paginar.
// Si el proyecto tiene el "Max rows" por defecto de Supabase (1000) y el mes
// pasa esa cifra, la respuesta se corta EN SILENCIO: el panel muestra menos
// entregas de las que hubo y confirmarPagosPeriodo congela ese conteo corto.
const { data: todas, count: total } = await db
  .from("encomienda_actividad")
  .select("id", { count: "exact" });
console.log(`  ${total} filas en la tabla · la API devolvió ${todas?.length ?? 0}`);
if (total > 0 && (todas?.length ?? 0) < total) {
  mal(`PostgREST trunca a ${todas.length}: el panel del periodo subcontaría entregas`);
} else if (total < 900) {
  console.log("  (todavía hay pocas filas para que el tope se note; revisar al crecer)");
} else ok("no hay truncado con el volumen actual");

// ---------------------------------------------------------------------------
console.log("\n=== 7. Lo que va a mostrar /encomiendas ===");
const { data: reglasData } = await db.from("encomienda_reglas_pago").select("*");
const reglas = reglasData ?? [];
if (reglas.length === 0) {
  console.log(
    "  ⚠ No hay ninguna regla de pago configurada: TODO día sale 'Sin regla' y\n" +
      "    el KPI 'A pagar' queda en $0. Se cargan en /encomiendas/configuracion.",
  );
}
const dias = agruparPorDia(actividad ?? []);
for (const d of dias) {
  const regla = reglaVigente(reglas, d.choferId, d.fecha);
  const pago = calcularPagoDia(d.conteo, regla);
  console.log(
    `  ${d.fecha}  ${d.eventos[0]?.chofer?.nombre ?? "Conductor eliminado"}  ` +
      `${d.conteo.entregados} entregados · ${d.conteo.omitidos} no entregados · ` +
      `ingresos $${ingresoEstimado(d.conteo.entregados, valorPedido(regla)).toLocaleString("es-CL")} · ` +
      `a pagar $${pago.total.toLocaleString("es-CL")}${regla ? "" : "  [Sin regla]"}` +
      `${d.manuales ? `  [${d.manuales === d.eventos.length ? "Carga manual" : "Manual parcial"}]` : ""}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n=== 8. RLS: sin sesión no se ve nada ===");
if (anon) {
  const publico = createClient(url, anon, { auth: { persistSession: false } });
  for (const tabla of ["encomienda_actividad", "encomienda_pagos", "encomienda_reglas_pago"]) {
    const { data, error } = await publico.from(tabla).select("*").limit(1);
    if (error || (data?.length ?? 0) === 0) ok(`${tabla}: un anónimo no lee nada`);
    else mal(`${tabla}: ¡un anónimo lee ${data.length} fila(s)!`);
  }
}

console.log(
  fallas.length === 0
    ? "\n=== SIN FALLAS DE ESQUEMA ===\n"
    : `\n=== ${fallas.length} FALLA(S) ===\n${fallas.map((f) => " - " + f).join("\n")}\n`,
);
process.exit(fallas.length === 0 ? 0 : 1);
