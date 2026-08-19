// Cómo se arma la llamada a SimpleAPI.
//
// Esto es exactamente lo que hizo fracasar la sincronización de combustible: el
// contrato se escribió de memoria —body y header adivinados— y nunca funcionó,
// pero el código "compilaba". Un error así no lo agarra el typecheck ni la
// revisión: solo se ve mirando el request que sale.
//
// Estas pruebas no tocan la red. Reemplazan fetch y revisan el request armado
// contra el contrato verificado el 2026-08-18 (ver la cabecera de simpleapi.ts).
import test from "node:test";
import assert from "node:assert/strict";

process.env.SIMPLEAPI_KEY = "KEY-DE-PRUEBA-123";

const { generarDte, generarSobre, enviarAlSii, generarPdf } = await import("@/lib/sii/simpleapi");

const CERT = {
  rut: "17096073-4",
  password: "clave-del-pfx",
  pfx: new Uint8Array([0x30, 0x82, 0x01, 0x02]), // encabezado plausible de un .pfx
};

const DOCUMENTO = { Encabezado: {}, Detalles: [] };

/** Reemplaza fetch, guarda lo que salió y responde lo que se le indique. */
function interceptar(responder) {
  const llamadas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), init });
    return responder(String(url), init);
  };
  return {
    llamadas,
    restaurar: () => {
      globalThis.fetch = original;
    },
  };
}

/** Los campos del multipart, en el orden real en que se agregaron. */
function campos(init) {
  return [...init.body.entries()].map(([clave, valor]) => ({
    clave,
    esArchivo: typeof valor !== "string",
    nombreArchivo: typeof valor === "string" ? null : valor.name,
    valor: typeof valor === "string" ? valor : null,
  }));
}

test("la key va en Authorization SIN prefijo (con Bearer la API responde 401)", async () => {
  const espia = interceptar(() => new Response("<DTE/>", { status: 200 }));
  try {
    await generarDte(DOCUMENTO, CERT, "<AUTORIZACION/>");
    const { init } = espia.llamadas[0];
    assert.equal(init.headers.Authorization, "KEY-DE-PRUEBA-123");
  } finally {
    espia.restaurar();
  }
});

test("generar DTE manda input de texto, el certificado en `files` y el CAF en `files2`", async () => {
  const espia = interceptar(() => new Response("<DTE version=\"1.0\"/>", { status: 200 }));
  try {
    const r = await generarDte(DOCUMENTO, CERT, "<AUTORIZACION>caf</AUTORIZACION>");
    assert.ok(!("error" in r), r.error);
    assert.match(r.xml, /<DTE/);

    const { url, init } = espia.llamadas[0];
    assert.match(url, /\/api\/v1\/dte\/generar$/);
    assert.equal(init.method, "POST");

    const cs = campos(init);
    // El orden de los archivos importa: certificado primero, CAF después.
    assert.deepEqual(
      cs.map((c) => c.clave),
      ["input", "files", "files2"],
    );
    assert.equal(cs[0].esArchivo, false);
    assert.equal(cs[1].esArchivo, true);
    assert.equal(cs[2].esArchivo, true);

    // El input lleva el documento y la credencial, en PascalCase.
    const input = JSON.parse(cs[0].valor);
    assert.deepEqual(input.Certificado, { Rut: CERT.rut, Password: CERT.password });
    assert.ok(input.Documento);
  } finally {
    espia.restaurar();
  }
});

test("el sobre numera los DTE: files, files2, files3…", async () => {
  const espia = interceptar(() => new Response("<EnvioDTE/>", { status: 200 }));
  try {
    const r = await generarSobre(
      {
        rutEmisor: "76192083-9",
        rutReceptor: "60803000-K",
        numeroResolucion: 0,
        fechaResolucion: "2026-08-18",
      },
      CERT,
      ["<DTE>uno</DTE>", "<DTE>dos</DTE>"],
    );
    assert.ok(!("error" in r), r.error);

    const cs = campos(espia.llamadas[0].init);
    assert.deepEqual(
      cs.map((c) => c.clave),
      ["input", "files", "files2", "files3"],
    );
    const input = JSON.parse(cs[0].valor);
    assert.equal(input.Caratula.RutReceptor, "60803000-K");
    assert.equal(input.Caratula.NumeroResolucion, 0);
  } finally {
    espia.restaurar();
  }
});

test("un sobre sin documentos no sale a la red", async () => {
  const espia = interceptar(() => new Response("", { status: 200 }));
  try {
    const r = await generarSobre(
      { rutEmisor: "1-9", rutReceptor: "60803000-K", numeroResolucion: 0, fechaResolucion: "2026-08-18" },
      CERT,
      [],
    );
    assert.ok("error" in r);
    assert.equal(espia.llamadas.length, 0);
  } finally {
    espia.restaurar();
  }
});

test("un envío fallido viene con \"ok\": true — lo que manda es el trackId", async () => {
  // Respuesta REAL de la API ante un certificado que el SII no acepta.
  // Creerle al `ok` daría por emitida una factura que nunca salió.
  const cuerpo = JSON.stringify({
    rutEnvia: null,
    estado: "ERROR",
    ok: true,
    glosa: "",
    errores: null,
    trackId: -999999,
    responseXml: "Certificado vencido",
  });
  const espia = interceptar(() => new Response(cuerpo, { status: 400 }));
  try {
    const r = await enviarAlSii(CERT, "<EnvioDTE/>", "certificacion");
    assert.ok("error" in r, "un envío rechazado no puede devolver éxito");
    assert.match(r.error, /Certificado vencido/);
  } finally {
    espia.restaurar();
  }
});

test("un envío aceptado devuelve el track id", async () => {
  const cuerpo = JSON.stringify({ estado: "OK", ok: true, glosa: "Envio Recibido", trackId: 17203114 });
  const espia = interceptar(() => new Response(cuerpo, { status: 200 }));
  try {
    const r = await enviarAlSii(CERT, "<EnvioDTE/>", "certificacion");
    assert.ok(!("error" in r), r.error);
    assert.equal(r.trackId, 17203114);

    const input = JSON.parse(campos(espia.llamadas[0].init)[0].valor);
    assert.equal(input.Ambiente, 0, "certificación es 0");
    assert.equal(input.Tipo, 1, "EnvioDTE es 1");
  } finally {
    espia.restaurar();
  }
});

test("producción es ambiente 1, y no se llega ahí por accidente", async () => {
  const espia = interceptar(() =>
    new Response(JSON.stringify({ estado: "OK", trackId: 1 }), { status: 200 }),
  );
  try {
    await enviarAlSii(CERT, "<EnvioDTE/>", "produccion");
    const input = JSON.parse(campos(espia.llamadas[0].init)[0].valor);
    assert.equal(input.Ambiente, 1);
  } finally {
    espia.restaurar();
  }
});

test("traduce el 401 y el 429 a algo que se pueda mostrar", async () => {
  for (const [status, esperado] of [
    [401, /key/i],
    [429, /3 por segundo/i],
  ]) {
    const espia = interceptar(() => new Response("", { status }));
    try {
      const r = await generarDte(DOCUMENTO, CERT, "<AUTORIZACION/>");
      assert.ok("error" in r);
      assert.match(r.error, esperado);
    } finally {
      espia.restaurar();
    }
  }
});

test("el PDF usa `fileEnvio`, no la numeración de los otros endpoints", async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
  const espia = interceptar(() => new Response(pdf, { status: 200 }));
  try {
    const r = await generarPdf("<DTE/>", {
      numeroResolucion: 0,
      fechaResolucion: "2026-08-18",
      unidadSII: "ARICA",
    });
    assert.ok(!("error" in r), r.error);
    assert.deepEqual([...r.pdf], [0x25, 0x50, 0x44, 0x46]);

    const cs = campos(espia.llamadas[0].init);
    assert.deepEqual(
      cs.map((c) => c.clave),
      ["input", "fileEnvio"],
    );
  } finally {
    espia.restaurar();
  }
});

test("sin SIMPLEAPI_KEY avisa qué falta, en vez de fallar contra la red", async () => {
  const antes = process.env.SIMPLEAPI_KEY;
  delete process.env.SIMPLEAPI_KEY;
  const espia = interceptar(() => new Response("", { status: 200 }));
  try {
    const r = await generarDte(DOCUMENTO, CERT, "<AUTORIZACION/>");
    assert.ok("error" in r);
    assert.match(r.error, /SIMPLEAPI_KEY/);
    assert.equal(espia.llamadas.length, 0);
  } finally {
    espia.restaurar();
    process.env.SIMPLEAPI_KEY = antes;
  }
});
