// Las garantías de la emisión que no se pueden probar con una función.
//
// Emitir es la acción menos reversible del sistema: toma un folio que no vuelve
// y entrega un documento tributario. Sus reglas más importantes no viven en una
// función pura sino en el ORDEN y en las CONDICIONES de las consultas, y eso
// solo se comprueba de dos formas: con una base de datos real (casos FOL-* y
// EMI-* del plan de pruebas, anillo A3) o leyendo el archivo.
//
// Esto último es lo que hace este archivo, con el mismo criterio que
// `6-auth.test.mjs` usa para exigir que ninguna Server Action se quede sin
// guardia. No reemplaza a la prueba contra Postgres: la complementa, evitando
// que una de estas reglas desaparezca en una edición distraída y que nadie se
// entere hasta que haya dos folios quemados.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";


/**
 * El archivo sin comentarios.
 *
 * Hace falta porque estas pruebas buscan patrones en el CÓDIGO, y los
 * comentarios de estos módulos explican justamente las trampas que se están
 * prohibiendo —"lista y no `.maybeSingle()`", "no usar `.neq()` a secas"—. Sin
 * quitarlos, la explicación de por qué algo no se hace hace fallar la prueba de
 * que no se hace.
 */
function codigo(fuente) {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const EMITIR = readFileSync("src/app/(app)/facturas/emitir.ts", "utf8");
const CONSULTAR = readFileSync("src/app/(app)/facturas/consultar-sii.ts", "utf8");
const CONFIG = readFileSync("src/app/(app)/facturas/configuracion/actions.ts", "utf8");

// --- Folios ------------------------------------------------------------------

test("el folio se pide SOLO a tomar_folio(): la app nunca lo calcula", () => {
  // tomar_folio() es lo único que asigna bajo lock de fila y dentro del rango
  // autorizado por el CAF. Cualquier "último + 1" en este archivo sería un
  // asignador paralelo, que es exactamente lo que produce folios repetidos.
  assert.match(EMITIR, /rpc\(\s*["']tomar_folio["']/);
  assert.equal(/max\(|order\(["']folio["']|folio\s*\+\s*1/.test(codigo(EMITIR)), false);
});

test("se valida TODO antes de pedir el folio", () => {
  // El ensayo arma el documento con un folio de mentira para que salten los
  // errores de datos. Si se invirtiera el orden, cada cliente sin giro costaría
  // un folio quemado.
  const ensayo = EMITIR.indexOf("const ensayo = construirDocumento");
  const toma = EMITIR.indexOf('rpc("tomar_folio"');
  assert.ok(ensayo > 0, "no se encontró el ensayo previo");
  assert.ok(toma > 0, "no se encontró la toma de folio");
  assert.ok(ensayo < toma, "el ensayo tiene que ir ANTES de tomar el folio");
});

test("el certificado se descifra antes de tomar el folio", () => {
  // Una ENCRYPTION_KEY cambiada tiene que fallar sin costar un folio.
  assert.ok(EMITIR.indexOf("decrypt(") < EMITIR.indexOf('rpc("tomar_folio"'));
});

// --- Doble emisión (caso EMI-20 / UI-06 del plan) -----------------------------

test("hay un cerrojo condicional antes de tomar el folio", () => {
  // Dos pestañas leían las dos `folio = null`, las dos pasaban la guarda y se
  // quemaban dos folios para una factura. El cerrojo es un UPDATE condicionado:
  // Postgres serializa las escrituras y solo una devuelve fila.
  const cerrojo = EMITIR.indexOf("const { data: cerrojo");
  const toma = EMITIR.indexOf('rpc("tomar_folio"');
  assert.ok(cerrojo > 0, "no existe el cerrojo contra doble emisión");
  assert.ok(cerrojo < toma, "el cerrojo tiene que tomarse ANTES del folio");

  // Las tres condiciones que lo hacen correcto.
  assert.match(EMITIR, /\.eq\(["']estado["'],\s*["']borrador["']\)/);
  assert.match(EMITIR, /\.is\(["']folio["'],\s*null\)/);
  assert.match(EMITIR, /estado_sii\.is\.null,estado_sii\.neq\.emitiendo/);
});

test("el cerrojo no usa .neq() a secas sobre una columna que puede ser null", () => {
  // `estado_sii <> 'emitiendo'` es NULL cuando la columna es NULL, y en SQL eso
  // no es verdadero: un `.neq()` suelto dejaría afuera a los borradores nuevos
  // —los únicos que se emiten— y el botón no funcionaría nunca.
  assert.equal(/\.neq\(["']estado_sii["']/.test(codigo(EMITIR)), false);
});

test("si no se pudo tomar el folio, el cerrojo se suelta", () => {
  // Sin esto una factura sin folios disponibles quedaría trabada en
  // "emitiendo" para siempre.
  assert.match(EMITIR, /soltarCerrojo/);
  const sinFolios = EMITIR.indexOf("No quedan folios para el documento");
  const suelta = EMITIR.lastIndexOf("await soltarCerrojo()", sinFolios);
  assert.ok(suelta > 0 && suelta < sinFolios, "el camino sin folios no suelta el cerrojo");
});

// --- Consulta segura (casos SII-* y T035) -------------------------------------

test("consultar el estado NO toma folio ni reenvía el documento", () => {
  // Es la garantía que permite consultar todas las veces que haga falta. Si
  // esta acción llamara a tomar_folio() o a enviarAlSii(), refrescar una
  // pantalla costaría un folio o duplicaría un documento ante el SII.
  const c = codigo(CONSULTAR);
  assert.equal(/tomar_folio/.test(c), false);
  assert.equal(/enviarAlSii/.test(c), false);
  assert.equal(/generarDte|generarSobre/.test(c), false);
  assert.match(CONSULTAR, /consultarEnvio\(/);
});

test("la consulta usa el ambiente de la FACTURA, no el de las credenciales de hoy", () => {
  // Una factura vieja de certificación se consulta contra certificación aunque
  // la empresa ya haya pasado a producción: es donde vive ese track id.
  assert.match(CONSULTAR, /factura\.sii_ambiente/);
});

test("sin track id no se consulta nada", () => {
  assert.match(CONSULTAR, /no tiene track id/);
});

// --- Guardias de acceso -------------------------------------------------------

test("emitir y consultar son solo de admin", () => {
  // Las dos tocan el certificado digital. La RLS de sii_credenciales ya lo
  // exige; esta guarda evita llegar hasta ahí.
  assert.match(EMITIR, /if\s*\(!\(await esAdmin\(\)\)\)/);
  assert.match(CONSULTAR, /if\s*\(!\(await esAdmin\(\)\)\)/);
});

test("cargar certificado y CAF también son solo de admin", () => {
  // El certificado y el CAF son material de firma. Con `puedeEditar` un
  // operador subía el archivo al bucket y recién ahí la RLS le rechazaba el
  // insert, dejando el archivo huérfano.
  // Se busca la LLAMADA, no la palabra: el archivo la menciona en un comentario
  // que explica por qué ya no se usa.
  assert.equal(/await puedeEditar\(\)/.test(codigo(CONFIG)), false);
  const guardas = CONFIG.match(/if\s*\(!\(await esAdmin\(\)\)\)/g) ?? [];
  assert.equal(guardas.length, 2, "las dos acciones de configuración SII exigen admin");
});

// --- Secretos -----------------------------------------------------------------

test("ningún archivo de la cadena registra el certificado ni la clave", () => {
  // Un console.log con el .pfx o la contraseña los deja en los logs del
  // servidor, que es un lugar del que no se borran.
  for (const [nombre, fuente] of [
    ["emitir.ts", EMITIR],
    ["consultar-sii.ts", CONSULTAR],
    ["configuracion/actions.ts", CONFIG],
  ]) {
    assert.equal(/console\.(log|info|debug|warn|error)/.test(codigo(fuente)), false, nombre);
  }
});

test("la clave del certificado nunca vuelve en la respuesta", () => {
  // `password` se cifra y se guarda; no puede aparecer en ningún objeto de
  // retorno, que es lo que termina en el HTML de la página.
  assert.equal(/return\s*\{[^}]*\bpassword\b/.test(CONFIG), false);
  assert.match(CONFIG, /encrypt\(password\)/);
});

// --- Limpieza compensatoria (T013 / T020) -------------------------------------

test("una subida que no llega a persistirse se borra del bucket", () => {
  // Sin esto el bucket queda con certificados y CAF que ninguna fila
  // referencia: material de firma sin dueño y sin forma de saber que sobra.
  assert.match(CONFIG, /limpiarSubida/);
  assert.match(CONFIG, /storage\s*\n?\s*\.from\(["']certificados["']\)\s*\n?\s*\.remove\(/);
});

test("el certificado anterior no se borra antes de que el nuevo quede escrito", () => {
  // Con una ruta fija y `upsert: true`, subir un certificado nuevo destruía el
  // anterior ANTES de saber si el nuevo servía. La ruta lleva sufijo único y el
  // borrado del viejo va después del upsert de la fila.
  assert.match(CONFIG, /upsert:\s*false/);
  const persiste = CONFIG.indexOf(".update(valores)");
  const borraViejo = CONFIG.indexOf("pathAnterior !== pathNuevo");
  assert.ok(persiste > 0, "no se encontró la escritura de la credencial");
  assert.ok(borraViejo > persiste, "el certificado viejo se borra antes de persistir el nuevo");
});

test("la credencial se escribe sin depender de la restricción única vieja", () => {
  // `onConflict: "empresa_id"` deja de existir cuando se aplica la migración
  // 0053, que cambia la unicidad a (empresa_id, ambiente) para poder preparar
  // producción sin pisar certificación. Escrito como update-si-existe, la
  // migración se puede aplicar cuando el dueño decida.
  // La llamada, no la palabra: el comentario del archivo explica por qué se dejó
  // de usar `onConflict` y nombrarlo no puede hacer fallar la prueba.
  assert.equal(/sii_credenciales["']\)\s*\.upsert\(/.test(codigo(CONFIG)), false);
  assert.match(CONFIG, /\.eq\(["']ambiente["'],\s*ambiente\)/);
});

// --- Separación de ambientes (T006) -------------------------------------------

test("certificado y CAF se guardan bajo la carpeta de su ambiente", () => {
  // Rutas `<empresa>/<ambiente>/…`. Mezclar certificación y producción en la
  // misma carpeta es el error que esta feature existe para evitar.
  assert.match(CONFIG, /\$\{empresaId\}\/\$\{ambiente\}\/certificado-/);
  assert.match(CONFIG, /\$\{empresa\.id\}\/\$\{ambiente\}\/caf\//);
});

// --- Separación de ambientes tras las migraciones 0053 y 0054 -----------------
//
// La 0053 permitió DOS credenciales por empresa. Eso convirtió cada
// `.maybeSingle()` sobre `sii_credenciales` en una bomba de tiempo: con una
// sola fila anda, y el día que se carga la de producción la consulta falla
// entera. Estas pruebas fijan que no vuelva.

const CONFIG_SII = readFileSync("src/app/(app)/facturas/config-sii.ts", "utf8");
const CONTENIDO = readFileSync("src/app/(app)/facturas/configuracion/contenido.tsx", "utf8");

test("ningún lector de sii_credenciales usa maybeSingle()", () => {
  for (const [nombre, fuente] of [
    ["config-sii.ts", CONFIG_SII],
    ["emitir.ts", EMITIR],
    ["consultar-sii.ts", CONSULTAR],
    ["configuracion/contenido.tsx", CONTENIDO],
    ["configuracion/actions.ts", CONFIG],
  ]) {
    const usa = /from\(["']sii_credenciales["']\)[\s\S]{0,400}?\.maybeSingle\(\)/.test(codigo(fuente));
    assert.equal(usa, false, `${nombre} lee sii_credenciales con maybeSingle()`);
  }
});

test("toda lectura de credenciales filtra por ambiente", () => {
  for (const [nombre, fuente] of [
    ["config-sii.ts", CONFIG_SII],
    ["emitir.ts", EMITIR],
    ["consultar-sii.ts", CONSULTAR],
    ["configuracion/contenido.tsx", CONTENIDO],
  ]) {
    const bloque = codigo(fuente).match(/from\(["']sii_credenciales["']\)[\s\S]{0,500}?;/);
    assert.ok(bloque, `${nombre}: no se encontró la lectura`);
    assert.match(bloque[0], /\.eq\(["']ambiente["']/, `${nombre} no filtra por ambiente`);
  }
});

test("los folios también se leen por ambiente", () => {
  const bloque = codigo(CONFIG_SII).match(/from\(["']sii_caf["']\)[\s\S]{0,300}?;/);
  assert.ok(bloque);
  assert.match(bloque[0], /\.eq\(["']ambiente["']/);
});

test("el ambiente lo decide la empresa, no la credencial", () => {
  // Preguntárselo a la credencial es circular: con dos filas, ninguna puede
  // decir cuál manda. Y deducirlo de "existe la de producción" convertiría
  // cargar un certificado en empezar a emitir documentos reales.
  assert.match(CONFIG_SII, /sii_ambiente_activo/);
  assert.equal(/const ambiente = \(cred\.ambiente/.test(codigo(EMITIR)), false);
  assert.match(EMITIR, /const config = await configSii\(\)/);
});

test("si la 0054 no está aplicada, se cae a certificación", () => {
  // El modo degradado tiene que ser el SEGURO: nunca una emisión real por
  // accidente. La consulta del ambiente activo va aparte justamente para que su
  // fallo no arrastre al resto.
  assert.match(CONFIG_SII, /let ambiente: Ambiente = "certificacion"/);
  assert.match(CONFIG_SII, /sii_ambiente_activo === "produccion"/);
});

test("el diagnóstico no devuelve el valor de la key de SimpleAPI", () => {
  // Se informa SI está puesta, nunca cuánto vale: este objeto viaja al HTML.
  assert.match(CONFIG_SII, /Boolean\(process\.env\.SIMPLEAPI_KEY\?\.trim\(\)\)/);
  assert.equal(/detalle:\s*process\.env\.SIMPLEAPI_KEY\s*[,}]/.test(CONFIG_SII), false);
});

test("el estado de cada componente se comunica con texto, no solo con color", () => {
  // Requisito de accesibilidad (T033): una lista donde lo que falta se
  // distingue solo por ser rojo no se puede leer sin ver los colores.
  assert.match(CONTENIDO, /sr-only/);
  assert.match(CONTENIDO, /Listo: |Falta: /);
});

// --- Reintento del envío (T030 / brecha G2) -----------------------------------
//
// El callejón que resuelve: envío fallido = folio consumido + DTE timbrado en
// Storage + factura en borrador. Antes no había salida y "Emitir" rebotaba con
// «ya tiene el folio N asignado».

const REENVIAR = readFileSync("src/app/(app)/facturas/reenviar.ts", "utf8");
const PANEL = readFileSync("src/app/(app)/facturas/sii-panel.tsx", "utf8");

test("reenviar NUNCA toma un folio", () => {
  // Es LA regla de esta acción. Si reintentar costara un folio, cada caída de
  // red durante la certificación quemaría uno, y hay que declararlos al SII de
  // a uno como no utilizados.
  const c = codigo(REENVIAR);
  assert.equal(/tomar_folio/.test(c), false, "reenviar llama a tomar_folio");
  assert.equal(/rpc\(/.test(c), false);
});

test("reenviar no vuelve a timbrar: manda el MISMO documento", () => {
  // Timbrar de nuevo produciría un documento distinto con otro folio, y
  // quedarían dos con el mismo contenido y solo uno declarado.
  const c = codigo(REENVIAR);
  assert.equal(/generarDte\(/.test(c), false, "reenviar vuelve a timbrar");
  assert.match(c, /storage[\s\S]{0,80}\.from\(["']adjuntos["']\)[\s\S]{0,80}\.download\(/);
  assert.match(c, /enviarAlSii\(/);
});

test("reenviar exige el callejón exacto y no otro", () => {
  const c = codigo(REENVIAR);
  // Sin folio se emite, no se reenvía.
  assert.match(c, /!factura\.folio/);
  // Sin DTE guardado no hay nada que mandar.
  assert.match(c, /!factura\.sii_xml_path/);
  // Una factura ya emitida se consulta, no se reenvía.
  assert.match(c, /factura\.estado !== "borrador"/);
});

test("reenviar usa el ambiente de la factura, no el activo de hoy", () => {
  // El folio pertenece al CAF de ese ambiente: mandarlo al otro sería otro
  // documento.
  assert.match(codigo(REENVIAR), /factura\.sii_ambiente/);
  assert.equal(/configSii\(\)/.test(codigo(REENVIAR)), false);
});

test("reenviar tiene cerrojo y nunca deja la factura trabada", () => {
  const c = codigo(REENVIAR);
  assert.match(c, /estado_sii: "emitiendo"/);
  assert.match(c, /\.eq\(["']estado_sii["'],\s*["']error["']\)/);
  // Todo camino de error devuelve la factura a 'error' con su motivo.
  assert.match(c, /const fallar = async/);
  assert.match(c, /estado_sii: "error"/);
});

test("el botón de reintentar solo aparece en ese callejón", () => {
  const c = codigo(PANEL);
  assert.match(c, /const puedeReenviar =/);
  assert.match(c, /estado === "error"/);
  assert.match(c, /factura\.folio/);
  assert.match(c, /factura\.sii_xml_path/);
});

test("el resultado de las acciones se anuncia con aria-live", () => {
  // Sin esto, quien usa lector de pantalla aprieta "Reintentar envío" y no se
  // entera de si funcionó: el texto aparece sin ser anunciado.
  assert.match(PANEL, /aria-live="polite"/);
});

test("el mensaje de éxito del reenvío aclara que no se gastó otro folio", () => {
  // Es la duda inmediata de quien acaba de perder uno.
  assert.match(PANEL, /No se\s*\n?\s*consumió un folio nuevo/);
});

// --- Lo que la lista y el panel tienen que mostrar (T037) ---------------------
//
// No son pruebas de render con DOM: el proyecto no tiene entorno de navegador y
// montarlo para esto sería desproporcionado. Son pruebas de CONTRATO — que los
// datos lleguen al componente y que las piezas que no pueden faltar estén.
// Cubren la regresión real: alguien cambia un `select` y la pastilla del SII
// deja de aparecer sin que nada falle.

const ACORDEON = readFileSync("src/app/(app)/facturas/factura-accordion.tsx", "utf8");

test("la fila muestra estado del SII además del estado comercial", () => {
  const c = codigo(ACORDEON);
  assert.match(c, /clasificarEstadoSii\(f\.estado_sii, f\.sii_glosa\)/);
  assert.match(c, /<FacturaBadge/);
  assert.match(c, /<SiiBadge/);
  // Las cargadas a mano no muestran la del SII: no tienen nada que informar.
  assert.match(c, /estadoSii !== "sin_enviar"/);
});

test("una factura con problema en el SII se distingue en la fila", () => {
  // Si se viera igual que el resto, es justo la que alguien va a ir a cobrar.
  assert.match(codigo(ACORDEON), /necesitaAtencion\(sii\)/);
});

test("el panel recibe todo lo que necesita para no consultar de más", () => {
  // Los cinco datos que el panel muestra o usa para decidir qué botones ofrecer.
  const tipo = PANEL.match(/export type DatosSii = \{[\s\S]*?\};/);
  assert.ok(tipo, "no se encontró el tipo DatosSii");
  for (const campo of [
    "folio",
    "sii_track_id",
    "sii_ambiente",
    "estado_sii",
    "sii_glosa",
    "sii_enviado_at",
    "sii_xml_path",
    "sii_pdf_path",
  ]) {
    // `includes` y no una expresión regular: dentro de un template literal `\b`
    // es el carácter backspace, no un límite de palabra, y el patrón no calza
    // nunca. Para buscar un nombre de campo, `includes` alcanza y no tiene esa
    // trampa.
    assert.ok(tipo[0].includes(campo), `falta ${campo} en DatosSii`);
  }
});

test("la consulta de facturas trae las columnas del SII", () => {
  // `select("*")` es lo que hace que el panel tenga datos. Si alguien lo cambia
  // por una lista de columnas y olvida las sii_*, el panel queda mudo.
  const page = readFileSync("src/app/(app)/facturas/page.tsx", "utf8");
  assert.match(codigo(page), /from\("facturas"\)\s*\n?\s*\.select\("\*/);
});

test("el XML y el PDF se abren con URL firmada, no con enlace directo", () => {
  // Son documentos tributarios en un bucket privado: un href fijo sería una
  // dirección pública a la factura de un cliente.
  const c = codigo(PANEL);
  assert.match(c, /createSignedUrl\(/);
  assert.equal(/href=\{[^}]*sii_(xml|pdf)_path/.test(c), false);
});

// --- Cambio de ambiente (T023) ------------------------------------------------

const AMB_ACTIONS = readFileSync(
  "src/app/(app)/facturas/configuracion/ambiente-actions.ts",
  "utf8",
);
const AMB_FORM = readFileSync("src/app/(app)/facturas/configuracion/ambiente-form.tsx", "utf8");

test("pasar a producción exige escribir la palabra", () => {
  // Un botón de confirmar se aprieta sin leer; escribir una palabra obliga a
  // mirar qué dice el cuadro.
  const c = codigo(AMB_ACTIONS);
  assert.match(c, /PALABRA_PRODUCCION/);
  assert.match(c, /confirmacion !== PALABRA_PRODUCCION/);
});

test("no se pasa a producción sin credenciales, resolución y folios de producción", () => {
  // Cambiar el ambiente sin equiparlo no rompe nada de inmediato: rompe la
  // próxima emisión, que es el peor momento para enterarse.
  const c = codigo(AMB_ACTIONS);
  assert.match(c, /\.eq\("ambiente",\s*"produccion"\)/);
  assert.match(c, /certificado digital de producción/);
  assert.match(c, /resolución del SII de producción/);
  assert.match(c, /CAF de producción/);
});

test("volver a certificación no pide nada: es la dirección segura", () => {
  const c = codigo(AMB_ACTIONS);
  const bloqueProd = c.indexOf('if (ambiente === "produccion")');
  const confirmacion = c.indexOf("confirmacion");
  assert.ok(bloqueProd > 0 && confirmacion > bloqueProd, "la confirmación aplica a los dos sentidos");
});

test("cambiar de ambiente es solo de admin y se anuncia", () => {
  assert.match(codigo(AMB_ACTIONS), /if\s*\(!\(await esAdmin\(\)\)\)/);
  assert.match(AMB_FORM, /aria-live="assertive"/);
});

// --- Folios no utilizados (T024) ----------------------------------------------

test("un folio quemado queda como FILA, no solo dentro de un texto", () => {
  // El trámite ante el SII pide la lista de folios a declarar. Sacarla de
  // glosas, leyéndolas de a una, no es una lista: es una búsqueda.
  const c = codigo(EMITIR);
  assert.match(c, /from\("sii_folios_no_utilizados"\)\s*\n?\s*\.insert\(/);
  const abortar = c.indexOf("const abortar = async");
  const insert = c.indexOf('from("sii_folios_no_utilizados")');
  assert.ok(insert > abortar, "el registro tiene que estar dentro de abortar()");
});

test("el registro del folio quemado guarda con qué documento y por qué", () => {
  const bloque = codigo(EMITIR).match(
    /from\("sii_folios_no_utilizados"\)\s*\n?\s*\.insert\(\{[\s\S]*?\}\)/,
  );
  assert.ok(bloque);
  for (const campo of ["tipo_dte", "ambiente", "folio", "factura_id", "motivo"]) {
    assert.ok(bloque[0].includes(campo), `falta ${campo}`);
  }
});

// --- Carga de CAF: duplicado y rollback (T020) --------------------------------

test("un CAF duplicado se rechaza sin reiniciar los folios", () => {
  // El índice único (empresa, tipo, ambiente, folio_desde) es lo que impide que
  // volver a subir el mismo CAF ponga `folio_siguiente` de nuevo en el inicio y
  // repita folios YA EMITIDOS. La app tiene que traducir ese 23505, no
  // mostrarlo crudo: "duplicate key value violates unique constraint" no le
  // dice a nadie que se acaba de evitar un desastre.
  const c = codigo(CONFIG);
  assert.match(c, /error\.code === "23505"/);
  assert.match(c, /ya estaba cargado/);
  assert.match(c, /no reiniciar los folios ya usados/);
});

test("el XML del CAF duplicado NO se borra", () => {
  // La ruta se deriva del rango, así que el archivo del duplicado es EL MISMO
  // del CAF bueno: borrarlo lo dejaría sin la llave con la que se timbra.
  // Solo se borra cuando el insert falla por otra causa y el XML quedó huérfano.
  const c = codigo(CONFIG);
  const bloque23505 = c.indexOf('error.code === "23505"');
  const removeCaf = c.indexOf('from("certificados").remove([path])');
  assert.ok(bloque23505 > 0 && removeCaf > bloque23505, "el duplicado no debe borrar el XML");
});

test("el CAF se guarda en el ambiente que se está configurando", () => {
  // Un rango de certificación cargado como producción emitiría documentos
  // reales con folios de prueba: el SII los rechaza y el folio queda quemado.
  const c = codigo(CONFIG);
  assert.match(c, /ambienteForm === "produccion" \|\| ambienteForm === "certificacion"/);
  assert.match(c, /\$\{empresa\.id\}\/\$\{ambiente\}\/caf\//);
});
