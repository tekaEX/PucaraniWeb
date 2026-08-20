# Especificación: Implementación y certificación de SimpleAPI

## Objetivo
Completar y validar la integración con SimpleAPI para que un administrador de la empresa pueda cargar de forma segura el certificado digital y los CAF entregados por el SII, comprobar que pertenecen a la empresa y emitir DTE en certificación antes de habilitar producción.

## Contexto
La cadena SimpleAPI ya está implementada para facturas 33 y 34, generación de DTE, sobre `EnvioDTE`, PDF y envío. La API real ya fue probada con fixtures sintéticos. Lo pendiente es el flujo controlado con credenciales y CAF reales del cliente, la certificación ante el SII y las garantías de seguridad/estructura para no mezclar certificación con producción.

## Alcance
- Carga y reemplazo seguro del certificado digital `.pfx`/`.p12`.
- Carga y validación de CAF XML.
- Separación explícita de credenciales y folios por ambiente.
- Verificación de configuración antes de emitir.
- Pruebas A1 aisladas, A2 contra SimpleAPI y A3 de certificación SII.
- Manual de carga para el administrador del cliente y evidencia de cada paso.
- Preparación del cambio explícito de certificación a producción.

## Fuera de alcance
- Notas de crédito/débito, boletas, libro de ventas y RCV.
- Automatización de trámites del SII que requieren intervención del representante legal.
- Habilitar producción sin completar el set de pruebas del SII.

## Historias de usuario

### US1: Cargar credenciales de forma segura
Como administrador, quiero subir el certificado y su clave para que el sistema pueda firmar DTE sin exponer la clave ni el archivo públicamente.

Criterios de aceptación:
- Solo `admin` puede cargar, reemplazar o consultar credenciales SII.
- El servidor valida archivo no vacío, extensión/tipo permitido y tamaño máximo antes de guardar.
- El certificado se almacena solo en el bucket privado `certificados`, bajo la empresa y el ambiente correctos.
- La clave se cifra con `ENCRYPTION_KEY` y nunca se devuelve ni se registra en texto plano.
- Un fallo posterior no deja una credencial parcialmente actualizada ni un archivo huérfano sin referencia.
- El sistema informa claramente si el archivo está cargado, si la clave falta o si la configuración no permite emitir.

### US2: Cargar CAF válido y no repetir folios
Como administrador, quiero cargar un CAF descargado desde el SII para que la aplicación use únicamente folios autorizados.

Criterios de aceptación:
- El servidor lee tipo, RUT emisor, rango y fecha desde el XML; no acepta esos datos tipeados manualmente.
- El RUT del CAF debe coincidir con el RUT de la empresa.
- Solo se aceptan tipos de DTE soportados por el producto.
- Un rango invertido, CAF duplicado, CAF vencido o archivo corrupto se rechaza antes de consumirlo.
- La metadata se registra en `sii_caf` y el XML queda en almacenamiento privado.
- La carga es idempotente y no reinicia `folio_siguiente`.

### US3: Emitir primero en certificación
Como administrador, quiero probar una factura real de certificación antes de cambiar a producción.

Criterios de aceptación:
- Certificado, CAF y resolución pertenecen al mismo ambiente.
- El ambiente inicial y predeterminado es certificación.
- Una emisión de certificación queda identificada permanentemente como tal.
- La aplicación no puede cambiar a producción sin una acción administrativa explícita y una confirmación visible.
- Los errores de SimpleAPI y del SII quedan registrados con track id, estado y glosa.

### US4: Validar el proceso con evidencia
Como responsable técnico, quiero una matriz de pruebas reproducible para saber qué está validado y qué requiere el certificado real.

Criterios de aceptación:
- `npm test` cubre validaciones puras y de seguridad.
- `npm run test:simpleapi` valida el contrato vivo A2 con key y fixtures.
- El set A3 documenta la prueba oficial de certificación y su evidencia.
- No se declara producción lista mientras exista un caso A3 pendiente.

### US5: Facilidad de envio de facturas
Como administrador de la empresa de transportes quiero que sea simple poder enviar facturas a traves de una herramienta de dashboard

Criterios de aceptacion:
- Frontend pulido para los estados de factura
- Seguimiento del documento enviado al sii, como se envio, como me lo envio el sii, porque lo rechazaron.


## Reglas de negocio y seguridad
- Los folios se obtienen únicamente mediante `tomar_folio()`.
- Un folio consumido después de comenzar la emisión no se reutiliza.
- Certificados, claves cifradas y CAF son secretos/credenciales y deben permanecer privados.
- La separación por empresa y ambiente debe estar garantizada por base de datos, RLS y rutas de Storage.
- La key de SimpleAPI vive solo en variables de entorno del servidor.
- La app no debe afirmar que una factura fue aceptada por el SII si solo tiene una respuesta ambigua o sin track id válido.
