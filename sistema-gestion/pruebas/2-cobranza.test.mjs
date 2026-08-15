// Estado de cuenta por cliente: lo que se le debe a la empresa. Es la pantalla
// que decide a quién hay que ir a cobrar, así que un error acá no se ve — se
// nota cuando falta la plata.
//
// La regla que hace todo esto delicado: una factura entra en el periodo por una
// fecha DISTINTA según su estado. Pagada, por fecha de pago; emitida o anulada,
// por fecha de emisión; borrador, siempre. Confundirlas mueve plata de un mes a
// otro sin que nadie lo note.
import test from "node:test";
import assert from "node:assert/strict";
import { construirCuentas } from "@/lib/cobranza-server";
import { diasDesde, DIAS_VENCE, cuentaVacia } from "@/lib/cobranza";
import { facturaEstadoDerivado, costoTotalViaje } from "@/types/db";
import { hoyChile } from "@/lib/format";

const AGOSTO = { anio: 2026, mes: 8 };
const ANIO = { anio: 2026, mes: null };

const CLIENTE = { id: "c1", nombre: "Empresa Portuaria" };

const F = (o) => ({
  id: o.id ?? "f",
  cliente: o.cliente === undefined ? CLIENTE : o.cliente,
  estado: o.estado ?? "emitida",
  fecha_emision: o.fecha_emision ?? null,
  fecha_pago: o.fecha_pago ?? null,
  total: o.total ?? 0,
});

const V = (o) => ({
  id: o.id ?? "v",
  cliente_id: o.cliente_id ?? "c1",
  cliente: o.cliente === undefined ? CLIENTE : o.cliente,
  fecha_inicio: o.fecha_inicio ?? "2026-08-10",
  descripcion: o.descripcion ?? "Traslado",
  valor: o.valor ?? 0,
});

// -------------------------------------------------- estado derivado
test("el estado de una factura se DERIVA, no se declara", () => {
  assert.equal(facturaEstadoDerivado({ estado: "borrador", fecha_pago: null }), "borrador");
  assert.equal(facturaEstadoDerivado({ estado: "anulada", fecha_pago: null }), "anulada");
  assert.equal(facturaEstadoDerivado({ estado: "emitida", fecha_pago: null }), "por_cobrar");
  assert.equal(facturaEstadoDerivado({ estado: "emitida", fecha_pago: "2026-08-20" }), "pagada");
});

test("anulada gana sobre pagada: una factura anulada no es plata que entró", () => {
  // Si el orden de los if estuviera al revés, una anulada con fecha de pago
  // contaría como ingreso.
  assert.equal(facturaEstadoDerivado({ estado: "anulada", fecha_pago: "2026-08-20" }), "anulada");
});

test("un borrador con fecha de pago sigue siendo borrador", () => {
  assert.equal(facturaEstadoDerivado({ estado: "borrador", fecha_pago: "2026-08-20" }), "borrador");
});

// -------------------------------------------------- antigüedad
test("diasDesde cuenta desde el día de HOY EN CHILE, no en UTC", () => {
  assert.equal(diasDesde(hoyChile()), 0, "hoy tiene que dar 0 días");
  const ayer = new Date(`${hoyChile()}T00:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  const iso = ayer.toLocaleDateString("en-CA");
  assert.equal(diasDesde(iso), 1);
});

test("diasDesde tolera timestamp completo y fecha suelta", () => {
  const hoy = hoyChile();
  assert.equal(diasDesde(`${hoy}T18:45:00`), 0, "la hora no puede cambiar la antigüedad");
  assert.equal(diasDesde(hoy), 0);
});

// -------------------------------------------------- construirCuentas
test("una factura emitida y no pagada va a POR COBRAR", () => {
  const cuentas = construirCuentas(
    [F({ estado: "emitida", fecha_emision: "2026-08-05", total: 100000 })],
    [],
    AGOSTO,
  );
  const c = cuentas.get("c1");
  assert.equal(c.porCobrar, 100000);
  assert.equal(c.pagado, 0);
  assert.equal(c.pendienteFacturar, 0);
});

test("una factura pagada va a PAGADO y entra por la fecha de PAGO", () => {
  // Emitida en julio, pagada en agosto: es ingreso de agosto.
  const factura = F({
    estado: "emitida",
    fecha_emision: "2026-07-20",
    fecha_pago: "2026-08-03",
    total: 250000,
  });
  assert.equal(construirCuentas([factura], [], AGOSTO).get("c1").pagado, 250000);
  // Y NO aparece en julio, aunque se haya emitido ahí.
  assert.equal(construirCuentas([factura], [], { anio: 2026, mes: 7 }).size, 0);
});

test("una factura por cobrar entra por la fecha de EMISIÓN", () => {
  const factura = F({ estado: "emitida", fecha_emision: "2026-08-28", total: 90000 });
  assert.equal(construirCuentas([factura], [], AGOSTO).get("c1").porCobrar, 90000);
  assert.equal(construirCuentas([factura], [], { anio: 2026, mes: 9 }).size, 0);
});

test("los borradores se muestran SIEMPRE: son trabajo hecho sin facturar", () => {
  // Sin fechas y de cualquier periodo: igual tiene que aparecer, o se pierde de
  // vista una factura a medio hacer.
  const borrador = F({ estado: "borrador", total: 40000 });
  for (const periodo of [AGOSTO, { anio: 2020, mes: 1 }, ANIO]) {
    const c = construirCuentas([borrador], [], periodo).get("c1");
    assert.equal(c.pendienteFacturar, 40000, `desapareció en ${JSON.stringify(periodo)}`);
  }
});

test("una anulada aparece en la lista pero NO suma a ningún total", () => {
  const c = construirCuentas(
    [F({ estado: "anulada", fecha_emision: "2026-08-05", total: 999999 })],
    [],
    AGOSTO,
  ).get("c1");
  assert.equal(c.porCobrar, 0);
  assert.equal(c.pagado, 0);
  assert.equal(c.pendienteFacturar, 0);
  assert.equal(c.facturas.length, 1, "tiene que seguir viéndose en el detalle");
});

test("vencido: solo lo POR COBRAR con más de 30 días desde la emisión", () => {
  const haceDias = (n) => {
    const d = new Date(`${hoyChile()}T00:00:00`);
    d.setDate(d.getDate() - n);
    return d.toLocaleDateString("en-CA");
  };
  const periodoDeHoy = {
    anio: Number(hoyChile().slice(0, 4)),
    mes: null,
  };

  const justo = construirCuentas(
    [F({ estado: "emitida", fecha_emision: haceDias(DIAS_VENCE), total: 1000 })],
    [],
    periodoDeHoy,
  ).get("c1");
  assert.equal(justo.vencido, 0, "a los 30 días justos todavía no está vencida");

  const pasada = construirCuentas(
    [F({ estado: "emitida", fecha_emision: haceDias(DIAS_VENCE + 1), total: 1000 })],
    [],
    periodoDeHoy,
  ).get("c1");
  assert.equal(pasada.vencido, 1000);
  assert.equal(pasada.porCobrar, 1000, "vencido es un subconjunto de por cobrar, no aparte");

  // Una PAGADA vieja no está vencida: ya se cobró.
  const pagadaVieja = construirCuentas(
    [
      F({
        estado: "emitida",
        fecha_emision: haceDias(200),
        fecha_pago: haceDias(1),
        total: 1000,
      }),
    ],
    [],
    periodoDeHoy,
  ).get("c1");
  assert.equal(pagadaVieja.vencido, 0);
});

test("viajes realizados sin factura suman a PENDIENTE FACTURAR", () => {
  const c = construirCuentas(
    [],
    [V({ fecha_inicio: "2026-08-11", valor: 75000 })],
    AGOSTO,
  ).get("c1");
  assert.equal(c.pendienteFacturar, 75000);
  assert.equal(c.viajesPendientes.length, 1);
});

test("un viaje de otro mes no entra en el periodo", () => {
  assert.equal(construirCuentas([], [V({ fecha_inicio: "2026-07-11", valor: 1 })], AGOSTO).size, 0);
});

test("los taxis suman al cliente, y los particulares no arman cuenta", () => {
  const conCliente = construirCuentas(
    [F({ estado: "emitida", fecha_emision: "2026-08-01", total: 10000 })],
    [],
    AGOSTO,
    [{ cliente_id: "c1", fecha: "2026-08-15", monto: 8000 }],
  ).get("c1");
  assert.equal(conCliente.taxis, 8000);

  // Sin cliente (particular): no crea ninguna cuenta.
  const particular = construirCuentas([], [], AGOSTO, [
    { cliente_id: null, fecha: "2026-08-15", monto: 8000 },
  ]);
  assert.equal(particular.size, 0);
});

test("un taxi de un cliente sin facturas igual arma su cuenta", () => {
  const cuentas = construirCuentas([], [], AGOSTO, [
    { cliente_id: "c9", fecha: "2026-08-15", monto: 12000 },
  ]);
  assert.equal(cuentas.get("c9").taxis, 12000);
});

test("los taxis de otro mes no entran", () => {
  const cuentas = construirCuentas([], [], AGOSTO, [
    { cliente_id: "c1", fecha: "2026-07-15", monto: 8000 },
  ]);
  assert.equal(cuentas.size, 0);
});

test("montos que llegan como string (numeric de PostgREST) no concatenan", () => {
  const c = construirCuentas(
    [F({ estado: "emitida", fecha_emision: "2026-08-05", total: "100000" })],
    [V({ fecha_inicio: "2026-08-05", valor: "50000" })],
    AGOSTO,
    [{ cliente_id: "c1", fecha: "2026-08-05", monto: "8000" }],
  ).get("c1");
  assert.equal(c.porCobrar, 100000);
  assert.equal(c.pendienteFacturar, 50000);
  assert.equal(c.taxis, 8000);
  for (const v of [c.porCobrar, c.pendienteFacturar, c.taxis]) {
    assert.equal(typeof v, "number");
  }
});

test("una factura sin cliente no se pierde: cae en 'Sin cliente'", () => {
  const cuentas = construirCuentas(
    [F({ cliente: null, estado: "emitida", fecha_emision: "2026-08-05", total: 5000 })],
    [],
    AGOSTO,
  );
  assert.equal(cuentas.get("sin-cliente").porCobrar, 5000);
  assert.equal(cuentas.get("sin-cliente").nombre, "Sin cliente");
});

test("la vista de AÑO junta los doce meses", () => {
  const facturas = Array.from({ length: 12 }, (_, i) =>
    F({
      id: `f${i}`,
      estado: "emitida",
      fecha_emision: `2026-${String(i + 1).padStart(2, "0")}-15`,
      total: 1000,
    }),
  );
  assert.equal(construirCuentas(facturas, [], ANIO).get("c1").porCobrar, 12000);
  assert.equal(construirCuentas(facturas, [], AGOSTO).get("c1").porCobrar, 1000);
});

test("una jornada completa de cliente cuadra en todos sus casilleros", () => {
  const c = construirCuentas(
    [
      F({ id: "a", estado: "emitida", fecha_emision: "2026-08-02", fecha_pago: "2026-08-20", total: 300000 }),
      F({ id: "b", estado: "emitida", fecha_emision: "2026-08-10", total: 150000 }),
      F({ id: "c", estado: "borrador", total: 50000 }),
      F({ id: "d", estado: "anulada", fecha_emision: "2026-08-12", total: 999 }),
    ],
    [V({ valor: 25000 })],
    AGOSTO,
    [{ cliente_id: "c1", fecha: "2026-08-05", monto: 8000 }],
  ).get("c1");

  assert.equal(c.pagado, 300000);
  assert.equal(c.porCobrar, 150000);
  assert.equal(c.pendienteFacturar, 75000, "borrador (50.000) + viaje sin facturar (25.000)");
  assert.equal(c.taxis, 8000);
  assert.equal(c.facturas.length, 4, "las cuatro se listan, aunque la anulada no sume");
});

test("cuentaVacia arranca todo en cero", () => {
  const c = cuentaVacia("x", "N");
  for (const k of ["pendienteFacturar", "porCobrar", "vencido", "pagado", "taxis"]) {
    assert.equal(c[k], 0, `${k} no arranca en 0`);
  }
});

// -------------------------------------------------- costo del viaje
test("costoTotalViaje suma los cuatro rubros y tolera nulos y strings", () => {
  assert.equal(costoTotalViaje({}), 0);
  assert.equal(
    costoTotalViaje({ costo_combustible: 10000, costo_peajes: 2000, costo_viaticos: 5000, costo_otros: 1000 }),
    18000,
  );
  assert.equal(costoTotalViaje({ costo_combustible: "10000", costo_peajes: null }), 10000);
  assert.ok(!Number.isNaN(costoTotalViaje({ costo_combustible: undefined })));
});
