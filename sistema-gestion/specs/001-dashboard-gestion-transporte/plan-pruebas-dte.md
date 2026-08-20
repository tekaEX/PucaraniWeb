# Plan de pruebas DTE

Estrategia y matriz de validación de la emisión de documentos tributarios
electrónicos vía SimpleAPI, **sin certificado digital ni CAF reales**.

| | |
|---|---|
| **Sistema** | ERP SaaS multi-empresa de Transportes Pucarani (`sistema-gestion`) |
| **Stack** | Next.js 16.2.9 (App Router, Server Actions) · React 19.2 · TypeScript · Supabase (Postgres + RLS + Storage) · Node 24 |
| **Proveedor DTE** | SimpleAPI (`https://api.simpleapi.cl`) |
| **Operaciones integradas** | Factura afecta (33) · Factura exenta (34) · sobre `EnvioDTE` · envío al SII · representación impresa PDF · estado de suscripción |
| **Fuera de alcance hoy** | Notas de crédito/débito (56/61), boletas electrónicas, libro de ventas, RCV de compras |
| **Corredor de pruebas** | `node:test` (sin framework externo), `pruebas/loader.mjs` — 254 pruebas |
| **Fecha** | 2026-08-19 · G1 y G8 cerradas ese mismo día |

---

## 0. Dos premisas del brief que hay que corregir antes de planificar

Esto no es un detalle de redacción: si el plan se arma sobre estas dos premisas,
la mitad de los casos quedan sin poder ejecutarse.

### 0.1 No existe un «ambiente Demo/Sandbox» de SimpleAPI

SimpleAPI **no entrega certificados de prueba**, y el ambiente de certificación
del SII **no es un sandbox anónimo**. Para entrar a certificación hay que
autenticarse con un certificado digital real, postular como emisor electrónico
y recién ahí descargar el primer CAF. No hay forma de saltearlo.

Lo que sí existe, y ya está montado en este repo, es algo distinto y bastante
mejor de lo que suele conseguirse: **la API real de SimpleAPI se puede ejercitar
gratis y de punta a punta con datos sintéticos.** Cuatro de los cinco pasos de
la cadena de emisión no consumen cuota (medido: el contador `uso` quedó en 0
después de varias corridas), y funcionan con un `.pfx` autofirmado y un CAF
fabricado localmente.

Por eso este plan **no** se organiza como «sandbox vs. producción». Se organiza
en tres anillos según qué se puede verificar con qué credenciales (§1.1).

### 0.2 El host de certificación de este proyecto es `maullin`, no `mcert`

Los dos ambientes que declara el sistema (migración `0052_sii_emision.sql`) son:

| Ambiente | Host de administración del SII | `Ambiente` que se manda a SimpleAPI | N° de resolución |
|---|---|---|---|
| Certificación | `https://maullin.sii.cl/cvc_cgi/dte/ad_empresa1` | `0` | `0` |
| Producción | `https://palena.sii.cl/cvc_cgi/dte/ad_empresa1` | `1` | el que asigne el SII |

Y una precisión que cambia el diseño de las pruebas: **la app nunca habla con
el SII directamente.** Habla solo con SimpleAPI, y es SimpleAPI quien resuelve
contra maullin o palena según el entero `Ambiente` (`AMBIENTE` en
`src/lib/sii/simpleapi.ts`). No hay nada que apuntar, mockear ni monitorear
contra un host del SII: la frontera de integración a probar es
`api.simpleapi.cl` y nada más.

---

## 1. Estrategia de ambientes y datos de prueba

### 1.1 Los tres anillos

| Anillo | Qué valida | Red | Credenciales | Comando | ¿CI? | Costo |
|---|---|---|---|---|---|---|
| **A1 — Aislado** | Lógica pura y armado del request: aritmética del DTE, lectura del CAF, forma exacta del multipart, traducción de errores | No (se reemplaza `fetch`) | Ninguna | `npm test` | Sí, bloqueante | 0 |
| **A2 — Contrato vivo** | Que el contrato escrito siga siendo el que la API espera: timbrado, sobre, PDF, forma de la respuesta de error | Sí, contra `api.simpleapi.cl` | `SIMPLEAPI_KEY` + fixtures sintéticos | `npm run test:simpleapi` | No (necesita key) | 0 — no consume cuota |
| **A3 — Certificación SII** | Lo único que exige identidad real: aceptación del envío, track id, estado del SII, set de pruebas | Sí | Certificado digital real + CAF de certificación | Manual | No | Certificado ≈ $12.000–20.000/año |

**A1 y A2 ya existen y están verdes.** A3 está bloqueado por el certificado, que
es el único bloqueo real del proyecto.

La regla de oro que ordena todo lo que sigue: **cada caso se escribe en el anillo
más barato que pueda detectarlo.** Un descuadre de IVA que se detecta en A1 no
debe descubrirse en A3, porque en A3 el descubrimiento cuesta un folio quemado.

### 1.2 Estrategia de mocking en A1: qué se dobla y qué no

La decisión de diseño que hace que estas pruebas valgan algo: **se importan los
archivos reales de `src/`, no copias ni versiones portadas.** `pruebas/loader.mjs`
resuelve el alias `@/…` y los imports sin extensión, y sustituye por un doble
**solo** lo que no puede ser real dentro de un proceso de Node.

| Módulo | ¿Real o doble? | Por qué |
|---|---|---|
| `src/lib/sii/documento.ts` | **Real** | Es puro. Toda la aritmética que el SII revisa con lupa se prueba sin credenciales. |
| `src/lib/caf.ts` | **Real** | Puro. Parser de XML sobre strings. |
| `src/lib/sii/simpleapi.ts` | **Real** | Lo que se dobla es `globalThis.fetch`, no el módulo. Así se inspecciona el request que **realmente** sale. |
| `globalThis.fetch` | Doble (`interceptar()`) | Frontera de red. Captura `url` + `init` y responde lo que el caso indique. |
| `server-only` | Doble | Lanza a propósito salvo que lo resuelva el bundler de Next. |
| `next/headers`, `next/navigation` | Doble | Solo existen dentro del servidor de Next. |
| `@/lib/supabase/client` | Doble | Red y base. |

**Por qué se dobla `fetch` y no el cliente de SimpleAPI.** Doblar el módulo
entero probaría que quien llama pasa los argumentos bien, y nada más. El error
que hundió la sincronización de combustible fue justamente de la capa de abajo:
el body y el header estaban escritos de memoria, el código compilaba, el
typecheck pasaba, la revisión no lo vio, y nunca funcionó. Solo se ve mirando el
request armado. Por eso el doble está en `fetch` y las aserciones son sobre los
campos del `FormData`:

```js
function campos(init) {
  return [...init.body.entries()].map(([clave, valor]) => ({
    clave,
    esArchivo: typeof valor !== "string",
    nombreArchivo: typeof valor === "string" ? null : valor.name,
    valor: typeof valor === "string" ? valor : null,
  }));
}
```

Los cinco invariantes del contrato que A1 congela, y que ningún typecheck
protege:

1. `Authorization: <key>` **sin prefijo** — con `Bearer` la API responde 401.
2. El `input` viaja como **campo de texto dentro de un `multipart/form-data`**,
   no como JSON en el body.
3. Los archivos son **posicionales**: `files`, `files2`, `files3`… y el
   certificado va **primero**.
4. `/api/v1/impresion/pdf/carta/v2` rompe esa convención: usa `fileEnvio` y
   `logo`.
5. Un error puede llegar con **HTTP 400 y un JSON que dice `"ok": true`**. Ese
   campo no sirve: manda `estado` y el `trackId` (`-999999` es el centinela).

### 1.3 Los datos ficticios: cómo simular la cadena completa

`npm run fixtures` (`pruebas/fixtures/generar-fixtures.mjs`) produce en
`pruebas/fixtures/salida/` (ignorada por git):

| Archivo | Qué es | Detalle que importa |
|---|---|---|
| `certificado-prueba.pfx` | Firma autofirmada, clave `prueba123`, titular `11111111-1` | Se exporta con **`PBE-SHA1-3DES` + `macalg sha1`**, no con el default de OpenSSL 3 (AES-256/PBKDF2). SimpleAPI corre sobre .NET y un `.pfx` moderno puede fallar al abrirse, lo que se ve como «clave incorrecta» y manda a buscar el problema donde no está. |
| `CAF_33_1_50.xml` | CAF sintético, folios 1–50, tipo 33, RUT emisor `76192083-9` | Lleva un **par RSA real** de 512 bits con exponente 3 (los que usa el SII). No es relleno: SimpleAPI extrae la `RSASK` y con ella firma el timbre (TED). Con relleno el timbrado falla. |

**El límite exacto de la simulación, y por qué está donde está:**

| Paso | Endpoint | ¿Funciona con fixtures? | Por qué |
|---|---|---|---|
| 0 · Conexión y cuota | `GET /api/v1/Suscripcion/status` | ✅ Sí | Solo necesita la key |
| 1 · Timbrar y firmar | `POST /api/v1/dte/generar` | ✅ Sí — devuelve DTE con `<TED>`, `<FRMT>` y `<Signature>` | La llave RSA del CAF es real |
| 2 · Sobre de envío | `POST /api/v1/envio/generar` | ✅ Sí — devuelve el `EnvioDTE` | Solo firma con el `.pfx` |
| 3 · Representación impresa | `POST /api/v1/impresion/pdf/carta/v2` | ✅ Sí — devuelve el PDF | Lee el DTE ya timbrado; no necesita certificado |
| 4 · **Envío al SII** | `POST /api/v1/envio/enviar` | ❌ **No** — responde *«Certificado vencido»* | Único paso donde SimpleAPI se autentica ante el SII. La `<FRMA>` del CAF la firma el SII con su propia llave, y el `.pfx` no lo emite una autoridad que el SII reconozca. |

**Que falle en el paso 4, y solo ahí, es el resultado que confirma que todo lo
anterior está bien.** Ese es el criterio de aprobación del anillo A2: no es «que
pase todo», es «que falle exactamente en un lugar, con ese mensaje».

### 1.4 Qué NO se puede simular (y cómo se cubre igual)

| No simulable con fixtures | Cómo se cubre | Anillo |
|---|---|---|
| Aceptación del envío por el SII | Respuesta inyectada en el doble de `fetch` con el JSON real de un envío aceptado | A1 |
| Rechazo / «Aceptado con reparos» del SII | Ídem, con los `estado` reales del SII (`EPR`, `RCH`, `RSC`, `RFR`, `SOK`) | A1 |
| Vencimiento del CAF | CAF sintético con `<FA>` antigua | A1 |
| Agotamiento de folios | `sii_caf` con `folio_siguiente = folio_hasta + 1` en una base de prueba | A1 + Postgres local |
| Carrera de dos emisiones por el mismo folio | Dos conexiones concurrentes contra `tomar_folio()` | Postgres local |
| Timbre válido ante el SII | **Imposible.** Depende de la `<FRMA>` del SII | A3 |

### 1.5 Datos maestros de prueba

Fijos, para que los casos sean reproducibles y comparables entre corridas.

| Dato | Valor | Origen |
|---|---|---|
| RUT empresa emisora | `76192083-9` | `generar-fixtures.mjs` · debe coincidir con `<RE>` del CAF |
| RUT titular del certificado | `11111111-1` | Va como `Certificado.Rut` / `<RutEnvia>`. **Distinto del de la empresa a propósito** |
| Clave del `.pfx` | `prueba123` | |
| RUT receptor (cliente) | `96790240-3` | |
| RUT del SII (receptor del sobre) | `60803000-K` | `RUT_SII`, constante de la API |
| Razón social emisor | `TRANSPORTES PUCARANI LIMITADA` | |
| Giro emisor | `TRANSPORTE DE PASAJEROS` | |
| Actividad económica | `[492300]` | |
| Comuna | `Arica` | |
| N° / fecha de resolución | `0` / fecha del día | En certificación el número es 0 |
| Factura patrón | 33, folio 1, 1 línea × $100.000 → neto 100.000 / IVA 19.000 / total 119.000 | |

---

## 2. Matriz de casos de prueba

Convención de IDs: `DOC` documento · `CAF` folios autorizados · `FOL` asignación
de folio · `API` contrato SimpleAPI · `EMI` orquestación · `SII` respuesta del
SII · `UI` interfaz (§3).

Los casos marcados 🔴 **no se pueden ejecutar hoy**: dependen de una brecha
abierta, listada en §4.

### 2.1 DOC — Construcción del documento

Módulo puro `src/lib/sii/documento.ts`. Anillo A1, sin red. Cubre lo que el
brief pide como *«Inconsistencias en el DTE»*, **antes** de llamar a la API.

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| DOC-01 | Factura afecta con una línea | Happy | Factura patrón (§1.5) | `construirDocumento()` | `Totales = {MontoNeto:100000, TasaIVA:19, IVA:19000, MontoTotal:119000}`; `Detalles[0].IndicadorExento = 0`; `UnidadMedida:"un"` | — sin red |
| DOC-02 | Factura exenta (34) | Happy | `tipoDte:34`, neto 80.000, iva 0, total 80.000 | Ídem | `Totales = {MontoExento:80000, MontoTotal:80000}`. **Sin** `MontoNeto`, `TasaIVA` ni `IVA`; `IndicadorExento:1` en **todas** las líneas | — |
| DOC-03 | El neto es la suma de ítems ya redondeados | Borde | 3 líneas × $33.333,33 | Ídem | `MontoNeto = 99999` (33333×3), **no** 100000. El descuadre de $1 entre la suma impresa y la cabecera es motivo de reparo del SII | — |
| DOC-04 | Neto + IVA ≠ total | Negativo | Factura registra total 120.000; los viajes suman 119.000 | Ídem | Error con las **seis** cifras (registrado vs. calculado) y la instrucción «Revisá los viajes incluidos antes de emitir». No se arma documento | — |
| DOC-05 | IVA mal calculado en la cabecera | Negativo | neto 100.000, iva 19.500, total 119.500 | Ídem | Mismo error de descuadre | — |
| DOC-06 | Cliente sin giro | Negativo | `cliente.giro = null` | Ídem | `Falta el giro del cliente "…". El SII lo exige en la factura.` | — |
| DOC-07 | Cliente sin RUT / dirección / comuna / razón social | Negativo | Cada campo nulo por separado (4 corridas) | Ídem | Un error distinto por campo, **nombrando al cliente** para que se pueda ir a corregir la ficha | — |
| DOC-08 | Empresa sin actividad económica | Negativo | `actividad_economica = []` | Ídem | `Falta el código de actividad económica de la empresa (lo asigna el SII).` | — |
| DOC-09 | Empresa sin giro / dirección / comuna / RUT | Negativo | Cada campo vacío (4 corridas) | Ídem | Un error por campo | — |
| DOC-10 | Factura sin viajes asociados | Negativo | `lineas = []` | Ídem | `…un DTE necesita al menos una línea.` | — |
| DOC-11 | 60 líneas exactas | Borde | 60 viajes | Ídem | Se arma correctamente (tope del SII, inclusive) | — |
| DOC-12 | 61 líneas | Borde | 61 viajes | Ídem | Error citando el tope 60 y sugiriendo dividir en dos documentos | — |
| DOC-13 | Descripción de 120 caracteres | Borde | 1 línea, descripción larga | Ídem | `Detalles[0].Nombre` cortado en 80. **No** falla | — |
| DOC-14 | Sin folio | Negativo | `folio: 0` | Ídem | `La factura no tiene folio. El folio lo entrega el CAF, no se escribe a mano.` | — |
| DOC-15 | Fecha de emisión mal formada | Negativo | `"18-08-2026"` | Ídem | Error citando el formato AAAA-MM-DD | — |
| DOC-16 | Línea con cantidad 0 o valor negativo | Negativo | `cantidad: 0`; luego `valorUnitario: -500` | Ídem | Error nombrando la línea | — |
| DOC-17 🔴 | **RUT emisor con dígito verificador inválido** | Negativo | `emisor.rut = "76192083-0"` (DV incorrecto) | Ídem | **Debería** rechazarse antes de tomar folio. **Hoy pasa**: solo se valida que no esté vacío → ver brecha **G6** | El SII lo rechazaría con el folio ya consumido |
| DOC-18 🔴 | **RUT receptor con formato basura** | Negativo | `receptor.rut = "sin rut"` | Ídem | **Debería** rechazarse. Hoy pasa → **G6** | Ídem |
| DOC-19 | Contacto opcional ausente | Borde | `receptor.contacto = null` | Ídem | La clave `Contacto` **no aparece** en el JSON (no va vacía) | — |
| DOC-20 | Fecha de vencimiento presente / ausente | Borde | Con y sin `fechaVencimiento` | Ídem | `FechaVencimiento` presente solo cuando hay valor | — |

### 2.2 CAF — Lectura y carga de folios autorizados

`src/lib/caf.ts` + `src/app/(app)/facturas/configuracion/actions.ts`. Anillo A1.

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| CAF-01 | CAF válido tipo 33, folios 1–50 | Happy | `CAF_33_1_50.xml` | `parsearCaf()` | `{rutEmisor:"76192083-9", tipoDte:33, folioDesde:1, folioHasta:50, fechaAutorizacion:"AAAA-MM-DD"}` | — |
| CAF-02 | El rango sale de `<RNG>`, no de cualquier `<D>` suelto | Borde | CAF con una etiqueta `<D>` fuera de `<RNG>` | Ídem | Se lee el `<D>` de dentro de `<RNG>`. Una etiqueta de una letra suelta no debe secuestrar el rango | — |
| CAF-03 | Rango de un solo folio | Borde | `<D>7</D><H>7</H>` | Ídem | Válido: desde 7 hasta 7 | — |
| CAF-04 | Archivo que no es un CAF | Negativo | Un XML cualquiera sin `<AUTORIZACION>` | Ídem | Mensaje que indica **dónde** se descarga («Timbraje electrónico») | — |
| CAF-05 | Rango invertido | Negativo | `<D>100</D><H>1</H>` | Ídem | Error explícito, no se carga al revés | — |
| CAF-06 | Tipo de documento no soportado | Negativo | `<TD>39</TD>` (boleta) | Ídem | Error listando los soportados: 33, 34, 56, 61 | — |
| CAF-07 | Falta `<DA>` / `<RE>` / `<TD>` / `<RNG>` / `<FA>` | Negativo | 5 CAF mutilados | Ídem | Un error específico por etiqueta faltante | — |
| CAF-08 | Fecha de autorización mal formada | Negativo | `<FA>18/08/2026</FA>` | Ídem | Error citando el formato esperado | — |
| CAF-09 | CAF de **otro RUT** | Negativo | `<RE>77000000-1</RE>` con empresa `76192083-9` | `guardarCaf()` | `Ese CAF es del RUT 77000000-1 y la empresa está configurada como 76192083-9.` No se sube ni se inserta | — |
| CAF-10 | RUT escrito con puntos y guion | Borde | `76.192.083-9` en el formulario vs. `76192083-9` en el CAF | `mismoRut()` | Se consideran iguales (ignora puntos, guion y mayúscula de la K) | — |
| CAF-11 | **Recarga del mismo CAF** | Negativo | Subir dos veces `CAF_33_1_50.xml` | `guardarCaf()` × 2 | La segunda es rechazada por el índice `unique (empresa_id, tipo_dte, ambiente, folio_desde)` con un mensaje que explica el riesgo: reiniciaría el contador y **repetiría folios ya usados** | — |
| CAF-12 | Carga sin ser admin | Negativo | Sesión con rol operador | `guardarCaf()` | Rechazo por RLS (`sii_caf_admin_only`): el CAF es una llave de firma | — |
| CAF-13 🔴 | **CAF vencido** | Negativo | CAF con `<FA>` de hace 8 meses | `guardarCaf()` y luego emitir | **Debería** avisar. Hoy no hay ninguna comprobación de vencimiento → brecha **G3** | El SII rechazaría el documento |
| CAF-14 | El XML del CAF no queda en la base | Seguridad | Cargar un CAF y hacer `select * from sii_caf` | Consulta directa | Solo metadata y `xml_path`. La `RSASK` vive en el bucket privado `certificados`, nunca en una columna | — |

### 2.3 FOL — Asignación de folio

Función `tomar_folio()` de la migración `0051`. Requiere Postgres. **Es el punto
donde un bug no se arregla con un commit: un folio repetido es un documento
duplicado ante el SII.**

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| FOL-01 | Primer folio del rango | Happy | CAF 1–50, `folio_siguiente = 1` | `select tomar_folio(33,'certificacion')` | Devuelve `1`; `folio_siguiente` queda en `2` | — |
| FOL-02 | **Dos emisiones simultáneas** | Borde | Dos conexiones, misma empresa, mismo tipo | Ejecutar `tomar_folio()` en paralelo | Devuelve `1` y `2`. **Nunca el mismo número.** El `UPDATE` toma el lock de fila y la condición `folio_siguiente <= folio_hasta` se re-evalúa ya con el lock tomado | — |
| FOL-03 | Último folio del rango | Borde | `folio_siguiente = 50`, `folio_hasta = 50` | `tomar_folio()` | Devuelve `50`; `folio_siguiente` queda en `51` = `folio_hasta + 1`, la forma de decir «agotado» sin una columna extra | — |
| FOL-04 | **Rango agotado, sin otro rango** | Negativo | `folio_siguiente = 51`, `folio_hasta = 50` | `tomar_folio()` | Excepción: `No quedan folios disponibles para el documento tipo 33 en certificacion. Solicitá un CAF nuevo en el SII y cargalo en el sistema.` | — |
| FOL-05 | Rango agotado **con** un segundo rango cargado | Happy | CAF 1–50 agotado + CAF 51–100 | `tomar_folio()` | Devuelve `51`: el loop salta al rango vivo más antiguo por `order by folio_desde` | — |
| FOL-06 | Rango agotado **entre medio** por otra transacción | Borde | A y B compiten por el folio 50, con un rango 51–100 disponible | Concurrente | Uno recibe `50`, el otro `51`. Ninguno recibe excepción | — |
| FOL-07 | Aislamiento entre empresas | Seguridad | Dos empresas con CAF del mismo rango | `tomar_folio()` en cada una | Cada una consume el suyo. `private.get_empresa()` acota; los contadores no se cruzan | — |
| FOL-08 | Aislamiento entre ambientes | Seguridad | CAF de certificación y de producción cargados | `tomar_folio(33,'produccion')` | Toma del rango de **producción**. Un folio de certificación jamás sale a producción | — |
| FOL-09 | Empresa no resoluble | Negativo | JWT sin empresa | `tomar_folio()` | `No se pudo determinar la empresa de la cuenta.` | — |
| FOL-10 | Tipo de DTE sin CAF | Negativo | Solo hay CAF 33; se pide 34 | `tomar_folio(34,…)` | Excepción de folios agotados nombrando el tipo 34 | — |

### 2.4 API — Contrato y manejo de errores de SimpleAPI

`src/lib/sii/simpleapi.ts`. Anillo A1 con `fetch` interceptado, salvo donde se
indique A2.

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| API-01 | Header de autenticación | Happy | `SIMPLEAPI_KEY = "KEY-DE-PRUEBA-123"` | `generarDte()` con `fetch` espiado | `init.headers.Authorization === "KEY-DE-PRUEBA-123"`, **sin** `Bearer` ni `ApiKey` | 200 |
| API-02 | Forma del multipart de `dte/generar` | Happy | Documento + cert + CAF | Ídem | Campos en orden: `input` (texto JSON con `Documento` y `Certificado`), `files` = `certificado.pfx`, `files2` = `caf.xml` | 200 con `<DTE>` |
| API-03 | Numeración posicional del sobre | Happy | 3 DTE en un sobre | `generarSobre()` | `files` = cert, `files2`/`files3`/`files4` = los DTE en orden | 200 con `<EnvioDTE>` |
| API-04 | El PDF usa otro nombre de campo | Happy | DTE timbrado + logo | `generarPdf()` | `fileEnvio` para el XML y `logo` para la imagen. **No** sigue la numeración de los otros endpoints | 200 `application/pdf` |
| API-05 | Sobre sin documentos no sale a la red | Negativo | `dtes = []` | `generarSobre()` | `El sobre necesita al menos un DTE.` y **cero** llamadas a `fetch` | — no se llama |
| API-06 | **Key inválida (401)** | Negativo | Key incorrecta | Cualquier endpoint | `SimpleAPI rechazó la key (401). Revisá SIMPLEAPI_KEY.` | `401` |
| API-07 | **Falta la key en el entorno** | Negativo | `SIMPLEAPI_KEY` sin definir | Ídem | `Falta SIMPLEAPI_KEY en el entorno del servidor.` sin salir a la red | — no se llama |
| API-08 | **Rate limit (429)** | Negativo | 4 llamadas en el mismo segundo | Ídem | `Demasiadas consultas seguidas a SimpleAPI (máximo 3 por segundo). Probá de nuevo.` | `429` · *«API calls quota exceeded! maximum admitted 3 per 1s»* |
| API-09 | **El turnstile evita el 429 propio** | Borde | Emisión completa (3 llamadas seguidas) | Medir el intervalo entre llamadas | ≥ 354 ms entre llamadas (`1000/3 + 20`). Sin esto las tres entran en el mismo segundo y el 429 llega **después de haber consumido un folio** | 200 en las tres |
| API-10 | **Timeout de conexión** | Negativo | Servidor que no responde | Cada endpoint con su techo: 20 s (`status`), 60 s (`generar`/`pdf`), 90 s (`enviar`) | `SimpleAPI no respondió a tiempo.` — vía `AbortSignal.timeout` y `e.name === "TimeoutError"` | — sin respuesta |
| API-11 | **Red caída / DNS** | Negativo | `fetch` lanza `TypeError` | Ídem | `No se pudo conectar con SimpleAPI.` (distinto del mensaje de timeout) | — |
| API-12 | **Error 500 del servidor** | Negativo | `500` con cuerpo HTML | Ídem | `SimpleAPI (500): <texto recortado a 300 chars>` | `500` |
| API-13 | Error 400 con JSON estructurado | Negativo | `{"responseXml":"…","errores":["a","b"]}` | Ídem | Mensaje que concatena `responseXml`, `glosa`, `mensaje`, `message`, `title` y la lista `errores` | `400` |
| API-14 | Error con cuerpo no-JSON | Negativo | `400` con texto pelado | Ídem | Se muestra el texto recortado, sin reventar el `JSON.parse` | `400` |
| API-15 | **Envío fallido que dice `"ok": true`** | Negativo | `{"ok":true,"trackId":-999999,"estado":"ERROR","glosa":"Certificado vencido"}` con HTTP 400 | `enviarAlSii()` | Se ignora `ok`. Manda el `trackId` negativo → `El SII no aceptó el envío: Certificado vencido` | `400` |
| API-16 | Envío aceptado | Happy | `{"trackId":123456789,"estado":"OK","glosa":""}` | Ídem | `{trackId:123456789, estado:"OK", glosa:""}` | `200` |
| API-17 | `trackId` ausente o cero | Negativo | `{"estado":"OK"}` | Ídem | Se trata como error, no como éxito silencioso | `200` |
| API-18 | Respuesta ilegible al enviar | Negativo | Cuerpo que no parsea como JSON | Ídem | `SimpleAPI devolvió una respuesta ilegible al enviar al SII.` | `200` con basura |
| API-19 | **Producción no se alcanza por accidente** | Seguridad | `ambiente = "produccion"` | `enviarAlSii()` | El `input` lleva `Ambiente: 1`; con `"certificacion"`, `Ambiente: 0` | — |
| API-20 | Decodificación ISO-8859-1 | Borde | XML con `ñ`, `á`, `Ñ` | `generarDte()` | El XML se decodifica en `iso-8859-1` (así lo quiere el SII), sin caracteres rotos | 200 |
| API-21 | Estado de suscripción | Happy | Key válida | `GET /api/sii/estado` | Lista de `{servicio, uso, maximo}`; los nombres se traducen vía `SERVICIOS` | `200` array JSON |
| API-22 | Suscripción devuelve algo que no es lista | Negativo | `{"error":"x"}` | Ídem | `SimpleAPI devolvió una respuesta inesperada.` | `200` con objeto |
| API-23 | `/api/sii/estado` sin sesión | Seguridad | Sin cookie de sesión | `GET /api/sii/estado` | Rechazo de `rechazoSiNoPanel()` antes de tocar la red | — no se llama |
| API-24 | **Contrato vivo completo** | Happy | Fixtures sintéticos | `npm run test:simpleapi` | Pasos 0–3 en ✔ y paso 4 en ✘ con *«Certificado vencido»*. Cualquier otra combinación = el contrato cambió | Real (A2) |

### 2.5 EMI — Orquestación de la emisión

`src/app/(app)/facturas/emitir.ts`. **La acción menos reversible del sistema.**

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| EMI-01 | **Emisión exitosa punta a punta** | Happy | Borrador tipo 33 con 1 viaje, config completa | Confirmar «Emitir» | `estado:"emitida"`, `folio`, `sii_ambiente`, `sii_xml_path`, `sii_track_id`, `sii_enviado_at`, `estado_sii`, `sii_glosa`. XML y PDF en el bucket `adjuntos`. `revalidatePath` de `/facturas` y `/facturas/[id]` | 200 en los 4 endpoints |
| EMI-02 | **Validar antes de gastar folio** | Happy | Borrador con cliente **sin giro** | Confirmar «Emitir» | El ensayo con folio ficticio (`folio: 1`) falla → error de datos y **`tomar_folio()` nunca se llama**. Verificar que `folio_siguiente` no se movió | — no se llama |
| EMI-03 | No es un borrador | Negativo | Factura ya `emitida` | Ídem | `Esta factura está en estado "emitida": solo se emite un borrador.` | — |
| EMI-04 | Ya tiene folio | Negativo | Borrador con `folio = 470` | Ídem | `Esta factura ya tiene el folio 470 asignado.` | — |
| EMI-05 | Tipo no emitible | Negativo | `tipo_dte = 56` | Ídem | Mensaje que aclara que 33 y 34 se emiten y las notas se cargan a mano | — |
| EMI-06 | Sin permiso | Seguridad | Sesión de operador | Ídem | `SIN_PERMISO`. Emitir toca folios y certificado: es de administración | — |
| EMI-07 | Faltan credenciales SII | Negativo | Sin fila en `sii_credenciales` | Ídem | `Faltan las credenciales del SII. Cargá el certificado en Facturas › Configuración.` | — |
| EMI-08 | Falta el RUT del titular | Negativo | `rut_certificado = null` | Ídem | Error que distingue el RUT de la **persona** del de la **empresa** | — |
| EMI-09 | Falta la resolución | Negativo | `numero_resolucion = null` | Ídem | Error indicando que va en la carátula de todo envío | — |
| EMI-10 | Certificado ilegible en Storage | Negativo | `cert_path` roto | Ídem | `No se pudo leer el certificado digital.` **antes** de tomar folio | — |
| EMI-11 | `ENCRYPTION_KEY` cambiada | Negativo | Clave cifrada con otra llave | Ídem | `No se pudo descifrar la clave del certificado. ¿Cambió ENCRYPTION_KEY?` **antes** de tomar folio | — |
| EMI-12 | **Sin folios disponibles** | Negativo | Todos los rangos agotados | Ídem | Error de `tomar_folio()`, con la factura intacta | — |
| EMI-13 | **No se encuentra el CAF del folio** | Negativo | Folio 60 tomado, CAF 1–50 (inconsistencia) | Ídem | `abortar()`: `estado_sii:"error"`, `sii_glosa` grabada, y el mensaje avisa **`El folio N quedó consumido: hay que declararlo al SII como folio no utilizado.`** con `folioPerdido: true` | — |
| EMI-14 | **Falla el timbrado después de tomar folio** | Negativo | `dte/generar` responde 400 | Ídem | Mismo camino `abortar()`, `folioPerdido: true` | `400` |
| EMI-15 | **Falla el sobre** | Negativo | `envio/generar` responde 500 | Ídem | Ídem | `500` |
| EMI-16 | **El XML se guarda ANTES de enviar** | Borde | Envío que falla | Ídem | El archivo en `adjuntos/{empresa}/dte/{ambiente}-{tipo}-{folio}.xml` existe igual. El documento timbrado no se pierde | `400` en enviar |
| EMI-17 | **Falla el envío al SII** | Negativo | `envio/enviar` responde error | Ídem | Se graban `folio`, `fecha_emision`, `sii_ambiente`, `sii_xml_path`, `estado_sii:"error"`, `sii_glosa`. `estado` sigue en `borrador`. Mensaje: «se puede reintentar solo el envío» → **pero ver brecha G2** | `400` |
| EMI-18 | El SII recibe pero falla el `update` | Borde | Envío OK, error de base | Ídem | `El SII recibió el documento (track id N) pero no se pudo actualizar la factura: …`. Devuelve `folio` y `trackId` para reconstruir a mano | `200` |
| EMI-19 | **El PDF falla y no rompe la emisión** | Borde | `impresion/pdf` responde 500 | Ídem | La factura queda `emitida` igual. `sii_pdf_path` en null. Un problema cosmético no debe convertirse en una emisión «fallida» → pero hoy **no queda rastro**, ver **G4** | `500` |
| EMI-20 | **Doble envío desde dos pestañas** | Borde | Misma factura, dos pestañas, «Emitir» casi simultáneo | Ídem | **Riesgo:** ambas leen `folio = null`, ambas pasan la guarda y **queman dos folios** para una sola factura. Verificar el comportamiento real y, si se confirma, bloquear con un `update … where folio is null` condicional | 200 en ambas |
| EMI-21 | Ambiente por defecto | Borde | `sii_credenciales.ambiente = null` | Ídem | Se cae a `certificacion`. Nunca a producción por omisión | `Ambiente: 0` |
| EMI-22 | Fecha de emisión ausente | Borde | `fecha_emision = null` | Ídem | Se usa `hoyChile()`, no la fecha UTC del servidor | — |

### 2.6 SII — Respuesta del SII después del envío

✅ **Desbloqueados (G1 cerrada, 2026-08-19).** La consulta del track id ya
existe: acción `consultarEstadoSii()` en `src/app/(app)/facturas/consultar-sii.ts`,
clasificador puro en `src/lib/sii/estado.ts`, y el panel con el track id y el
botón «Consultar estado» en `sii-panel.tsx`.

Los casos se pueden ejecutar en **A1** hoy mismo (inyectando la respuesta en el
doble de `fetch`) y en **A3** cuando haya certificado. La regla que fija el
clasificador y que estos casos tienen que respetar: **un código que la tabla no
reconoce NUNCA se muestra como aceptado** — cae en `sin_clasificar` y la app
enseña la glosa cruda del SII.

⚠️ La tabla de códigos (`CODIGOS` en `estado.ts`) está escrita desde la
documentación del SII y **no está verificada contra respuestas reales**.
Confirmarla es parte de la certificación: es el objetivo de estos siete casos.

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| SII-01 | Envío recién hecho, todavía en proceso | Happy | Track id de hace 30 s | `consultarEnvio()` | Estado «en proceso» mostrado como tal. **No es un error** y no debe pintarse en rojo | `{estado:"SOK"/"EPR", glosa:"…"}` |
| SII-02 | **Aceptado** | Happy | Track id ya procesado | Ídem | `estado_sii` y `sii_glosa` actualizados; la factura muestra «Aceptado por el SII» | `{estado:"EPR", glosa:"Envio Procesado"}` |
| SII-03 | **Aceptado con reparos** | Negativo | Envío con observaciones | Ídem | Estado propio, visualmente distinto de «aceptado»: el documento vale, pero hay algo que corregir para el próximo. `sii_glosa` con el detalle | `{estado:"RSC"/"RFR", glosa:"…"}` |
| SII-04 | **Rechazado** | Negativo | Envío rechazado | Ídem | Estado de error visible en la lista de facturas. La glosa **se guarda**: sin eso, saber por qué obliga a repetir la consulta | `{estado:"RCH", glosa:"<motivo>"}` |
| SII-05 | Track id inexistente | Negativo | `trackId = 999999999` | Ídem | Error legible, no pantalla en blanco | `400` o glosa de no encontrado |
| SII-06 | Consulta con RUT de empresa equivocado | Negativo | `rutEmpresa` de otra empresa | Ídem | Rechazo del SII propagado como mensaje | `400` |
| SII-07 | Respuesta no-JSON | Borde | XML crudo | Ídem | Cae al camino `{estado:"", glosa:"", xml: crudo}` sin reventar | `200` texto |

---

## 3. Interfaz y usabilidad

### 3.1 Estados asíncronos: lo que ya está resuelto

Emitir son **tres llamadas encadenadas al SII** (timbrar → ensobrar → enviar),
serializadas a ≥354 ms por el turnstile. En el peor caso admitido son 60+60+90 s
de techo. Eso obliga a un tratamiento explícito del tiempo de espera:

| Decisión | Dónde | Por qué |
|---|---|---|
| El diálogo de confirmación **sigue en pantalla mientras corre** | `emitir-boton.tsx` — `{preguntando \|\| pendiente ? …}` | Desaparecer sin decir nada parecería que no pasó nada, y la reacción natural es volver a apretar |
| El botón cambia a «Emitiendo…» y queda `disabled` | `useTransition()` | |
| El texto del diálogo **cambia según el ambiente** | Producción nombra la nota de crédito; certificación aclara «no tiene efecto tributario, pero el folio igual se consume» | Es la última barrera antes de un trámite |
| El botón **no aparece** si falta configuración | `sii.listo` resuelto en `page.tsx` una sola vez, no por fila | Se muestra el motivo concreto en vez de fallar al apretarlo |
| El error distingue gravedad | `text-danger` si `folioPerdido`, `text-warn` si no | Un folio quemado no es lo mismo que un dato faltante |
| Éxito con `role="status"`, error con `role="alert"` | | Lectores de pantalla |
| «Probar conexión» es **manual**, no al montar | `estado-simpleapi.tsx` | El dato solo interesa cuando alguien lo va a mirar |
| Aviso de cuota **desde el 80 %** | Tabla de servicios | El tope es mensual, se reinicia el día 1 y **no se acumula**: quedarse corto a fin de mes es dejar de facturar |

### 3.2 Matriz UI

| ID | Escenario | Tipo | Datos de entrada | Pasos | Resultado esperado en la app | Respuesta esperada de SimpleAPI |
|---|---|---|---|---|---|---|
| UI-01 | Botón deshabilitado por configuración incompleta | Happy | Sin certificado cargado | Abrir `/facturas` | En vez del botón, un aviso con ícono y el motivo exacto: «Falta cargar el certificado digital en Configuración.» | — |
| UI-02 | Cascada de motivos | Happy | Quitar de a uno: cert → RUT titular → resolución → CAF | Ídem, 4 corridas | El motivo cambia y siempre nombra **lo primero que falta**, en ese orden | — |
| UI-03 | Etiqueta según ambiente | Happy | `ambiente = certificacion` / `produccion` | Ídem | «Emitir (certificación)» con botón secundario · «Emitir al SII» con botón primario | — |
| UI-04 | Cancelar el diálogo | Happy | Abrir y cancelar | | No se llama a nada. Cero folios consumidos | — no se llama |
| UI-05 | **Espera larga** | Borde | Respuesta de 45 s | Confirmar «Emitir» | Diálogo visible con `pending`, botón «Emitiendo…», sin posibilidad de doble submit **en esa pestaña** | 200 tardío |
| UI-06 | **Doble submit entre pestañas** | Borde | Dos pestañas, misma factura | Confirmar en ambas | Ver EMI-20. `useTransition` protege una pestaña, no dos | — |
| UI-07 | Mensaje de folio perdido | Negativo | Fallo posterior a `tomar_folio()` | | Texto en rojo (`text-danger`) que **nombra el folio** y dice que hay que declararlo al SII | `400` |
| UI-08 | Mensaje de éxito | Happy | Emisión OK | | «Emitida con folio N. Track id del SII: M.» en verde | `200` |
| UI-09 | «Probar conexión» con key válida | Happy | Key correcta | Botón en Configuración | Tabla de servicios con nombres traducidos y `uso / maximo` en `tabular-nums` | `200` |
| UI-10 | «Probar conexión» con key inválida | Negativo | Key incorrecta | Ídem | Mensaje en rojo con el 401. El botón vuelve a estar disponible | `401` → 502 del route handler |
| UI-11 | «Probar conexión» sin red | Negativo | Backend caído | Ídem | `Error de red al consultar SimpleAPI.` y `cargando` vuelve a `false` (el `finally`) | — |
| UI-12 | Servicio cerca del tope | Borde | `uso/maximo ≥ 0,8` | Ídem | Fila en `text-warn` con peso medio | `200` |
| UI-13 | Suscripción sin servicios | Borde | Array vacío | Ídem | «SimpleAPI no informó servicios.» en vez de tabla vacía | `200` |
| UI-14 | Configuración como modal interceptado | Happy | Click en «Configuración SII» desde `/facturas` | | Se abre como modal sobre la lista (`@modal/(.)facturas/configuracion`); recargar la URL da la página completa | — |
| UI-15 | Lista de folios cargados | Happy | 2 CAF cargados | Abrir Configuración | Rango, tipo, ambiente y folios restantes por CAF | — |
| UI-16 🔴 | **Reintentar el envío** | Negativo | Factura de EMI-17 | Volver a `/facturas` | **No existe.** Ver **G2**: la factura queda con folio y sin camino de salida | — |
| UI-18 | Dos pastillas en la fila | Happy | Factura emitida y rechazada | Mirar `/facturas` | Se ven **las dos**: «Por cobrar» (cobranza) y «Rechazada por el SII» (validez). La fila se tiñe de rojo | — |
| UI-19 | Factura cargada a mano | Happy | Emitida con folio tipeado, sin track id | Abrir la fila | «Cargada a mano: esta factura no pasó por el SII.» Sin pastilla de SII en la fila ni botón de consultar | — |
| UI-20 | Consultar sin ser admin | Seguridad | Sesión de operador | `consultarEstadoSii()` | `SIN_PERMISO`, antes de tocar el certificado | — no se llama |
| UI-21 | Consultar una factura sin track id | Negativo | Factura manual | Ídem | «Esta factura no tiene track id: nunca se envió al SII desde el sistema.» | — no se llama |
| UI-22 | **El folio ya no viene pre-cargado** | Happy | SII configurado, factura nueva | Abrir «Nueva factura» | Campo Folio **vacío**, con la ayuda «Lo asigna el SII al emitir». El botón «Emitir» aparece al guardar | — |
| UI-23 | La sugerencia sobrevive sin SII | Happy | SII sin configurar, factura nueva | Ídem | El folio se propone como antes (último + 1): el camino manual no cambió | — |
| UI-17 | **Ver el estado del SII** | Happy | Factura con `sii_track_id` | Abrir la fila | Panel con ambiente, track id seleccionable, fecha de envío, pastilla de estado, glosa del SII y botón «Consultar estado» | `200` de `consulta/envio` |

### 3.3 Reintento: qué debería existir

Hoy no hay ninguno. El diseño que corresponde, dado que el folio ya está
consumido y el DTE timbrado ya está en Storage:

1. **Reintento manual del envío, no de la emisión.** La factura de EMI-17 tiene
   `folio`, `sii_xml_path` y `estado_sii = 'error'`. Un botón «Reintentar envío»
   debe leer el XML de `adjuntos`, rearmar el sobre y llamar solo a
   `enviarAlSii()`. **Nunca** volver a llamar a `tomar_folio()`.
2. **Idempotencia por folio.** La condición de entrada es `folio is not null and
   estado_sii = 'error' and estado = 'borrador'`. Cualquier otra combinación no
   ofrece el botón.
3. **Sin reintento automático en el envío.** Un reintento ciego contra
   `envio/enviar` puede producir un envío duplicado del mismo documento. El
   único reintento automático razonable es sobre `consultarEnvio()`, que es de
   solo lectura.
4. **Backoff que respete el turnstile.** Cualquier reintento automático tiene que
   pasar por `enFila()` o se choca con el límite de 3 por segundo.

---

## 4. Brechas detectadas

Encontradas al mapear la matriz contra el código. No son casos de prueba: son
condiciones que impiden ejecutar casos, o riesgos que ningún caso actual cubre.

| ID | Estado | Brecha | Evidencia | Impacto | Bloquea |
|---|---|---|---|---|---|
| **G1** | ✅ **Cerrada** 19-08 | **El track id se guardaba y nunca se consultaba.** `consultarEnvio()` no tenía llamadores | Antes: `grep -rn consultarEnvio src/` devolvía solo la definición | La app no podía saber si el SII aceptó, reparó o rechazó | — |
| **G8** | ✅ **Cerrada** 19-08 | **El folio sugerido apagaba la emisión electrónica.** El formulario pre-cargaba «último + 1», y como «Emitir» solo aparece en un borrador **sin** folio, la factura nacía con número y el botón no salía nunca | `factura-form.tsx` vs. la condición de montaje en `factura-accordion.tsx` | El sistema electrónico quedaba sin usarse **por defecto**, sin ningún aviso. Además «último + 1» es un asignador paralelo sin lock ni conocimiento del rango del CAF | UI-22, UI-23 |
| **G2** | 🔴 Abierta | **No hay reintento de envío.** El mensaje de error promete «se puede reintentar solo el envío», pero no existe el código | `emitir.ts:269` vs. la guarda `if (factura.folio)` en `emitir.ts` | Tras un fallo de envío la factura queda **atascada**: folio consumido, DTE timbrado en Storage, `estado` en `borrador`, y re-emitir devuelve «ya tiene el folio N asignado» | UI-16 |
| **G3** | 🔴 Abierta | **No se comprueba el vencimiento del CAF.** `fecha_autorizacion` se guarda pero no se compara con nada | `0051_folios_caf.sql` (solo CHECK de rangos); `src/lib/caf.ts` valida formato, no vigencia | Se puede emitir con un CAF vencido y descubrirlo con el folio ya quemado | CAF-13 |
| **G4** | 🔴 Abierta | **El fallo del PDF es silencioso.** Si `generarPdf()` falla no se graba glosa ni bandera | `emitir.ts` — el `if (!("error" in pdf))` no tiene rama `else` | Factura emitida sin representación impresa y nada lo indica. Se descubre cuando el cliente la pide | EMI-19 |
| **G5** | 🔴 Abierta | **El folio quemado no queda registrado de forma estructurada.** El camino `abortar()` graba el número **dentro del texto** de `sii_glosa` y no setea la columna `folio` | `emitir.ts` — `abortar()` | Declarar folios no utilizados al SII exige leer glosas a mano. No hay consulta posible | Trámite de folios no utilizados |
| **G6** | 🔴 Abierta | **No existe validación de RUT en ningún punto del sistema** — ni dígito verificador ni formato | `grep` de `digito\|verificador\|validarRut\|dv` en `src/` no devuelve nada; `clientes/actions.ts:27` guarda el string tal cual; `documento.ts` solo verifica que no esté vacío | Un RUT mal tipeado en la ficha del cliente llega al SII y se descubre como **rechazo con el folio ya consumido**. Es el error de datos más probable de todos | DOC-17, DOC-18 |
| **G7** | 🔴 Abierta | **Posible doble consumo de folio por doble submit.** Dos pestañas pasan la guarda `if (factura.folio)` antes de que ninguna escriba | `emitir.ts` — lectura y `tomar_folio()` no son atómicas entre sí | Dos folios quemados para una factura | EMI-20, UI-06 |

**Orden de atención de lo que queda, por costo de descubrirlo tarde:**
G6 → G2 → G7 → G3 → G5 → G4.

### 4.1 Lo que trajo cerrar G1: dos ejes, no uno

El estado que ve el usuario pasó de una pastilla a dos, y es a propósito.

`facturaEstadoDerivado()` (cobranza) **no se tocó**: sigue siendo
`estado × fecha_pago` y los informes financieros dan exactamente lo mismo que
antes. Al lado aparece una segunda pastilla, `clasificarEstadoSii()`, que
responde otra pregunta: *¿esto vale ante el SII?*

Se mantuvieron separadas porque la combinación que hay que poder ver es
justamente la peligrosa —**«Por cobrar» + «Rechazada por el SII»**—, y una sola
etiqueta la escondería. La fila además se tiñe de rojo cuando el SII marcó algo.

**Queda una decisión de negocio, no técnica:** hoy una factura rechazada por el
SII **sigue contando como «por cobrar»** en `cobranza-server.ts` y en el informe
financiero. Se puede argumentar en los dos sentidos —el documento no vale, pero
la deuda del cliente existe igual— y cambiarlo movería cifras que el dueño ya
mira. Se deja explícito en vez de decidirlo por él.

---

## 5. Checklist de aceptación para el pase a producción

### 5.1 Antes de tocar nada (gates verdes)

- [ ] `npm run lint` en verde
- [ ] `npm run typecheck` en verde
- [ ] `npm test` en verde, incluidos los casos DOC/CAF/API nuevos de esta matriz
- [ ] `npm run build` en verde
- [ ] `npm run test:esquema` sin diferencias (**correr después de cada migración**)
- [ ] `npm run test:datos` sin problemas nuevos
- [ ] `npm run test:simpleapi`: pasos 0–3 ✔ y paso 4 ✘ con *«Certificado vencido»*. Cualquier otra combinación significa que el contrato de SimpleAPI cambió
- [ ] Migraciones `0051` y `0052` aplicadas en la base real (se aplican por SQL Editor: no hay CLI ni `psql` en este proyecto)

### 5.2 Brechas cerradas

- [x] **G1** — seguimiento del track id implementado y visible en la factura
- [x] **G8** — el folio ya no se pre-carga cuando el SII está configurado
- [ ] **G6** — validación de RUT (formato + dígito verificador) en la ficha de cliente, en Configuración de empresa y en `construirDocumento()`
- [ ] **G2** — «Reintentar envío» implementado según §3.3
- [ ] **G7** — consumo de folio protegido contra doble submit
- [ ] **G3** — aviso de CAF vencido o por vencer
- [ ] **G5** — registro estructurado de folios no utilizados
- [ ] **G4** — el fallo del PDF deja rastro visible

### 5.3 Datos maestros cargados

- [ ] **Empresa** → comuna y **al menos un** código de actividad económica
- [ ] **Empresa** → razón social, giro, dirección y RUT completos
- [ ] **Todos los clientes que se vayan a facturar** → RUT válido, giro y comuna. Es el dato que más va a faltar: las fichas cargadas antes de la migración `0052` no lo tienen
- [ ] Auditoría previa: `select count(*) from clientes where giro is null or comuna is null or rut is null`

### 5.4 Trámites ante el SII (ninguno es de código)

- [ ] Certificado digital adquirido (≈ $12.000–20.000/año — e-certchile, Acepta, Firma.cl, Chilefirmas), **a nombre de una persona**: el representante legal o quien lleve la contabilidad
- [ ] Postulación como emisor electrónico en sii.cl
- [ ] CAF de **certificación** descargado y cargado en el sistema
- [ ] **Set de pruebas del SII aprobado** (no vence)
- [ ] N° y fecha de resolución de certificación anotados desde `maullin.sii.cl/cvc_cgi/dte/ad_empresa1`

### 5.5 Verificación en certificación, con credenciales reales

- [ ] EMI-01 completo contra `Ambiente: 0` → track id real
- [ ] SII-02 → el SII responde «aceptado» al consultar ese track id
- [ ] SII-04 forzado a propósito (por ejemplo con un monto inconsistente) → el rechazo se ve en la app, no solo en el SII
- [ ] **Confirmar la tabla `CODIGOS` de `src/lib/sii/estado.ts` contra las respuestas reales.** Anotar cada código que devuelva el SII y comprobar que ninguno cae en `sin_clasificar` por estar mal escrito — es el objetivo principal de los casos SII-01…07
- [ ] FOL-02 ejecutado contra la base real: dos emisiones simultáneas, dos folios distintos
- [ ] El PDF generado se abre, muestra el timbre y los datos son los correctos
- [ ] El XML guardado en `adjuntos` abre y valida contra el esquema del SII

### 5.6 Cambio de credenciales a producción

- [ ] Certificado de producción subido al bucket privado `certificados`
- [ ] Clave cifrada con la `ENCRYPTION_KEY` **de producción** (si difiere de la de desarrollo, EMI-11 falla en silencio hasta que alguien emite)
- [ ] `rut_certificado` = RUT de la **persona** titular, verificado como distinto del RUT de la empresa
- [ ] N° y fecha de resolución de **producción** cargados (ya no 0), desde `palena.sii.cl/cvc_cgi/dte/ad_empresa1`
- [ ] CAF de **producción** cargado; verificar que `sii_caf` tiene filas con `ambiente = 'produccion'`
- [ ] `sii_credenciales.ambiente` cambiado a `produccion` — **decisión explícita y última**
- [ ] Verificar que el botón dice «Emitir al SII» y el diálogo nombra la nota de crédito (UI-03)
- [ ] `SIMPLEAPI_KEY` de producción en el entorno del servidor; recordar que en Vercel las variables exigen **redeploy**, no basta con agregarlas
- [ ] Cuota del plan revisada: 500 emisiones/mes, tope mensual **no acumulable**

### 5.7 Primera emisión real

- [ ] Se emite **una sola** factura, la de menor monto disponible
- [ ] Track id anotado a mano antes de cerrar la pantalla
- [ ] Estado consultado hasta «aceptado»
- [ ] PDF descargado y revisado línea por línea contra la factura del sistema
- [ ] El cliente confirma que recibió un documento válido
- [ ] Recién entonces se habilita la emisión al resto del equipo

### 5.8 Plan de vuelta atrás

- [ ] Está claro que **un documento aceptado no se borra**: se anula con una nota de crédito, y las notas (56/61) **no están implementadas** — hoy se cargan a mano
- [ ] Está claro que **un folio consumido no vuelve**: hay que declararlo al SII como folio no utilizado
- [ ] Volver a `certificacion` es un `update` de una columna, y no deshace nada de lo ya emitido
