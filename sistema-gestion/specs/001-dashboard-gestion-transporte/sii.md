# Integración con el SII — estado real y qué falta

Este archivo existe para que nadie descubra por accidente en qué estado está la
emisión electrónica: dice qué hay escrito, qué está verificado contra la API
real, y qué es lo único que sigue faltando.

Última revisión: 2026-08-18.

---

## Lo único que falta

**El certificado digital.** No hay ningún otro bloqueo.

No existe forma de saltearlo ni de conseguir uno de prueba: SimpleAPI no
entrega certificados de prueba y el SII tampoco. El ambiente de certificación
(maullin) no es un sandbox anónimo — para entrar hay que autenticarse con un
certificado real, postular como emisor electrónico y bajar de ahí el primer CAF.

Una firma electrónica simple cuesta del orden de **$12.000 a $20.000 al año**
(e-certchile, Acepta, Firma.cl, Chilefirmas) y va a nombre de una persona: el
representante legal o quien lleve la contabilidad.

Después del certificado quedan dos trámites, ninguno de código:

1. Postular en sii.cl como emisor electrónico y bajar el CAF de certificación.
2. Correr el set de pruebas del SII (no vence) y recién ahí pasar a producción.

## Qué se hizo sin esperar el certificado

La cadena completa de emisión está escrita y **verificada contra la API real**,
con un certificado autofirmado y un CAF sintético. Corre con:

```bash
npm run test:simpleapi
```

Eso genera los datos de prueba si faltan y ejecuta, con el mismo código que usa
la app, los cinco pasos:

| Paso | Endpoint | Estado |
|---|---|---|
| Conexión y cuota | `GET /api/v1/Suscripcion/status` | ✔ funciona |
| Timbrar y firmar | `POST /api/v1/dte/generar` | ✔ devuelve el DTE con TED y firma |
| Sobre de envío | `POST /api/v1/envio/generar` | ✔ devuelve el EnvioDTE |
| Representación impresa | `POST /api/v1/impresion/pdf/carta/v2` | ✔ devuelve el PDF |
| Envío al SII | `POST /api/v1/envio/enviar` | ✘ *"Certificado vencido"* — **esperado** |

Que falle en el último paso, y solo ahí, es el resultado que confirma que todo
lo anterior está bien. Es el único punto donde el certificado tiene que ser real.

Dos datos útiles, medidos: los primeros cuatro pasos **no consumen cuota** (el
`uso` quedó en 0 después de varias corridas), así que desarrollar contra la API
real es gratis. El plan actual admite 500 emisiones al mes.

## Cómo está armado

| Pieza | Dónde | Qué hace |
|---|---|---|
| Cliente de SimpleAPI | `src/lib/sii/simpleapi.ts` | Las cinco llamadas, con el contrato verificado |
| Armado del documento | `src/lib/sii/documento.ts` | Función pura: factura + viajes → JSON del DTE |
| Orquestación | `src/app/(app)/facturas/emitir.ts` | Toma el folio, timbra, ensobra, envía y guarda |
| Botón | `src/app/(app)/facturas/emitir-boton.tsx` | Solo en borradores; avisa si falta configuración |
| Folios | migración `0051` | `tomar_folio()` bajo lock: nunca dos veces el mismo |
| Datos del SII | migración `0052` | RUT del titular, resolución, giro y comuna |
| Lectura del CAF | `src/lib/caf.ts` | Lee el rango del archivo, no se tipea a mano |
| Cifrado de la clave | `src/lib/crypto.ts` | AES-256-GCM, se descifra solo en memoria |

### Detalles del contrato que cuesta descubrir

Están en la cabecera de `simpleapi.ts`, pero los que más tiempo hacen perder:

- El `input` va como campo de **texto dentro de un multipart**, no como JSON en
  el body ni en el query string. Los archivos son posicionales: `files`,
  `files2`, `files3`… y **el orden importa** (certificado primero).
- La key va en `Authorization` **sin prefijo**. Con `Bearer` responde 401.
- Un error puede llegar con HTTP 400 y un JSON que dice `"ok": true`. Ese campo
  no sirve: lo que manda es `estado` y el `trackId` (`-999999` es el centinela).
- `Certificado.Rut` es el RUT de **la persona** titular de la firma, no el de la
  empresa. En el sobre viaja como `<RutEnvia>`, separado de `<RutEmisor>`.
- Máximo 3 llamadas por segundo. Emitir son tres seguidas, así que el cliente
  las serializa solo.

### El orden importa: primero validar, después pedir el folio

`emitirFactura()` arma el documento **dos veces**: la primera con un folio de
mentira, solo para que salten los errores de datos, y recién si eso pasa pide el
folio real. Un folio consumido no vuelve: si la emisión falla después de
tomarlo, hay que declararlo al SII como folio no utilizado. La acción avisa
explícitamente cuando eso pasó, en vez de dejarlo enterrado.

## Antes de la primera emisión real

Datos que hay que cargar y que hoy la app no tenía dónde guardar (migración
`0052`):

- **Empresa** (Configuración): comuna y códigos de actividad económica.
- **Clientes**: giro y comuna. Son obligatorios en toda factura electrónica y
  van a faltar en la mayoría de las fichas ya cargadas.
- **Facturas › Configuración**: RUT del titular del certificado, y el número y
  fecha de la resolución del SII (en certificación el número es 0; los dos datos
  salen de `maullin.sii.cl/cvc_cgi/dte/ad_empresa1`).

La pantalla de configuración enumera lo que falta, y el botón de emitir se
muestra deshabilitado con el motivo concreto en vez de fallar al apretarlo.

## Datos de prueba

`npm run fixtures` genera en `pruebas/fixtures/salida/` (ignorada por git):

- `certificado-prueba.pfx` — autofirmado, clave `prueba123`
- `CAF_33_1_50.xml` — CAF sintético con un par RSA real adentro

Sirven para correr la cadena entera. **No** sirven para emitir: la `<FRMA>` del
CAF la firma el SII con su propia llave, y el certificado no lo emite una
autoridad que el SII reconozca.

## Lo que sigue fuera de alcance

- **Notas de crédito y débito** (56/61). Necesitan referencias al documento que
  corrigen; hoy se cargan a mano.
- **Boletas electrónicas.** Otro sobre (`EnvioBoleta`) y otro servidor.
- **Libro de ventas / propuesta F29.**
- **Sincronización de compras (RCV).** Sigue como estaba: escrita en
  `src/app/api/combustible/sync/route.ts`, apuntando al host viejo
  (`servicios.simpleapi.cl`) y **sin verificar**. Ahora que el contrato de
  multipart está confirmado, arreglarla es corto — el `input` y los archivos van
  igual que acá—, pero le sigue faltando la lista real de RUT de distribuidores
  y, sobre todo, el RCV de compras no trae el detalle de las líneas, así que la
  patente no se puede deducir por esa vía.
