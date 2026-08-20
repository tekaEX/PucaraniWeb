# Decisiones y bloqueos — SimpleAPI y certificación SII

Registro de las decisiones tomadas al implementar la feature y de lo que quedó
frenado esperando algo que no está en el repositorio.

Última actualización: 2026-08-20 (después de aplicar la 0053).

---

## D1 · Credenciales separadas por ambiente (T004)

**Decisión**: una credencial por `(empresa_id, ambiente)`, como recomienda el
plan. Migración escrita en `supabase/migrations/0053_sii_por_ambiente.sql`.

**Por qué y no la alternativa**: con una sola credencial por empresa, cargar el
certificado de producción obliga a reemplazar el de certificación —y con él la
resolución y el RUT del titular—. Se pierde la posibilidad de volver a
certificación a reproducir un problema, que es justo lo que hace falta el día
que el SII rechaza un documento real.

**Lo que NO se renombró**: el plan sugiere `rut_empresa`. Se deja `rut`. La
0052 ya documentó en un `comment on column` que esa columna es el RUT de la
empresa y `rut_certificado` el de la persona; renombrarla obligaría a tocar seis
archivos para ganar claridad que el comentario ya da, y la constitución pide
mantener los cambios acotados.

**Rutas de Storage** (T006, ya implementado):

```text
certificados/<empresa_id>/<ambiente>/certificado-<sufijo>.pfx
certificados/<empresa_id>/<ambiente>/caf/<tipo>-<desde>-<hasta>.xml
```

El ambiente va en la **carpeta** y no en el nombre del archivo: así un listado
del bucket muestra de un vistazo qué es de certificación y qué de producción.

Los archivos ya cargados no se mueven. `cert_path` guarda la ruta completa, así
que un certificado subido antes se sigue leyendo donde está; solo las cargas
nuevas usan la convención nueva. Moverlos a mano rompería las filas que apuntan
al lugar viejo.

### ✅ 0053 aplicada y verificada (2026-08-20)

Comprobado contra la base real con un control negativo: una columna inventada
devuelve HTTP 400 «does not exist», y `estado_validacion`, `validacion_glosa` y
`validated_at` devuelven 200. Las columnas existen.

### D1.1 · Lo que la 0053 rompía en silencio, y hubo que arreglar

Permitir dos filas por empresa convirtió **cada `.maybeSingle()` sobre
`sii_credenciales` en una bomba de tiempo**: con una sola credencial funciona, y
el día que se cargue la de producción la consulta falla entera — no devuelve la
otra fila, devuelve error. Había cinco, en `emitir.ts`, `consultar-sii.ts`,
`config-sii.ts`, `configuracion/contenido.tsx` y `configuracion/actions.ts`.

Todas pasaron a leer una **lista filtrada por ambiente**. Dos pruebas lo fijan
para que no vuelva.

Hoy no se notaba porque `sii_credenciales` está vacía: el problema habría
aparecido el día de preparar producción, que es el peor momento posible.

### D1.2 · Quién decide el ambiente activo — migración 0054

Con dos credenciales posibles surge una pregunta que antes no existía: si están
las dos, ¿con cuál se emite?

No se puede deducir. «La de producción si existe» convertiría el acto de cargar
un certificado en el acto de empezar a emitir documentos tributarios reales, sin
que nadie lo decida — exactamente lo que US3 prohíbe. Tampoco puede salir de la
propia credencial: con dos filas, ninguna puede decir cuál manda.

Por eso el ambiente activo es un dato de la **empresa**:
`empresa.sii_ambiente_activo`, por defecto `certificacion`.

`0054_ambiente_activo.sql` es **aditiva y sin riesgo** (una columna con valor por
defecto). **Aplicada y verificada el 2026-08-20**; las dos empresas quedaron en
`certificacion`. La app igual la lee en una consulta aparte cuyo fallo se tolera
y cae a certificación, para que el modo degradado siga siendo el seguro.

---

## D2 · Validación del certificado: hasta dónde llega (T009, T010)

**Implementado (T009)** — `src/lib/sii/certificado.ts`, función pura y probada:

- archivo no vacío y tamaño máximo (512 KB; un `.pfx` real pesa entre 2 y 10 KB);
- extensión `.pfx` o `.p12`;
- MIME contra una lista permisiva **que no es la validación real** — el navegador
  manda `application/x-pkcs12`, `application/octet-stream` o vacío según el
  sistema operativo, y rechazar por MIME dejaría afuera archivos legítimos;
- **la comprobación que decide**: los bytes tienen que empezar con una SEQUENCE
  DER (`0x30`) y contener el OID `pkcs7-data` (1.2.840.113549.1.7.1), presente
  en todo PKCS#12. Un PDF, un PNG o un PEM renombrado no lo tienen.

Además se valida **antes de subir**: un archivo que no es un PKCS#12 no llega
nunca al bucket.

### 🚧 BLOQUEO: no se comprueba que la contraseña abra el certificado (T010)

Node no expone un parser de PKCS#12 (`node:crypto` no lo trae), así que
verificar la contraseña y leer el RUT del titular exige una de estas tres, y
ninguna se puede tomar sin decisión del dueño:

| Opción | Costo | Problema |
|---|---|---|
| Dependencia `node-forge` | ~1 MB, JS puro | La constitución pide no sumar librerías «sin necesidad»; hay que justificarla |
| OpenSSL por `child_process` | 0 | **No existe en Vercel.** Andaría en local y fallaría en producción, que es el peor de los dos |
| Usar SimpleAPI como oráculo | 0 | Un `dte/generar` con contraseña mala devuelve error de certificado. Necesita red y un CAF cargado, y no sirve como validación al momento de subir el archivo |

**Recomendación**: la tercera, pero como *verificación posterior* y no como
requisito de la carga. La migración 0053 agrega `estado_validacion` con ese
diseño: arranca en `pendiente` y solo pasa a `valido` cuando una emisión real lo
usa con éxito. Marcar `valido` porque el archivo se pudo subir sería exactamente
la afirmación falsa que esta feature existe para evitar.

**Mientras tanto** la contraseña equivocada se detecta al emitir, con el mensaje
de SimpleAPI. No se pierde folio: el certificado se descifra y se usa antes de
`tomar_folio()` — lo fija la prueba *«el certificado se descifra antes de tomar
el folio»*.

---

## D3 · CAF: qué se valida y qué no (T015–T019)

**Implementado**: tipo soportado, rango, rango invertido, fecha, archivo
corrupto, RUT del emisor contra el de la empresa, e idempotencia — el índice
único `(empresa_id, tipo_dte, ambiente, folio_desde)` impide que recargar el
mismo CAF reinicie `folio_siguiente`.

**Nuevo en esta tanda**: si el `insert` falla por algo que no sea el duplicado,
el XML se borra del bucket. Antes quedaba ahí un CAF con su llave privada que
ninguna fila reclamaba. En el caso del duplicado **no** se borra, a propósito: la
ruta se deriva del rango, así que es el mismo archivo del CAF bueno y borrarlo lo
dejaría sin llave.

### 🚧 BLOQUEO: vencimiento del CAF (T016)

El plan pide rechazarlo «según la regla confirmada con el SII», y esa regla no
está confirmada en ningún documento del repositorio. Implementarla adivinando
tiene las dos fallas caras: si el plazo es más corto que el real se bloquean
folios que sirven; si es más largo, se emite con un CAF vencido y el SII rechaza
con el folio ya consumido.

**Qué hace falta**: confirmar el plazo de vigencia para los tipos 33 y 34 en el
ambiente correspondiente. Se pregunta en el mismo trámite en que se descarga el
CAF.

**Qué está listo para cuando se confirme**: `fecha_autorizacion` ya se guarda en
`sii_caf`; solo falta la comparación y el aviso.

---

## D4 · RUT: validado con dígito verificador y guardado canónico (T017)

`src/lib/rut.ts`, puro y probado. Se valida en cinco puntos: ficha de cliente,
datos de la empresa, RUT de la empresa en credenciales SII, RUT del titular del
certificado, y emisor/receptor al construir el DTE.

**Por qué importaba**: no existía ninguna validación de RUT en el proyecto. Un
dígito equivocado viajaba al SII y volvía como rechazo **con el folio ya
consumido**. Es el error de datos más probable y el más caro de descubrir tarde.

**Se guarda canónico** (`76192083-9`, sin puntos) para que el mismo RUT no quede
escrito de dos formas y una comparación falle sin motivo.

**`mismoRut()` NO valida el dígito**, a propósito: su trabajo es decir si dos
textos son el mismo RUT, y eso tiene que funcionar también con un RUT mal
escrito. Si exigiera un DV correcto, un RUT inválido en los dos lados se
reportaría como «son distintos», que manda a buscar el problema donde no está.

**Efecto secundario**: los RUT de ejemplo de tres formularios eran inválidos
(`76.123.456-7`, `12.345.678-9`). Se corrigieron — mostrar como ejemplo algo que
el validador rechaza es una trampa.

---

## D5 · Cerrojo contra doble emisión (T031)

Un `UPDATE` condicionado a `estado = 'borrador' AND folio IS NULL AND
(estado_sii IS NULL OR estado_sii <> 'emitiendo')`, tomado **antes** de
`tomar_folio()`.

**Por qué hacía falta**: la guarda que había miraba un valor leído al principio
de la acción, y entre esa lectura y la toma del folio pasan varias llamadas. Dos
pestañas leían las dos `folio = null`, las dos pasaban, y se quemaban **dos
folios para una sola factura**.

**Por qué funciona**: Postgres serializa las dos escrituras. Cuando la segunda
despierta del lock re-evalúa el `WHERE` contra la fila ya modificada, y como el
`UPDATE` cambió `estado_sii`, deja de calzar. **Sin una columna que cambie las
dos pasarían** — un `UPDATE` que solo lee no sirve de cerrojo.

**El detalle que casi lo rompe**: `.neq("estado_sii", "emitiendo")` en PostgREST
excluye los NULL, porque `NULL <> 'emitiendo'` es NULL y no verdadero. Eso
habría dejado afuera justamente a los borradores nuevos —los únicos que se
emiten— y el botón no habría funcionado nunca. Va como
`.or("estado_sii.is.null,estado_sii.neq.emitiendo")`, y hay una prueba que
prohíbe volver al `.neq()` suelto.

**`emitiendo` es un estado visible**, no una bandera aparte: si un proceso se
cae a mitad de camino, el cerrojo queda a la vista en la pantalla en vez de
trabar la factura en silencio.

---

## D6 · Estado comercial y estado tributario, separados (T026)

`facturaEstadoDerivado()` (cobranza: `estado × fecha_pago`) **no se tocó**, así
que los informes financieros dan lo mismo que antes. Al lado va una segunda
pastilla, `clasificarEstadoSii()`, que responde otra pregunta: *¿esto vale ante
el SII?*

Se mantienen separadas porque la combinación que hay que poder ver es la
peligrosa —**«Por cobrar» + «Rechazada por el SII»**— y una sola etiqueta la
escondería.

**La tabla de códigos del SII no está verificada** y la clasificación es
deliberadamente cobarde: un código desconocido cae en `sin_clasificar` y se
muestra la glosa cruda. Nunca inventa un «aceptado».

### Decisión pendiente del dueño, no técnica

Hoy una factura **rechazada por el SII sigue contando como «por cobrar»** en
`cobranza-server.ts` y en el informe financiero. Se puede argumentar en los dos
sentidos —el documento no vale, pero la deuda del cliente existe igual— y
cambiarlo movería cifras que el dueño ya mira. Se deja explícito en vez de
decidirlo por él.

---

## Bloqueos que no dependen del código

| Tarea | Qué falta | Quién |
|---|---|---|
| T001 | Certificado digital, contraseña, RUT del titular, CAF y resolución | Cliente |
| T002 | Respaldo de `sii_credenciales`, `sii_caf` y `facturas` antes de la 0053 | Dueño (SQL Editor) |
| T003 | Confirmar `SIMPLEAPI_KEY`, `ENCRYPTION_KEY` y buckets privados en el entorno objetivo | Dueño |
| T005 | Aplicar la migración 0053 | Dueño (SQL Editor) |
| T008 | Probar aislamiento entre empresas: exige dos cuentas reales, la RLS no se prueba con la service key | Dueño |
| T016 | Regla de vigencia del CAF | Cliente / SII |
| T040 | `npm run test:simpleapi` — **no se ejecutó**: exige una `SIMPLEAPI_KEY` autorizada para pruebas y la instrucción es no correrlo sin ella | Dueño |
| T041–T042 | Set de certificación A3 y su acta | Cliente + dueño |
| T043–T046 | Producción | Después de A3 |


---

## Hallazgo fuera del alcance de esta feature

### `0041_retirar_encomiendas.sql` no hace lo que su nombre dice

Es **byte a byte el mismo archivo que `0040_sin_rol_contador.sql`** (mismo MD5:
`0f50498380d70f29585bd136114200cf`). No contiene ni un `drop table`.

Correrlo no borra nada: vuelve a ejecutar los `drop policy` de la 0040, que son
idempotentes, y termina sin error. Por eso las seis tablas `encomienda_*` siguen
en la base con datos del sistema anterior, y `npm run test:esquema` sigue
marcando esas seis fallas.

`pruebas/README.md` afirma que esa migración «se lleva las tablas, 11 funciones y
un job de pg_cron». **Eso es falso**: el archivo nunca se escribió, solo se
duplicó el anterior con otro nombre.

No se corrigió acá por dos razones: está fuera del alcance de la feature SII, y
escribirla es una operación destructiva sobre datos reales del sistema de
reparto que se fue a Ares — es una decisión del dueño, no una tarea de
implementación.

**Hecho el 2026-08-20**: se corrigió `pruebas/README.md`, que repetía la promesa
falsa, y se retiró el archivo duplicado. El hueco en el 0041 es intencional.

### Qué hay realmente en esas tablas

| Tabla | Filas |
|---|---|
| `encomienda_actividad` | 776 |
| `encomienda_pagos` | 22 |
| `encomienda_jornadas` | 22 |
| `encomienda_reglas_pago` | 1 |
| `encomienda_periodos_facturacion` | 1 |
| `encomienda_ingresos_reales` | 0 |

La aplicación **no consulta ninguna**: `grep encomienda src/` solo devuelve
comentarios. Son peso muerto para este sistema, pero son historia operativa real
de otro.

### Antes de escribir la migración que las borra

No se puede escribir a ciegas: el README hablaba de «11 funciones y un job de
pg_cron» y esa afirmación viene del mismo texto que resultó falso. Hay que
inventariar primero, en el SQL Editor:

```sql
-- Funciones que tocan encomiendas
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private') and p.proname ilike '%encomienda%'
 order by 1;

-- Jobs de pg_cron (si la extensión está instalada)
select jobid, schedule, command, active from cron.job order by jobid;

-- Vistas, triggers y claves foráneas que dependan de esas tablas
select c.relname, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname ilike '%encomienda%'
 order by c.relkind, c.relname;
```

Y antes de borrar: exportar las 822 filas, y **confirmar que el proyecto Ares
tiene esa historia**. Si Ares no la tiene, borrarla acá la pierde para siempre.

Un job de pg_cron activo contra tablas que nadie usa sí conviene apagarlo aunque
las tablas se conserven: `select cron.unschedule(<jobid>);`. Eso es reversible;
el `drop table` no.


---

## Datos de la empresa cargados (2026-08-20)

| Campo | Valor |
|---|---|
| RUT | `77242040-4` — dígito verificador comprobado |
| Comuna | Arica |
| Giro | Transporte de carga por carretera, logística y servicios de apoyo portuario (75 caracteres) |
| Ambiente activo | certificación |

Se escribió **solo en la empresa real**; la DEMO quedó intacta. El RUT se guardó
canónico (sin puntos), que es como llega en el `<RE>` del CAF.

### 🚧 BLOQUEO: faltan los códigos de actividad económica

`empresa.actividad_economica` sigue vacío, y **sin al menos uno no se puede
emitir**: `construirDocumento()` corta antes de tomar folio.

No se cargaron adivinando. El `<Acteco>` del DTE no es «el código que describe lo
que hace la empresa», es **el que la empresa tiene declarado ante el SII**.
Poner uno correcto en abstracto pero no declarado hace que el SII repare el
documento, y el reparo llega con el folio ya consumido.

**De dónde salen**: sii.cl → Mi SII → «Actualización de información» muestra las
actividades declaradas de la empresa, con su código de seis dígitos. También se
ven en la consulta de situación tributaria.

`492300` (transporte de carga por carretera) es el candidato más probable para el
giro declarado, pero **hay que confirmarlo contra el registro real** antes de
cargarlo: puede haber más de uno, y el orden importa poco pero la exactitud sí.

### ⚠️ Revisar: la razón social es el nombre de una persona

`empresa.razon_social` dice **«Cristian Enrique Carreño Rosas»**, igual que
`representante`. Ese valor viaja como `<RznSoc>` del emisor en cada DTE y tiene
que coincidir con lo que el SII tiene registrado para el RUT `77.242.040-4`.

Un RUT del rango 77.xxx.xxx es una persona jurídica (SpA, Ltda., EIRL), no una
persona natural, así que lo esperable es una razón social del tipo «Transportes
Pucarani SpA». Si el SII tiene registrada esa y el DTE manda el nombre del
representante, el documento se repara o se rechaza.

Es un campo de un solo dato y se corrige en Configuración › Empresa, pero hay
que mirarlo antes de la primera emisión.

### ⚠️ Verificar en certificación: largo máximo del giro

`documento.ts` corta el nombre de cada ítem en 80 caracteres pero **no acota el
giro** ni del emisor ni del receptor, y el esquema del SII sí les pone un tope
(el del receptor es más corto que el del emisor). El giro cargado tiene 75
caracteres, así que probablemente entre, pero el de los clientes hay que
mirarlo cuando se carguen.

No se truncó a ciegas: recortar un giro cambia un dato con valor legal, y el
número exacto es de los que hay que confirmar contra el esquema durante la
certificación, igual que la tabla de códigos de respuesta.
