# Manual: dejar el sistema listo para facturar electrónicamente

Para el administrador de Transportes Pucarani o su contador.

**El certificado digital no se le entrega a nadie.** Es la firma electrónica de
una persona: quien lo tiene puede firmar documentos tributarios a su nombre. Lo
carga usted mismo en el sistema, desde su computador, y queda guardado cifrado.
Nadie del equipo técnico lo ve ni lo necesita.

Este manual es la consecuencia de eso: cada paso está escrito para hacerse sin
ayuda, y cada error que el sistema puede mostrarle está explicado al final.

---

## Antes de empezar: qué tiene que tener a mano

| | Qué es | De dónde sale |
|---|---|---|
| Certificado digital | Un archivo `.pfx` o `.p12` | Lo compró en e-certchile, Acepta, Firma.cl o Chilefirmas |
| Su contraseña | La que puso al descargarlo | Usted la eligió |
| RUT del titular | El RUT de **la persona** dueña de la firma | Es quien la compró: el representante legal o el contador |
| Códigos de actividad económica | Números de 6 dígitos | Paso 1 |
| Resolución del SII | Un número y una fecha | Paso 3 |
| Archivo CAF | Un `.xml` con los folios | Paso 4 |

Todo el proceso se hace en **certificación**, que es el ambiente de pruebas del
SII. Ahí los documentos no tienen efecto tributario. El sistema arranca en ese
ambiente y no se mueve solo.

---

## Paso 1 · Los datos de la empresa

Entre a **Configuración** y complete RUT, razón social, dirección, comuna y
giro. Ya están cargados el RUT `77.242.040-4`, la comuna Arica y el giro.

Falta un dato: los **códigos de actividad económica**.

### Cómo sacarlos (5 minutos, sin clave)

1. Entre a **sii.cl**
2. **Servicios online** → **Situación tributaria** → **Consultar situación
   tributaria de terceros**
3. Escriba el RUT `77242040-4`

Esa página muestra las actividades económicas de la empresa con su **código de
6 dígitos**. Cópielos y péguelos en Configuración, separados por coma.

> **Importante**: tienen que ser los que el SII tiene declarados para el RUT, no
> los que mejor describan lo que hace la empresa. Un código correcto pero no
> declarado hace que el SII repare la factura.

### Aproveche y revise la razón social

Esa misma página muestra la razón social registrada. **Compárela con la que
tiene el sistema.** Hoy dice «Cristian Enrique Carreño Rosas», que es el nombre
de una persona, y el RUT 77.242.040-4 es de una empresa. Si el SII tiene
registrada otra —por ejemplo «Transportes Pucarani SpA»— corríjala en
Configuración: ese texto va impreso en cada factura y tiene que coincidir.

---

## Paso 2 · Cargar el certificado

**Facturas** → botón **Configuración SII** → tarjeta *Certificado digital*.

1. **RUT de la empresa**: `77.242.040-4`
2. **RUT del titular del certificado**: el de **la persona** dueña de la firma.
   Casi nunca es el mismo que el de la empresa, y confundirlos hace que el SII
   rechace el envío con un mensaje que no explica nada.
3. **Archivo**: el `.pfx` o `.p12`
4. **Contraseña**: la del archivo

Guarde. El certificado va a un almacenamiento privado y la contraseña se guarda
cifrada; ni siquiera aparece en la pantalla después.

Los campos de resolución déjelos vacíos por ahora: se completan en el paso 3.

---

## Paso 3 · Postular como emisor electrónico

Este trámite es del SII y se hace una sola vez.

1. Entre a **sii.cl** con el certificado (le va a pedir elegirlo en el
   navegador)
2. **Factura electrónica** → **Sistema de facturación gratuito del SII** →
   postular como emisor electrónico
3. Cuando el SII lo autorice, va a tener un **número de resolución** y una
   **fecha de resolución**

En certificación el número es **0**.

Los dos datos están en:
`https://maullin.sii.cl/cvc_cgi/dte/ad_empresa1`

Vuelva a **Configuración SII** y cárguelos.

---

## Paso 4 · Descargar y cargar los folios (CAF)

Los folios son los números de factura que el SII le autoriza. Vienen en un
archivo.

1. En sii.cl: **Factura electrónica** → **Timbraje electrónico** → solicitar
   folios
2. Elija **Factura electrónica (33)** y pida un rango chico para empezar —con
   10 o 20 alcanza para certificar
3. Descargue el archivo `.xml`
4. **Pregunte ahí mismo cuánto tiempo valen esos folios.** El sistema todavía no
   avisa cuando un CAF vence, y necesitamos ese dato para agregarlo
5. En el sistema: **Configuración SII** → tarjeta *Folios autorizados (CAF)* →
   suba el archivo

No hay que escribir el rango: el sistema lo lee del archivo. Escribirlo a mano
es justo lo que produce facturas con folios fuera de rango.

Si además va a emitir facturas **exentas**, repita para el tipo **34**.

---

## Paso 5 · Emitir la primera factura de prueba

Cuando los siete componentes de la pantalla de configuración estén en verde, el
botón de emitir aparece en las facturas.

1. **Facturas** → cree una factura con un cliente que tenga **RUT, giro y
   comuna** completos (sin esos tres el sistema no deja emitir)
2. Haga clic en la fila para desplegarla
3. Botón **Emitir (certificación)**
4. Confirme

Va a tardar unos segundos: son tres llamadas seguidas al SII.

Si sale bien verá: **«Emitida con folio N. Track id del SII: M.»**

**Anote ese track id.** Es el número de seguimiento del envío.

---

## Paso 6 · Ver qué contestó el SII

El track id **no significa que la factura esté aceptada**. Significa que el SII
recibió el sobre. El SII lo procesa después y recién ahí decide.

Vuelva a abrir la fila de la factura. En el panel del SII, botón **Consultar
estado**. Puede tardar un rato en resolverse; mientras tanto dice «en proceso»,
y eso no es un error.

Los tres resultados posibles:

| Lo que dice | Qué significa | Qué hacer |
|---|---|---|
| **Aceptada por el SII** | La factura vale | Nada |
| **Aceptada con reparos** | Vale, pero hay algo mal | Leer la glosa y corregirlo para la próxima |
| **Rechazada por el SII** | No vale | Leer la glosa, corregir y emitir de nuevo. El folio usado se declara como no utilizado |

---

## Paso 7 · El set de pruebas del SII

Cuando el SII se lo pida, va a mandarle un conjunto de casos para emitir. Se
hacen con este mismo procedimiento. Al aprobarlo, queda habilitado para pedir la
resolución de **producción**.

**Guarde evidencia de cada caso**: fecha, folio, track id, el estado final y la
glosa. Hay una planilla lista para llenar en `certificacion-acta.md`.

---

## Si algo sale mal

Los mensajes que el sistema puede mostrarle, y qué son:

| Mensaje | Qué pasó | Qué hacer |
|---|---|---|
| «El archivo no es un certificado PKCS#12 válido» | Subió otro archivo | Busque el `.pfx` o `.p12`, no el `.cer` ni el `.pem` |
| «Ese archivo está en formato PEM (texto)» | Es el certificado público, sin la llave | Necesita el que tiene contraseña |
| «El RUT … tiene el dígito verificador equivocado» | Un número mal tipeado | El mensaje dice cuál era el correcto |
| «Ese CAF es del RUT X y la empresa está configurada como Y» | El CAF es de otra empresa | Descargue el de su RUT |
| «Ese rango ya estaba cargado» | Subió el mismo CAF dos veces | No pasa nada: se rechazó para no reiniciar los folios |
| «Falta el giro del cliente» | La ficha del cliente está incompleta | Complete giro y comuna en **Clientes** |
| «Los montos no cuadran con los viajes asociados» | La factura y sus viajes no suman lo mismo | Revise qué viajes incluyó |
| «SimpleAPI no respondió a tiempo» | Se cayó la conexión | Reintente |
| «El folio N quedó consumido» | Falló después de tomar el folio | Ese número hay que declararlo al SII como **folio no utilizado** |
| «El documento quedó timbrado con el folio N» | Solo falló el envío | Botón **Reintentar envío**: manda el mismo documento **sin gastar otro folio** |
| «Demasiadas consultas seguidas» | Más de 3 por segundo | Espere unos segundos |
| «Rechazada por el SII» | El SII no lo aceptó | La glosa dice por qué |

**Un folio consumido no vuelve.** Si un folio se quema, se declara al SII como
no utilizado. No es grave, pero hay que hacerlo.

---

## Lo que NO hay que hacer

- **No cambie el ambiente a producción** hasta aprobar el set de pruebas. En
  producción cada factura es un documento tributario real y anularla cuesta una
  nota de crédito.
- **No escriba el folio a mano** en una factura que vaya a emitir
  electrónicamente. Cuando el SII está configurado, el campo viene vacío a
  propósito: el número lo entrega el CAF. Si lo escribe, el botón de emitir no
  aparece y la factura queda como carga manual.
- **No suba el mismo CAF dos veces** esperando "recargar" folios. Cada rango se
  usa una sola vez; para más folios se pide un CAF nuevo al SII.
- **No comparta el archivo del certificado ni su contraseña** por correo ni por
  WhatsApp, tampoco con el equipo técnico. El sistema no lo necesita.

---

## Cuándo sí conviene avisarle al equipo técnico

- Si el SII contesta algo que el sistema muestra como **«Respuesta del SII»** con
  un código sin traducir: significa que apareció una respuesta que todavía no
  está en la tabla, y hay que agregarla.
- Si consigue el dato de **cuánto valen los folios** del CAF: falta esa
  validación.
- Si la razón social registrada en el SII **no coincide** con la del sistema.
- Si una factura queda trabada en **«Emitiendo…»** más de unos minutos.
