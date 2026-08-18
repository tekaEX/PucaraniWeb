// Flota y documentación legal (User Story 5).
//
// Lo que fija este archivo es CUÁNDO la app tiene que avisar y cuándo no. Las
// dos formas de fallar son igual de caras y opuestas:
//
//   · no avisar de un papel vencido → una multa, o un bus detenido en la ruta;
//   · avisar de más → la campana marca 12 alertas que nadie puede resolver, se
//     deja de mirar, y la primera de verdad pasa desapercibida.
//
// El estado de los papeles se prueba en 5-vencimientos-cifrado.test.mjs (las
// fechas) y la patente en 3-patentes.test.mjs (la clave). Acá está lo que se
// construye ARRIBA de eso: qué flota entra, cómo se resume y qué se deja guardar.
import test from "node:test";
import assert from "node:assert/strict";
import {
  avisoDocumento,
  construirAlertas,
  documentosChofer,
  documentosVehiculo,
  evaluarVenc,
  enUso,
  marcaDocumentos,
  peorEstado,
  resumenDocumentos,
  DOCS_VEHICULO,
} from "@/lib/vencimientos";
import {
  categoriaVehiculo,
  clasesLicencia,
  esFechaISO,
  validarLicencia,
  validarVehiculo,
  LICENCIA_CLASES,
} from "@/lib/flota";
import { formatearPatente } from "@/lib/patentes";
import { hoyChile } from "@/lib/format";

/** Fecha a n días de hoy EN CHILE, en formato YYYY-MM-DD. */
function enDias(n) {
  const d = new Date(`${hoyChile()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

const vehiculo = (patente, docs = {}) => ({
  patente,
  activo: true,
  revision_tecnica_venc: null,
  soap_venc: null,
  permiso_circulacion_venc: null,
  ...docs,
});
const chofer = (id, nombre, licencia = null, activo = true) => ({
  id,
  nombre,
  activo,
  licencia_vencimiento: licencia,
});

// --------------------------------------------------- una fecha ilegible no es "vigente"
test("una fecha que no se puede leer NO se informa como documento vigente", () => {
  // Antes caía en el último `return` de evaluarVenc y la pantalla mostraba un
  // badge verde "Vigente": el error tranquilizador es el peor de todos acá.
  for (const basura of ["basura", "2026-13-01", "17/08/2026", "0000-00-00"]) {
    assert.equal(evaluarVenc(basura), null, `leyó ${JSON.stringify(basura)} como fecha`);
  }
});

test("un papel con fecha ilegible queda como sin cargar, no como al día", () => {
  const docs = documentosVehiculo(vehiculo("AA-1111", { revision_tecnica_venc: "no-es-fecha" }));
  const rev = docs.find((d) => d.label === "Revisión técnica");
  assert.equal(rev.estado, "sin_datos");
  assert.equal(rev.dias, null);
  assert.notEqual(peorEstado(docs), "ok", "una flota con un dato roto no está en regla");
});

// ------------------------------------------------------------- alertas y flota en uso
test("un vehículo dado de baja deja de alertar", () => {
  // Su revisión técnica vencida es historia: no hay nada que renovar, y la
  // única forma de callar la alerta sería borrar el vehículo con su historial.
  const vencido = { revision_tecnica_venc: enDias(-10) };
  assert.equal(construirAlertas([], [vehiculo("AA-1111", vencido)]).length, 1);
  assert.equal(
    construirAlertas([], [{ ...vehiculo("AA-1111", vencido), activo: false }]).length,
    0,
  );
});

test("un chofer que ya no trabaja acá deja de alertar", () => {
  assert.equal(construirAlertas([chofer("c1", "Etian", enDias(-3))], []).length, 1);
  assert.equal(construirAlertas([chofer("c1", "Etian", enDias(-3), false)], []).length, 0);
});

test("una fila sin el campo activo se trata como en uso (el lado seguro)", () => {
  // Una consulta que no pidió `activo` no puede hacer desaparecer alertas.
  assert.ok(enUso({}));
  assert.ok(enUso({ activo: null }));
  assert.ok(!enUso({ activo: false }));
  const alertas = construirAlertas([], [{ patente: "AA-1111", revision_tecnica_venc: enDias(-1) }]);
  assert.equal(alertas.length, 1);
});

test("las alertas siguen saliendo de la más vencida a la menos urgente", () => {
  const alertas = construirAlertas(
    [chofer("c1", "Etian", enDias(15))],
    [
      vehiculo("AA-1111", { revision_tecnica_venc: enDias(20) }),
      vehiculo("BB-2222", { soap_venc: enDias(-90) }),
    ],
  );
  assert.deepEqual(alertas.map((a) => a.nombre), ["BB-2222", "Etian", "AA-1111"]);
  assert.equal(alertas[0].documento, "SOAP (seguro)");
});

test("un papel sin cargar no genera una alerta con fecha inventada", () => {
  // Se ve en la ficha como "sin dato", pero no puede decir "vence en N días".
  const alertas = construirAlertas([chofer("c1", "Sin licencia")], [vehiculo("AA-1111")]);
  assert.deepEqual(alertas, []);
});

// ------------------------------------------------------------------- peor estado
test("el estado del conjunto es el del peor papel", () => {
  const v = vehiculo("AA-1111", {
    revision_tecnica_venc: enDias(-1),
    soap_venc: enDias(400),
    permiso_circulacion_venc: enDias(400),
  });
  assert.equal(peorEstado(documentosVehiculo(v)), "vencido");
});

test("con todo vigente el conjunto está ok; con uno por vencer, no", () => {
  const vigente = vehiculo("AA-1111", {
    revision_tecnica_venc: enDias(400),
    soap_venc: enDias(400),
    permiso_circulacion_venc: enDias(400),
  });
  assert.equal(peorEstado(documentosVehiculo(vigente)), "ok");
  assert.equal(
    peorEstado(documentosVehiculo({ ...vigente, soap_venc: enDias(10) })),
    "por_vencer",
  );
});

test("un papel sin cargar no cuenta como al día", () => {
  // Es la mitad del punto de la User Story 5: no se puede afirmar que un
  // vehículo esté en regla si nadie cargó su SOAP.
  const v = vehiculo("AA-1111", {
    revision_tecnica_venc: enDias(400),
    permiso_circulacion_venc: enDias(400),
  });
  assert.equal(peorEstado(documentosVehiculo(v)), "sin_datos");
});

test("un vencido pesa más que un papel sin cargar", () => {
  const v = vehiculo("AA-1111", { revision_tecnica_venc: enDias(-5) });
  assert.equal(peorEstado(documentosVehiculo(v)), "vencido");
});

test("el chofer tiene un solo papel: su licencia", () => {
  const docs = documentosChofer(chofer("c1", "Etian", enDias(-2)));
  assert.equal(docs.length, 1);
  assert.equal(docs[0].label, "Licencia de conducir");
  assert.equal(docs[0].estado, "vencido");
});

// ---------------------------------------------------------------------- resumen
test("el resumen cuenta documentos y, aparte, fichas con algo pendiente", () => {
  // Un bus con los tres papeles vencidos son 3 documentos, pero UN vehículo
  // que sacar de circulación.
  const r = resumenDocumentos([
    documentosVehiculo(
      vehiculo("AA-1111", {
        revision_tecnica_venc: enDias(-5),
        soap_venc: enDias(-5),
        permiso_circulacion_venc: enDias(-5),
      }),
    ),
    documentosVehiculo(
      vehiculo("BB-2222", {
        revision_tecnica_venc: enDias(400),
        soap_venc: enDias(400),
        permiso_circulacion_venc: enDias(400),
      }),
    ),
    documentosVehiculo(vehiculo("CC-3333", { revision_tecnica_venc: enDias(10) })),
  ]);
  assert.equal(r.vencidos, 3);
  assert.equal(r.porVencer, 1);
  assert.equal(r.sinDatos, 2, "los dos papeles que nadie cargó de CC-3333");
  assert.equal(r.fichas, 2, "AA-1111 y CC-3333; BB-2222 está en regla");
});

test("una flota entera al día da un resumen en cero", () => {
  const alDia = documentosVehiculo(
    vehiculo("AA-1111", {
      revision_tecnica_venc: enDias(100),
      soap_venc: enDias(200),
      permiso_circulacion_venc: enDias(300),
    }),
  );
  assert.deepEqual(resumenDocumentos([alDia]), {
    vencidos: 0,
    porVencer: 0,
    sinDatos: 0,
    fichas: 0,
  });
});

test("sin fichas no hay nada que avisar", () => {
  assert.deepEqual(resumenDocumentos([]), {
    vencidos: 0,
    porVencer: 0,
    sinDatos: 0,
    fichas: 0,
  });
});

// ------------------------------------- lo que se ve al asignar (US5, T042)
test("el desplegable de asignación dice en qué estado están los papeles", () => {
  // Es el momento en que el vencimiento importa: cuando se elige qué bus sale.
  const vencido = vehiculo("AA-1111", { revision_tecnica_venc: enDias(-2) });
  assert.equal(
    marcaDocumentos("AA-1111", documentosVehiculo(vencido)),
    "AA-1111 · papeles vencidos",
  );
  const porVencer = vehiculo("BB-2222", {
    revision_tecnica_venc: enDias(5),
    soap_venc: enDias(400),
    permiso_circulacion_venc: enDias(400),
  });
  assert.equal(
    marcaDocumentos("BB-2222", documentosVehiculo(porVencer)),
    "BB-2222 · papeles por vencer",
  );
  assert.equal(
    marcaDocumentos("CC-3333", documentosVehiculo(vehiculo("CC-3333"))),
    "CC-3333 · papeles sin cargar",
  );
});

test("con los papeles al día el nombre va limpio, sin ruido", () => {
  const alDia = vehiculo("AA-1111", {
    revision_tecnica_venc: enDias(300),
    soap_venc: enDias(300),
    permiso_circulacion_venc: enDias(300),
  });
  assert.equal(marcaDocumentos("AA-1111", documentosVehiculo(alDia)), "AA-1111");
});

test("un inactivo se marca como tal, aunque sus papeles estén al día", () => {
  const c = chofer("c1", "Etian", enDias(300), false);
  assert.equal(marcaDocumentos(c.nombre, documentosChofer(c), c.activo), "Etian · inactivo");
});

test("el aviso dice los días y sirve para cualquiera de los papeles", () => {
  const [rev, soap] = documentosVehiculo(
    vehiculo("AA-1111", { revision_tecnica_venc: enDias(-3), soap_venc: enDias(7) }),
  );
  assert.equal(
    avisoDocumento("AA-1111", rev),
    "AA-1111 · Revisión técnica: venció hace 3 día(s).",
  );
  assert.equal(avisoDocumento("AA-1111", soap), "AA-1111 · SOAP (seguro): vence en 7 día(s).");
});

test("no se avisa de lo que está al día ni de lo que no tiene fecha", () => {
  const [rev, , permiso] = documentosVehiculo(
    vehiculo("AA-1111", { revision_tecnica_venc: enDias(400) }),
  );
  assert.equal(avisoDocumento("AA-1111", rev), null);
  assert.equal(avisoDocumento("AA-1111", permiso), null, "sin fecha no se inventa un plazo");
});

// ------------------------------------------------- una sola lista de documentos
test("la lista de documentos del vehículo es la misma para la campana y las pantallas", () => {
  // La tabla, el formulario y el panel arman sus columnas y campos desde
  // DOCS_VEHICULO. Si esa lista y lo que evalúa documentosVehiculo se separan,
  // aparece una columna que nunca alerta (o al revés).
  const docs = documentosVehiculo(vehiculo("AA-1111"));
  assert.deepEqual(docs.map((d) => d.label), DOCS_VEHICULO.map((d) => d.label));
  for (const d of DOCS_VEHICULO) {
    assert.ok(d.campo.endsWith("_venc"), `${d.campo} no es una columna de vencimiento`);
    assert.ok(d.corto.length > 0 && d.corto.length <= d.label.length);
  }
});

// ------------------------------------------------- la patente, contra la base
test("lo que guarda la app pasa el CHECK de la base", () => {
  // vehiculos_patente_formato (migración 0008) exige exactamente estas dos
  // formas. Si formatearPatente devolviera algo distinto, cada alta de vehículo
  // moriría con un error de Postgres.
  const CHECK_BASE = /^[A-Z]{4}-[0-9]{2}$|^[A-Z]{2}-[0-9]{4}$/;
  for (const entrada of ["abcd12", "ABCD-12", "ab 1234", "AB.1234", "ghpr-34"]) {
    const patente = formatearPatente(entrada);
    assert.ok(patente, `rechazó ${entrada}`);
    assert.match(patente, CHECK_BASE, `la base rechazaría "${patente}"`);
  }
});

test("la patente inválida se detiene en la app, no en la base", () => {
  for (const mala of ["ABC123", "ABCD-1", "1234AB", ""]) {
    assert.equal(formatearPatente(mala), null, `dejó pasar ${JSON.stringify(mala)}`);
  }
});

// ------------------------------------------------------- validación del registro
test("las fechas imposibles se rechazan antes de llegar a Postgres", () => {
  assert.ok(esFechaISO("2026-08-17"));
  assert.ok(esFechaISO("2028-02-29"), "2028 es bisiesto");
  for (const mala of [
    "2026-02-31", // el constructor de Date la correría al 3 de marzo en silencio
    "2027-02-29",
    "2026-13-01",
    "2026-00-10",
    "17/08/2026",
    "2026-8-1",
    "basura",
    "",
  ]) {
    assert.ok(!esFechaISO(mala), `aceptó ${JSON.stringify(mala)}`);
  }
});

test("el vehículo con un vencimiento ilegible no se guarda", () => {
  const base = {
    anio: 2020,
    capacidad: 20,
    km_actual: 100000,
    revision_tecnica_venc: null,
    soap_venc: null,
    permiso_circulacion_venc: null,
  };
  assert.equal(validarVehiculo(base), null, "sin papeles cargados se puede guardar");
  assert.match(validarVehiculo({ ...base, soap_venc: "31-12-2026" }), /SOAP/);
  assert.match(
    validarVehiculo({ ...base, revision_tecnica_venc: "2026-02-31" }),
    /revisión técnica/,
  );
});

test("un año de fabricación tipeado mal no se guarda", () => {
  const base = {
    anio: null,
    capacidad: null,
    km_actual: null,
    revision_tecnica_venc: null,
    soap_venc: null,
    permiso_circulacion_venc: null,
  };
  const anioActual = Number(hoyChile().slice(0, 4));
  assert.equal(validarVehiculo({ ...base, anio: 1998 }), null);
  assert.equal(validarVehiculo({ ...base, anio: anioActual + 1 }), null, "el del año que viene ya se vende");
  assert.match(validarVehiculo({ ...base, anio: 20226 }), /año/);
  assert.match(validarVehiculo({ ...base, anio: 1899 }), /año/);
  assert.match(validarVehiculo({ ...base, capacidad: -4 }), /capacidad/i);
  assert.match(validarVehiculo({ ...base, km_actual: -1 }), /kilometraje/i);
});

test("la categoría desconocida deja el vehículo sin clasificar", () => {
  assert.equal(categoriaVehiculo("operacion"), "operacion");
  assert.equal(categoriaVehiculo("taxis"), "taxis");
  // 'encomiendas' sigue siendo válida en la base (migración 0016) pero esa
  // línea de trabajo se fue al proyecto Ares.
  assert.equal(categoriaVehiculo("encomiendas"), null);
  assert.equal(categoriaVehiculo(""), null);
  assert.equal(categoriaVehiculo(null), null);
});

// --------------------------------------------------------- clases de licencia
test("las clases de licencia quedan en forma canónica", () => {
  assert.deepEqual(clasesLicencia("clase a-3, b"), { clases: "A3, B" });
  assert.deepEqual(clasesLicencia("b"), { clases: "B" });
  assert.deepEqual(clasesLicencia("B y C"), { clases: "B, C" });
  assert.deepEqual(clasesLicencia("A-2/A-4"), { clases: "A2, A4" });
  assert.deepEqual(clasesLicencia("  "), { clases: null });
  assert.deepEqual(clasesLicencia(null), { clases: null });
});

test("la misma licencia escrita de varias formas queda igual", () => {
  const formas = ["A3, B", "a3 b", "clase A-3, clase B", "B, A3", "b/a3"];
  const guardadas = new Set(formas.map((f) => clasesLicencia(f).clases));
  assert.equal(guardadas.size, 1, `dio ${[...guardadas].join(" | ")}`);
  assert.equal([...guardadas][0], "A3, B", "en el orden de LICENCIA_CLASES, no en el escrito");
});

test("una clase que no existe se rechaza en vez de guardarse a medias", () => {
  // "clase Z" guardado tal cual no deja saber si el chofer puede llevar un bus.
  const r = clasesLicencia("Z");
  assert.ok("error" in r);
  assert.match(r.error, /no es una clase/);
  assert.ok("error" in clasesLicencia("A6"));
  assert.ok("error" in clasesLicencia("A3, X"));
});

test("las clases válidas son las de la ley y ninguna más", () => {
  assert.deepEqual([...LICENCIA_CLASES], ["A1", "A2", "A3", "A4", "A5", "B", "C", "D", "E", "F"]);
  for (const c of LICENCIA_CLASES) {
    assert.deepEqual(clasesLicencia(c), { clases: c }, `rechazó la clase ${c}`);
  }
});

test("la fecha de la licencia se valida igual que las del vehículo", () => {
  assert.equal(validarLicencia(null), null);
  assert.equal(validarLicencia("2030-01-15"), null);
  assert.match(validarLicencia("15/01/2030"), /licencia/);
});
