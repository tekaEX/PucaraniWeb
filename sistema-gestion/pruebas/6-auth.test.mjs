// Quién entra al panel. Es la regla de acceso de todo el sistema y hasta T004
// no tenía ninguna prueba: se sostenía sola en una lista de tres strings.
//
// Lo que se prueba acá es la parte PURA (tieneAccesoAlPanel y ROLES_PANEL). Las
// otras dos puertas —rechazoSiNoPanel para los Route Handlers y puedeEditar
// para las Server Actions— necesitan una sesión de Supabase, así que se
// verifican entrando con una cuenta de cada rol.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ROLES_PANEL, tieneAccesoAlPanel, SIN_PERMISO } from "@/lib/auth";

test("los roles del panel son exactamente admin y operador", () => {
  // Si esta lista cambia, cambia quién puede entrar a TODO el sistema: el
  // layout, los endpoints de exportación y las 25 Server Actions. Que falle
  // esta prueba no es un estorbo, es el punto.
  assert.deepEqual([...ROLES_PANEL].sort(), ["admin", "operador"]);
});

test("admin y operador entran", () => {
  assert.equal(tieneAccesoAlPanel("admin"), true);
  assert.equal(tieneAccesoAlPanel("operador"), true);
});

test("chofer y contador NO entran, aunque el enum de Postgres los conserve", () => {
  // De un enum no se pueden quitar valores, así que 'chofer' y 'contador'
  // siguen existiendo en rol_usuario. La lista de la app es la que manda: una
  // cuenta vieja de chofer con la sesión abierta en el teléfono llega hasta
  // acá, y acá se la frena.
  assert.equal(tieneAccesoAlPanel("chofer"), false);
  assert.equal(tieneAccesoAlPanel("contador"), false);
});

test("sin rol no se entra: null, undefined y vacío se rechazan", () => {
  // El caso real: un usuario autenticado en Supabase cuya fila de `perfiles`
  // todavía no existe. Tiene sesión válida y ningún rol.
  assert.equal(tieneAccesoAlPanel(null), false);
  assert.equal(tieneAccesoAlPanel(undefined), false);
  assert.equal(tieneAccesoAlPanel(""), false);
});

test("un rol inventado no entra por el hecho de ser un string", () => {
  // tieneAccesoAlPanel acepta el tipo RolUsuario, pero el valor llega de la
  // base y en runtime puede ser cualquier cosa. La lista es una lista blanca,
  // no una lista negra.
  assert.equal(tieneAccesoAlPanel("superadmin"), false);
  assert.equal(tieneAccesoAlPanel("ADMIN"), false);
});

test("el mensaje de rechazo es uno solo para todo el sistema", () => {
  assert.equal(typeof SIN_PERMISO, "string");
  assert.ok(SIN_PERMISO.length > 0);
});

// ---------------------------------------------------------------------------
// Que NINGUNA acción quede sin puerta (T050)
// ---------------------------------------------------------------------------
//
// Una Server Action es un endpoint POST público: cualquiera que sepa su id
// puede llamarla, sin pasar por la pantalla que la usa. La guía de Next lo dice
// —"Server Actions should be treated as public-facing API endpoints"— y por eso
// cada una empieza con puedeEditar() o exigirPanel().
//
// Esto no se puede probar llamándolas (necesitan sesión de Supabase), pero sí
// leyendo el código: la prueba recorre los actions.ts reales y falla si aparece
// una exportada sin guardia. Es el chequeo que faltaba cuando dos funciones de
// solo lectura quedaron abiertas: sin sesión devolvían "no tiene historial",
// que es una respuesta equivocada, no un rechazo.

import { readdirSync, readFileSync } from "node:fs";

// Las únicas que no pueden llevar guardia, porque corren ANTES de que exista la
// sesión que la guardia comprobaría: la entrada, la salida y las dos de
// recuperar la contraseña.
//
// Que estén en esta lista no significa que estén abiertas:
//   · enviarRecuperacion() es pública a propósito (quien perdió la contraseña no
//     tiene con qué autenticarse). Lo que la protege es que no distingue una
//     cuenta que existe de una que no, más el límite de envíos de Supabase.
//   · actualizarContrasena() SÍ verifica: exige la sesión que abrió
//     /auth/confirm al canjear el enlace del correo, con getUser(). No usa
//     ninguno de los helpers de abajo porque el rechazo no es "no tenés
//     permiso" sino "el enlace ya no sirve".
const SIN_GUARDIA_A_PROPOSITO = new Set([
  "login",
  "logout",
  "enviarRecuperacion",
  "actualizarContrasena",
]);
// esAdmin() es más estricta que puedeEditar(): la usan las acciones que tocan
// credenciales del SII y folios CAF, que un operador no puede manipular.
const GUARDIAS = /\b(puedeEditar|esAdmin|exigirPanel|exigirSesion|sesionActual)\(\)/;

function archivosDeAcciones() {
  return readdirSync("src/app", { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith("actions.ts"))
    .map((f) => `src/app/${f}`);
}

test("todos los actions.ts del proyecto se revisan (la búsqueda encuentra algo)", () => {
  // Si el patrón dejara de encontrar archivos, la prueba de abajo pasaría
  // revisando cero acciones y no lo notaría nadie.
  const archivos = archivosDeAcciones();
  assert.ok(archivos.length >= 8, `solo encontró ${archivos.length} archivos de acciones`);
});

test("ninguna Server Action exportada se queda sin guardia de acceso", () => {
  const abiertas = [];
  for (const archivo of archivosDeAcciones()) {
    const fuente = readFileSync(archivo, "utf8");
    const partes = fuente.split(/^export async function (\w+)/m);
    for (let i = 1; i < partes.length; i += 2) {
      const [nombre, cuerpo] = [partes[i], partes[i + 1]];
      if (SIN_GUARDIA_A_PROPOSITO.has(nombre)) continue;
      if (!GUARDIAS.test(cuerpo)) abiertas.push(`${archivo} → ${nombre}()`);
    }
  }
  assert.deepEqual(abiertas, [], `acciones sin control de acceso:\n  ${abiertas.join("\n  ")}`);
});

test("todo Route Handler de /api empieza rechazando al que no es del panel", () => {
  // Los endpoints de exportación devuelven PDF y Excel con datos del negocio
  // completos: son la vía más directa para llevarse la información.
  const rutas = readdirSync("src/app/api", { recursive: true, encoding: "utf8" })
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => f.endsWith("route.ts"));
  assert.ok(rutas.length >= 7, `solo encontró ${rutas.length} route handlers`);

  const abiertas = rutas.filter(
    (f) => !GUARDIAS.test(readFileSync(`src/app/api/${f}`, "utf8")) &&
      !/rechazoSiNoPanel\(\)/.test(readFileSync(`src/app/api/${f}`, "utf8")),
  );
  assert.deepEqual(abiertas, [], `endpoints sin control de acceso: ${abiertas.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Sin configuración no entra nadie, y hay que poder saber por qué (T002 C1)
// ---------------------------------------------------------------------------

import { supabaseEnv } from "@/lib/supabase/env";

test("con las variables puestas, devuelve la URL y la clave", () => {
  const previo = { ...process.env };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-anon";
  try {
    assert.deepEqual(supabaseEnv(), {
      url: "https://ejemplo.supabase.co",
      anonKey: "clave-anon",
    });
  } finally {
    process.env = previo;
  }
});

test("si falta una variable, el error DICE cuál falta", () => {
  // El fallo silencioso que esto reemplaza: el cliente se construía con
  // undefined, la llamada fallaba, y el proxy lo tomaba como "sin sesión". El
  // usuario veía un login que no entra nunca —igual que con la contraseña
  // equivocada— y nada apuntaba a la configuración.
  const previo = { ...process.env };
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-anon";
    assert.throws(() => supabaseEnv(), /NEXT_PUBLIC_SUPABASE_URL/);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    assert.throws(() => supabaseEnv(), /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    assert.throws(
      () => supabaseEnv(),
      /NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY/,
      "faltando las dos, tiene que nombrarlas a las dos",
    );
  } finally {
    process.env = previo;
  }
});

test("una variable vacía cuenta como faltante", () => {
  // En Vercel es fácil dejar la variable creada con el valor en blanco: un
  // string vacío construye un cliente igual de inútil que undefined.
  const previo = { ...process.env };
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "clave-anon";
    assert.throws(() => supabaseEnv(), /NEXT_PUBLIC_SUPABASE_URL/);
  } finally {
    process.env = previo;
  }
});
