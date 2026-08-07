// Dos cosas que fallan en silencio si están mal:
//   · los vencimientos: una revisión técnica vencida que no avisa es una multa
//     o una camioneta detenida en la carretera.
//   · el cifrado de la clave del certificado digital del SII.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluarVenc, construirAlertas } from "@/lib/vencimientos";
import { hoyChile } from "@/lib/format";

// Llave de prueba (32 bytes en hexadecimal). El módulo la lee al llamar, no al
// importarse, así que alcanza con dejarla puesta antes de usarlo.
process.env.ENCRYPTION_KEY = "a".repeat(64);
const { encrypt, decrypt } = await import("@/lib/crypto");

/** Fecha a n días de hoy EN CHILE, en formato YYYY-MM-DD. */
function enDias(n) {
  const d = new Date(`${hoyChile()}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

// ------------------------------------------------------------ vencimientos
test("hoy mismo NO está vencido: el documento vale todo el día", () => {
  const ev = evaluarVenc(enDias(0));
  assert.equal(ev.estado, "por_vencer");
  assert.equal(ev.dias, 0);
});

test("ayer está vencido; mañana no", () => {
  assert.equal(evaluarVenc(enDias(-1)).estado, "vencido");
  assert.equal(evaluarVenc(enDias(-1)).dias, -1);
  assert.equal(evaluarVenc(enDias(1)).estado, "por_vencer");
});

test("el aviso arranca a los 30 días y ni un día antes", () => {
  assert.equal(evaluarVenc(enDias(30)).estado, "por_vencer", "a 30 días ya avisa");
  assert.equal(evaluarVenc(enDias(31)).estado, "ok", "a 31 todavía no");
  assert.equal(evaluarVenc(enDias(365)).estado, "ok");
});

test("la ventana de aviso se puede ajustar", () => {
  assert.equal(evaluarVenc(enDias(45), 60).estado, "por_vencer");
  assert.equal(evaluarVenc(enDias(45), 30).estado, "ok");
});

test("sin fecha no hay alerta (no se inventa un vencimiento)", () => {
  assert.equal(evaluarVenc(null), null);
  assert.equal(evaluarVenc(undefined), null);
  assert.equal(evaluarVenc(""), null);
});

test("la hora no corre el vencimiento un día", () => {
  // El servidor corre en UTC y de noche en Chile ya es el día siguiente allá.
  const hoy = hoyChile();
  assert.equal(evaluarVenc(hoy).dias, 0);
  assert.equal(evaluarVenc(`${hoy}T23:30:00`).dias, 0);
});

test("construirAlertas junta los tres papeles del vehículo y la licencia", () => {
  const vehiculos = [
    {
      patente: "ABCD-12",
      revision_tecnica_venc: enDias(-5),
      soap_venc: enDias(10),
      permiso_circulacion_venc: enDias(200),
    },
  ];
  const choferes = [{ id: "c1", nombre: "Etian", licencia_vencimiento: enDias(-40) }];

  const alertas = construirAlertas(choferes, vehiculos);
  // El permiso a 200 días está OK y no debe aparecer.
  assert.equal(alertas.length, 3);
  assert.deepEqual(
    alertas.map((a) => a.documento),
    ["Licencia de conducir", "Revisión técnica", "SOAP (seguro)"],
    "tienen que salir ordenadas de la más urgente a la menos",
  );
  assert.equal(alertas[0].tipo, "Chofer");
  assert.equal(alertas[0].estado, "vencido");
  assert.equal(alertas[1].nombre, "ABCD-12");
});

test("una flota al día no genera ninguna alerta", () => {
  const alertas = construirAlertas(
    [{ id: "c1", nombre: "Etian", licencia_vencimiento: enDias(300) }],
    [
      {
        patente: "ABCD-12",
        revision_tecnica_venc: enDias(100),
        soap_venc: enDias(200),
        permiso_circulacion_venc: enDias(300),
      },
    ],
  );
  assert.deepEqual(alertas, []);
});

test("papeles sin cargar no generan alertas falsas", () => {
  const alertas = construirAlertas(
    [{ id: "c1", nombre: "Sin licencia", licencia_vencimiento: null }],
    [{ patente: "ABCD-12", revision_tecnica_venc: null, soap_venc: null, permiso_circulacion_venc: null }],
  );
  assert.deepEqual(alertas, []);
});

test("las alertas salen de la más vencida a la menos urgente", () => {
  const alertas = construirAlertas(
    [],
    [
      { patente: "AA-1111", revision_tecnica_venc: enDias(20), soap_venc: null, permiso_circulacion_venc: null },
      { patente: "BB-2222", revision_tecnica_venc: enDias(-90), soap_venc: null, permiso_circulacion_venc: null },
      { patente: "CC-3333", revision_tecnica_venc: enDias(5), soap_venc: null, permiso_circulacion_venc: null },
    ],
  );
  assert.deepEqual(alertas.map((a) => a.nombre), ["BB-2222", "CC-3333", "AA-1111"]);
});

// ----------------------------------------------------------------- cifrado
test("lo cifrado se puede volver a leer", () => {
  for (const secreto of ["clave123", "", "ñandú áéíóú", "a".repeat(500), '{"json":true}']) {
    assert.equal(decrypt(encrypt(secreto)), secreto, `falló con ${secreto.slice(0, 20)}`);
  }
});

test("cifrar dos veces lo mismo da textos distintos (el IV es aleatorio)", () => {
  // Si diera igual, alguien con acceso a la base sabría que dos certificados
  // comparten contraseña.
  const a = encrypt("misma-clave");
  const b = encrypt("misma-clave");
  assert.notEqual(a, b);
  assert.equal(decrypt(a), decrypt(b));
});

test("un dato manipulado NO se descifra: revienta en vez de devolver basura", () => {
  const valido = encrypt("clave-del-certificado");
  const [iv, tag, datos] = valido.split(":");

  // Cambiar el contenido cifrado.
  const alterado = [iv, tag, datos.slice(0, -2) + (datos.endsWith("00") ? "11" : "00")].join(":");
  assert.throws(() => decrypt(alterado), "aceptó un dato alterado");

  // Cambiar la etiqueta de autenticación.
  const sinTag = [iv, "0".repeat(tag.length), datos].join(":");
  assert.throws(() => decrypt(sinTag));
});

test("un formato inválido se rechaza con un mensaje claro", () => {
  for (const basura of ["", "solo-texto", "a:b", "::"]) {
    assert.throws(() => decrypt(basura), /inválido|invalid/i, JSON.stringify(basura));
  }
});

test("sin la llave del entorno no se cifra nada en silencio", () => {
  const original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "muy-corta";
  try {
    assert.throws(() => encrypt("x"), /ENCRYPTION_KEY/);
    assert.throws(() => decrypt("a:b:c"), /ENCRYPTION_KEY/);
  } finally {
    process.env.ENCRYPTION_KEY = original;
  }
});

test("con otra llave no se puede leer", () => {
  const cifrado = encrypt("secreto");
  const original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "b".repeat(64);
  try {
    assert.throws(() => decrypt(cifrado));
  } finally {
    process.env.ENCRYPTION_KEY = original;
  }
});
