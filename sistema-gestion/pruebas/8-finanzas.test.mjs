// Resumen financiero mensual: el modelo de dominio que faltaba (T007).
//
// Lo que se fija acá no son las sumas —eso es fácil— sino POR QUÉ FECHA entra
// cada cosa al periodo. Una factura pagada cuenta el mes en que se pagó, no el
// que se emitió. Un viaje sin facturar pesa el mes en que se hizo. Equivocarse
// de fecha no rompe nada visible: devuelve un número plausible en el mes
// equivocado, y eso se descubre cuando ya se decidió algo con él.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resumenFinanciero,
  ingresosDe,
  costosDe,
  delta,
  serieMensual,
  ingresosPorCliente,
  egresosPorVehiculo,
  egresosPorCategoria,
} from "@/lib/finanzas";
import { mesesVentana } from "@/lib/periodo";

const MAYO = { anio: 2026, mes: 5 };
const JUNIO = { anio: 2026, mes: 6 };
const ANIO = { anio: 2026, mes: null };

const vacio = {
  facturas: [],
  viajes: [],
  gastos: [],
  taxis: [],
  cotizaciones: [],
};
const datos = (parcial) => ({ ...vacio, ...parcial });

// ---------------------------------------------------------------------------
// Ingresos
// ---------------------------------------------------------------------------

test("una factura entra como ingreso por su fecha de PAGO, no la de emisión", () => {
  const d = datos({
    facturas: [
      {
        estado: "emitida",
        total: 500000,
        fecha_emision: "2026-05-28", // emitida en mayo…
        fecha_pago: "2026-06-03", //    …cobrada en junio
      },
    ],
  });
  assert.equal(ingresosDe(d, MAYO), 0, "no es ingreso de mayo: todavía no la pagaron");
  assert.equal(ingresosDe(d, JUNIO), 500000, "es ingreso de junio, cuando entró la plata");
});

test("una factura emitida y sin pagar no es ingreso de ningún mes", () => {
  const d = datos({
    facturas: [
      { estado: "emitida", total: 500000, fecha_emision: "2026-05-10", fecha_pago: null },
    ],
  });
  assert.equal(ingresosDe(d, MAYO), 0);
  assert.equal(ingresosDe(d, ANIO), 0);
});

test("una factura anulada no suma aunque tenga fecha de pago", () => {
  const d = datos({
    facturas: [
      { estado: "anulada", total: 500000, fecha_emision: "2026-05-10", fecha_pago: "2026-05-20" },
    ],
  });
  assert.equal(ingresosDe(d, MAYO), 0);
});

test("un borrador no suma: todavía no es un documento", () => {
  const d = datos({
    facturas: [
      { estado: "borrador", total: 500000, fecha_emision: "2026-05-10", fecha_pago: "2026-05-20" },
    ],
  });
  assert.equal(ingresosDe(d, MAYO), 0);
});

test("los taxis entran por su propia fecha: se cobran al momento", () => {
  const d = datos({
    taxis: [
      { fecha: "2026-05-02", monto: 12000 },
      { fecha: "2026-06-02", monto: 9000 },
    ],
  });
  assert.equal(ingresosDe(d, MAYO), 12000);
  assert.equal(ingresosDe(d, ANIO), 21000, "en vista anual entran los dos");
});

// ---------------------------------------------------------------------------
// Costos
// ---------------------------------------------------------------------------

test("un viaje cancelado no cuesta: no salió", () => {
  const base = {
    valor: 100000,
    factura_id: null,
    fecha_inicio: "2026-05-10",
    costo_combustible: 30000,
    costo_peajes: 5000,
    costo_viaticos: 0,
    costo_otros: 0,
  };
  const real = datos({ viajes: [{ ...base, estado: "realizado" }] });
  const cancelado = datos({ viajes: [{ ...base, estado: "cancelado" }] });
  assert.ok(costosDe(real, MAYO) > 0);
  assert.equal(costosDe(cancelado, MAYO), 0);
});

test("los gastos de flota entran por su fecha", () => {
  const d = datos({
    gastos: [
      { monto_total: 80000, fecha: "2026-05-15" },
      { monto_total: 40000, fecha: "2026-06-15" },
    ],
  });
  assert.equal(costosDe(d, MAYO), 80000);
  assert.equal(costosDe(d, JUNIO), 40000);
});

// ---------------------------------------------------------------------------
// El resumen completo
// ---------------------------------------------------------------------------

test("pendiente de facturar: viaje realizado sin factura, por su fecha de inicio", () => {
  const d = datos({
    viajes: [
      { estado: "realizado", factura_id: null, valor: 300000, fecha_inicio: "2026-05-04" },
      { estado: "realizado", factura_id: "f-1", valor: 700000, fecha_inicio: "2026-05-04" },
      { estado: "programado", factura_id: null, valor: 900000, fecha_inicio: "2026-05-04" },
    ],
  });
  // Solo el primero: el segundo ya está facturado y el tercero todavía no se hizo.
  assert.equal(resumenFinanciero(d, MAYO).pendienteFacturar, 300000);
});

test("por cobrar: emitida y sin pagar, por fecha de EMISIÓN", () => {
  const d = datos({
    facturas: [
      { estado: "emitida", total: 250000, fecha_emision: "2026-05-09", fecha_pago: null },
      { estado: "emitida", total: 400000, fecha_emision: "2026-05-09", fecha_pago: "2026-05-20" },
    ],
  });
  const r = resumenFinanciero(d, MAYO);
  assert.equal(r.porCobrar, 250000, "la pagada ya no está por cobrar");
  assert.equal(r.ingresos, 400000, "…pero sí es ingreso");
});

test("utilidad y margen salen de ingresos y costos", () => {
  const d = datos({
    facturas: [
      { estado: "emitida", total: 1000000, fecha_emision: "2026-05-01", fecha_pago: "2026-05-30" },
    ],
    gastos: [{ monto_total: 250000, fecha: "2026-05-10" }],
  });
  const r = resumenFinanciero(d, MAYO);
  assert.equal(r.ingresos, 1000000);
  assert.equal(r.costos, 250000);
  assert.equal(r.utilidad, 750000);
  assert.equal(r.margen, 75);
});

test("sin ingresos el margen es null, no 0%", () => {
  // Un mes con gastos y sin cobros tiene utilidad negativa y margen indefinido.
  // Mostrar "0%" sería decir que se salió a cero, que es otra cosa.
  const d = datos({ gastos: [{ monto_total: 250000, fecha: "2026-05-10" }] });
  const r = resumenFinanciero(d, MAYO);
  assert.equal(r.ingresos, 0);
  assert.equal(r.utilidad, -250000);
  assert.equal(r.margen, null);
});

// ---------------------------------------------------------------------------
// Comparación con el periodo anterior
// ---------------------------------------------------------------------------

test("delta: variación porcentual redondeada", () => {
  assert.equal(delta(150, 100), 50);
  assert.equal(delta(50, 100), -50);
  assert.equal(delta(100, 100), 0);
});

test("delta contra cero es null, no +100%", () => {
  // De cero a cualquier cosa no es un porcentaje: es una división por cero.
  assert.equal(delta(500000, 0), null);
  assert.equal(delta(0, 0), null);
});

// ---------------------------------------------------------------------------
// KPIs del dashboard (T009): los conteos y el cotizado del periodo
// ---------------------------------------------------------------------------

test("el cotizado filtra por periodo y no confía en que la consulta ya filtró", () => {
  // El dashboard trae DOS meses de una pasada (el actual y el anterior, para
  // las variaciones) y filtra en memoria. Si totalCotizado sumara todo lo que
  // recibe, el KPI de mayo mostraría también lo de abril.
  const d = datos({
    cotizaciones: [
      { total: 800000, fecha: "2026-05-12" },
      { total: 300000, fecha: "2026-04-30" },
    ],
  });
  const r = resumenFinanciero(d, MAYO);
  assert.equal(r.totalCotizado, 800000);
  assert.equal(r.conteos.cotizaciones, 1);
});

test("cada conteo corresponde al monto que acompaña", () => {
  const d = datos({
    cotizaciones: [
      { total: 100000, fecha: "2026-05-02" },
      { total: 200000, fecha: "2026-05-03" },
    ],
    viajes: [
      {
        estado: "realizado",
        factura_id: null,
        valor: 50000,
        fecha_inicio: "2026-05-04",
        costo_combustible: 0,
        costo_peajes: 0,
        costo_viaticos: 0,
        costo_otros: 0,
      },
    ],
    facturas: [
      { estado: "emitida", total: 70000, fecha_emision: "2026-05-05", fecha_pago: null },
      { estado: "emitida", total: 90000, fecha_emision: "2026-05-06", fecha_pago: "2026-05-20" },
    ],
  });
  const r = resumenFinanciero(d, MAYO);
  assert.deepEqual(r.conteos, {
    cotizaciones: 2,
    porFacturar: 1,
    porCobrar: 1,
    pagadas: 1,
  });
  assert.equal(r.totalCotizado, 300000);
  assert.equal(r.pendienteFacturar, 50000);
  assert.equal(r.porCobrar, 70000);
  assert.equal(r.ingresos, 90000);
});

test("cero con documentos NO es lo mismo que cero sin documentos", () => {
  // La razón de que los conteos estén en el modelo: $0 con 0 facturas es un mes
  // sin trabajo; $0 con 3 facturas emitidas es que nadie cobró.
  const sinTrabajo = resumenFinanciero(datos({}), MAYO);
  const sinCobrar = resumenFinanciero(
    datos({
      facturas: [
        { estado: "emitida", total: 100000, fecha_emision: "2026-05-01", fecha_pago: null },
        { estado: "emitida", total: 200000, fecha_emision: "2026-05-02", fecha_pago: null },
        { estado: "emitida", total: 300000, fecha_emision: "2026-05-03", fecha_pago: null },
      ],
    }),
    MAYO,
  );
  assert.equal(sinTrabajo.ingresos, 0);
  assert.equal(sinCobrar.ingresos, 0);
  assert.equal(sinTrabajo.conteos.porCobrar, 0);
  assert.equal(sinCobrar.conteos.porCobrar, 3, "el conteo es lo que distingue los dos casos");
});

// ---------------------------------------------------------------------------
// El periodo global aplicado al resumen (T010)
// ---------------------------------------------------------------------------

test("el MISMO conjunto de datos da resúmenes distintos según el periodo", () => {
  // Así funciona el dashboard: una sola carga cubre el mes elegido y el
  // anterior, y el periodo es lo único que cambia entre las dos lecturas.
  const d = datos({
    facturas: [
      { estado: "emitida", total: 100000, fecha_emision: "2026-05-01", fecha_pago: "2026-05-15" },
      { estado: "emitida", total: 400000, fecha_emision: "2026-06-01", fecha_pago: "2026-06-15" },
    ],
  });
  assert.equal(resumenFinanciero(d, MAYO).ingresos, 100000);
  assert.equal(resumenFinanciero(d, JUNIO).ingresos, 400000);
  assert.equal(delta(400000, 100000), 300, "junio triplicó a mayo");
});

test("en vista anual (mes = null) entra todo el año y nada de otro", () => {
  const d = datos({
    taxis: [
      { fecha: "2026-01-01", monto: 1000 },
      { fecha: "2026-12-31", monto: 2000 },
      { fecha: "2025-12-31", monto: 4000 },
      { fecha: "2027-01-01", monto: 8000 },
    ],
  });
  assert.equal(resumenFinanciero(d, ANIO).ingresos, 3000);
});

test("el borde del mes entra: el día 1 y el último cuentan", () => {
  // Los rangos son inclusivos. Un servicio del 31 que quede fuera es plata que
  // desaparece del mes sin que nadie lo note.
  const d = datos({
    taxis: [
      { fecha: "2026-05-01", monto: 1000 },
      { fecha: "2026-05-31", monto: 2000 },
      { fecha: "2026-04-30", monto: 4000 },
      { fecha: "2026-06-01", monto: 8000 },
    ],
  });
  assert.equal(resumenFinanciero(d, MAYO).ingresos, 3000);
});

test("una fecha con hora completa (timestamp) sigue cayendo en su mes", () => {
  // Postgres devuelve `timestamptz` en algunas columnas y `date` en otras. Si
  // el filtro comparara el string entero, "2026-05-31T22:00:00Z" quedaría
  // fuera de un rango que termina en "2026-05-31".
  const d = datos({ taxis: [{ fecha: "2026-05-31T22:00:00.000Z", monto: 5000 }] });
  assert.equal(resumenFinanciero(d, MAYO).ingresos, 5000);
});

// ---------------------------------------------------------------------------
// Informe mensual: la ventana de meses y los cortes (User Story 6)
// ---------------------------------------------------------------------------

test("la ventana son 6 meses que TERMINAN en el periodo elegido", () => {
  const meses = mesesVentana(MAYO, "2026-08-17");
  assert.equal(meses.length, 6);
  assert.deepEqual(meses.at(-1), MAYO, "el último es el mes que se está mirando");
  assert.deepEqual(meses[0], { anio: 2025, mes: 12 });
  assert.deepEqual(
    meses.map((m) => m.mes),
    [12, 1, 2, 3, 4, 5],
    "van del más viejo al más nuevo",
  );
});

test("la ventana cruza el año sin inventar un mes 0 ni un mes 13", () => {
  // Es la aritmética que más se rompe: enero menos uno es diciembre del año
  // anterior, no "mes 0 de este año".
  assert.deepEqual(mesesVentana({ anio: 2026, mes: 1 }, "2026-08-17", 3), [
    { anio: 2025, mes: 11 },
    { anio: 2025, mes: 12 },
    { anio: 2026, mes: 1 },
  ]);
  assert.deepEqual(mesesVentana({ anio: 2026, mes: 12 }, "2026-08-17", 2), [
    { anio: 2026, mes: 11 },
    { anio: 2026, mes: 12 },
  ]);
});

test("en vista anual la ventana termina en el mes en curso, o en diciembre", () => {
  // Mirando el año corriente, el gráfico no puede terminar en diciembre: serían
  // cuatro columnas vacías de meses que todavía no pasaron.
  assert.deepEqual(mesesVentana(ANIO, "2026-08-17").at(-1), { anio: 2026, mes: 8 });
  // Un año ya cerrado se ve completo hasta diciembre.
  assert.deepEqual(mesesVentana({ anio: 2024, mes: null }, "2026-08-17").at(-1), {
    anio: 2024,
    mes: 12,
  });
});

test("la ventana se ancla al día de CHILE, no al reloj del servidor", () => {
  // El servidor corre en UTC: la noche del 31 de agosto en Chile allá ya es
  // septiembre. Con el reloj del servidor, el gráfico se adelantaba un mes y
  // escondía justo el que se estaba mirando.
  assert.deepEqual(mesesVentana(ANIO, "2026-08-31").at(-1), { anio: 2026, mes: 8 });
  assert.deepEqual(mesesVentana(ANIO, "2026-09-01").at(-1), { anio: 2026, mes: 9 });
});

test("la serie mensual usa las MISMAS cifras que el resumen de cada mes", () => {
  // Es la razón de que serieMensual llame a ingresosDe/costosDe en vez de sumar
  // por su cuenta: si el gráfico y el KPI de un mes discrepan en la misma
  // pantalla, no hay forma de saber cuál está bien.
  const d = datos({
    facturas: [
      { estado: "emitida", total: 300000, fecha_emision: "2026-04-01", fecha_pago: "2026-04-20" },
      { estado: "emitida", total: 500000, fecha_emision: "2026-05-02", fecha_pago: "2026-05-10" },
    ],
    gastos: [{ fecha: "2026-05-05", monto_total: 120000 }],
    taxis: [{ fecha: "2026-05-15", monto: 8000 }],
  });
  const serie = serieMensual(d, mesesVentana(MAYO, "2026-08-17"), MAYO);
  const mayo = serie.at(-1);
  assert.equal(mayo.ingresos, resumenFinanciero(d, MAYO).ingresos);
  assert.equal(mayo.egresos, resumenFinanciero(d, MAYO).costos);
  assert.equal(mayo.ingresos, 508000);
  const abril = serie.at(-2);
  assert.equal(abril.ingresos, 300000, "cada mes se calcula con su propio periodo");
  assert.equal(abril.egresos, 0);
});

test("la serie marca cuál es el mes elegido y le pone etiqueta corta", () => {
  const serie = serieMensual(vacio, mesesVentana(MAYO, "2026-08-17"), MAYO);
  assert.deepEqual(
    serie.map((m) => m.label),
    ["dic", "ene", "feb", "mar", "abr", "may"],
  );
  assert.deepEqual(
    serie.map((m) => m.actual),
    [false, false, false, false, false, true],
  );
});

test("los ingresos por cliente suman lo mismo que el KPI de ingresos", () => {
  // Si el corte no incluyera los taxis, la tabla de clientes daría menos que la
  // tarjeta de arriba y no habría forma de saber cuál miente.
  const d = datos({
    facturas: [
      {
        estado: "emitida",
        total: 500000,
        fecha_emision: "2026-05-02",
        fecha_pago: "2026-05-10",
        cliente: { nombre: "Minera Sur" },
      },
      {
        estado: "emitida",
        total: 200000,
        fecha_emision: "2026-05-03",
        fecha_pago: "2026-05-11",
        cliente: { nombre: "Minera Sur" },
      },
    ],
    taxis: [
      { fecha: "2026-05-15", monto: 8000, cliente: { nombre: "Hotel Arica" } },
      { fecha: "2026-05-16", monto: 9000, cliente: null, cliente_texto: null },
    ],
  });
  const corte = ingresosPorCliente(d, MAYO);
  assert.equal(
    corte.reduce((a, c) => a + c.total, 0),
    resumenFinanciero(d, MAYO).ingresos,
  );
  // De mayor a menor: es el orden en que se lee la tabla de la pantalla.
  assert.deepEqual(corte, [
    { clave: "Minera Sur", total: 700000 },
    { clave: "Taxis (particular)", total: 9000 },
    { clave: "Hotel Arica", total: 8000 },
  ]);
});

test("el corte por cliente respeta el periodo y la fecha de pago", () => {
  const d = datos({
    facturas: [
      {
        estado: "emitida",
        total: 500000,
        fecha_emision: "2026-05-28",
        fecha_pago: "2026-06-03",
        cliente: { nombre: "Minera Sur" },
      },
    ],
  });
  assert.deepEqual(ingresosPorCliente(d, MAYO), [], "en mayo todavía no se cobró");
  assert.deepEqual(ingresosPorCliente(d, JUNIO), [{ clave: "Minera Sur", total: 500000 }]);
});

test("los egresos por vehículo van por patente, y lo sin asignar no se pierde", () => {
  const d = datos({
    gastos: [
      { fecha: "2026-05-02", monto_total: 50000, categoria: "combustible", vehiculo_id: "ABCD-12" },
      { fecha: "2026-05-09", monto_total: 30000, categoria: "mantencion", vehiculo_id: "ABCD-12" },
      { fecha: "2026-05-10", monto_total: 90000, categoria: "otros", vehiculo_id: null },
      { fecha: "2026-04-30", monto_total: 999, categoria: "otros", vehiculo_id: "ABCD-12" },
    ],
  });
  assert.deepEqual(egresosPorVehiculo(d, MAYO), [
    { clave: "Sin asignar", total: 90000 },
    { clave: "ABCD-12", total: 80000 },
  ]);
});

test("los egresos por categoría se ordenan por monto y omiten las que dan 0", () => {
  const d = datos({
    gastos: [
      { fecha: "2026-05-02", monto_total: 50000, categoria: "combustible", vehiculo_id: "ABCD-12" },
      { fecha: "2026-05-03", monto_total: 70000, categoria: "seguros", vehiculo_id: "ABCD-12" },
    ],
  });
  assert.deepEqual(egresosPorCategoria(d, MAYO), [
    { categoria: "seguros", total: 70000 },
    { categoria: "combustible", total: 50000 },
  ]);
});

test("los cortes de un periodo sin movimiento quedan vacíos, no en cero", () => {
  // Una fila "Sin asignar: $0" o un cliente con $0 son ruido: la pantalla
  // muestra su estado vacío, que dice lo que pasa.
  assert.deepEqual(ingresosPorCliente(vacio, MAYO), []);
  assert.deepEqual(egresosPorVehiculo(vacio, MAYO), []);
  assert.deepEqual(egresosPorCategoria(vacio, MAYO), []);
});
