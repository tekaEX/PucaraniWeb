# Plan de actuación: SimpleAPI y certificación SII

**Feature**: `002-simpleapi-certificacion`  
**Fecha**: 2026-08-19  
**Repositorio**: `sistema-gestion`

## Estado actual

Ya existe:

- Cliente SimpleAPI en `src/lib/sii/simpleapi.ts`.
- Construcción pura del DTE en `src/lib/sii/documento.ts`.
- Lectura de CAF en `src/lib/caf.ts`.
- Orquestación de emisión en `src/app/(app)/facturas/emitir.ts`.
- Carga de certificado y CAF en `src/app/(app)/facturas/configuracion/actions.ts`.
- Bucket privado `certificados` y políticas RLS para administrador.
- Folios atómicos mediante `tomar_folio()` en migración `0051`.
- Datos de resolución, titular del certificado y trazabilidad en migración `0052`.
- Pruebas A1 y contrato vivo A2 con fixtures sintéticos.
- Componentes iniciales para mostrar el estado SII en la lista de facturas y consultar el estado por track id.

## Brechas que deben resolverse antes de usar certificados del cliente

1. **Separación por ambiente**: `sii_credenciales` actualmente mantiene una sola credencial por empresa y el certificado usa una ruta fija. Debe definirse una estructura que permita mantener certificación y producción separadas, con certificado, CAF y resolución vinculados al mismo ambiente.
2. **Validación del `.pfx/.p12`**: la acción valida presencia y extensión desde el formulario, pero debe validar en servidor tamaño, tipo permitido, contraseña y correspondencia con el RUT titular antes de marcar la credencial como lista.
3. **Carga atómica**: el flujo actual sube el archivo antes de completar la escritura de metadata. Debe evitar archivos huérfanos y manejar reemplazos sin perder la credencial anterior si falla la nueva.
4. **CAF vencido**: la carga debe rechazar un CAF fuera de vigencia o dejarlo claramente no utilizable, según la regla confirmada para el ambiente.
5. **Validación de RUT**: el emisor, receptor y titular deben validarse con dígito verificador antes de tomar folio.
6. **Cambio de ambiente**: producción debe requerir una acción administrativa explícita, confirmación y comprobación de que existen credenciales/CAF/resolución de producción.
7. **Prueba A3**: falta ejecutar el set de certificación oficial con certificado real y CAF real emitidos por el SII.
8. **Experiencia de envío**: la historia US5 requiere convertir la emisión y el seguimiento SII en un flujo claro desde el dashboard, con estados visibles, acción principal inequívoca y detalle de la respuesta recibida.

## Decisión estructural recomendada

Separar credenciales por empresa y ambiente:

```text
sii_credenciales
- empresa_id
- ambiente: certificacion | produccion
- rut_empresa
- rut_certificado
- cert_path
- cert_password_enc
- numero_resolucion
- fecha_resolucion
- estado_validacion
- validated_at
- updated_at

Storage privado certificados/
- <empresa_id>/certificacion/certificado.pfx
- <empresa_id>/produccion/certificado.pfx
- <empresa_id>/certificacion/caf/<tipo>-<desde>-<hasta>.xml
- <empresa_id>/produccion/caf/<tipo>-<desde>-<hasta>.xml
```

La clave única recomendada es `(empresa_id, ambiente)`. `sii_caf` ya contiene ambiente, pero sus rutas deben seguir la misma convención y su carga debe ser idempotente.

Si se decide conservar una sola credencial activa por empresa, debe documentarse como restricción explícita y prohibirse cualquier cambio de ambiente automático; no es la opción recomendada porque impide preparar producción sin reemplazar certificación.

## Fases de actuación

### Fase 0: Preparación y respaldo

- Confirmar con el cliente que dispone de certificado digital válido y CAF de certificación.
- Confirmar titular del certificado, RUT de la empresa, resolución y ambiente.
- Respaldar metadata de `sii_credenciales`, `sii_caf` y facturas antes de migrar.
- Confirmar que `SIMPLEAPI_KEY` y `ENCRYPTION_KEY` existen solo en el entorno servidor.
- Confirmar que los buckets `certificados` y `adjuntos` son privados en Supabase.

**Salida**: checklist de datos recibidos, responsables y ambiente seleccionado.

### Fase 1: Corregir estructura de datos y Storage

- Crear migración para credenciales por ambiente o documentar formalmente la alternativa elegida.
- Agregar restricciones únicas y relaciones necesarias.
- Normalizar rutas de Storage por empresa y ambiente.
- Ajustar políticas RLS para que solo admin de la empresa pueda operar sobre certificados/CAF.
- Añadir limpieza compensatoria si una subida termina sin metadata o si una escritura posterior falla.
- No borrar la credencial anterior hasta que la nueva haya superado validaciones.

**Salida**: migración aplicada, políticas verificadas y prueba de aislamiento entre empresas/ambientes.

### Fase 2: Validar archivos antes de persistir

#### Certificado

- Validar que el valor sea un `File`, no un string.
- Validar tamaño máximo configurable y extensión `.pfx`/`.p12`.
- Validar MIME sin confiar únicamente en el navegador.
- Leer el certificado con una estrategia compatible con Node/Next o validar su usabilidad mediante una operación controlada de certificación; no marcarlo como válido solo porque se pudo subir.
- Comprobar que la contraseña permite abrirlo y que el titular coincide con `rut_certificado`.
- Cifrar la contraseña antes de guardar.
- Guardar estado `pendiente`, `válido` o `inválido` y una razón segura para mostrar al administrador, sin exponer material criptográfico.

#### CAF

- Parsear XML con `parsearCaf()`.
- Validar tipo soportado, rango, fecha y RUT.
- Rechazar duplicados antes de subir o eliminar de forma segura el archivo si el insert es rechazado.
- Verificar que el CAF pertenece al mismo ambiente que la credencial activa.
- Rechazar CAF vencido según la regla confirmada con el SII.
- Registrar solo metadata en Postgres y mantener el XML privado.

**Salida**: carga de archivos con errores claros, sin secretos en logs y sin registros parciales.

### Fase 3: Configuración administrativa segura

- Mostrar en Configuración SII el ambiente activo y advertencia visual.
- Permitir preparar certificación y producción sin mezclarlas.
- Mostrar estado de cada componente: key SimpleAPI, certificado, titular, CAF, resolución y conexión.
- Separar “conexión válida” de “listo para emitir”.
- Añadir confirmación reforzada al seleccionar producción.
- Bloquear emisión si certificado, CAF, resolución o titular no corresponden al mismo ambiente.

**Salida**: el administrador puede saber exactamente qué falta y qué está listo.

### Fase 3.1: Flujo de envío y seguimiento desde el dashboard

- Diseñar la máquina de estados visible de una factura: borrador, lista para emitir, enviando, enviada/en proceso, aceptada, aceptada con reparos, rechazada, error y sin clasificar.
- Mantener separados el estado comercial de la factura y el estado técnico/tributario del SII; una factura no debe aparecer como pagada solo porque fue aceptada por el SII.
- Hacer que la acción principal sea simple y segura: desde la fila o detalle de una factura, el administrador debe poder iniciar el envío, ver progreso y recibir un resultado concreto.
- Mostrar en la lista un badge o indicador de estado SII, ambiente, folio y track id cuando existan, sin obligar a abrir cada fila para detectar rechazos.
- Añadir un panel de detalle que muestre qué se envió, cuándo, a qué ambiente, track id, glosa, estado recibido y enlaces al XML/PDF almacenados.
- Mostrar mensajes accionables para rechazo, reparos, timeout, error de red, cuota agotada y respuesta ilegible.
- Permitir consultar nuevamente el estado de un envío pendiente por track id, sin volver a consumir folio ni reenviar automáticamente el documento.
- Deshabilitar o proteger acciones mientras una emisión está en curso y evitar doble envío desde dos pestañas.
- Mantener la accesibilidad del flujo: estados con texto además de color, `aria-live` para resultados y foco visible en errores.

**Salida**: un administrador puede enviar una factura desde el dashboard y entender el resultado del SII sin revisar logs ni datos técnicos internos.

### Fase 4: Validación técnica A1 y A2

- Añadir pruebas de extensión/tamaño/MIME y archivo corrupto.
- Añadir pruebas de password incorrecta y RUT titular inconsistente.
- Añadir pruebas de CAF vencido, duplicado, otro RUT y ambiente incorrecto.
- Añadir pruebas de aislamiento RLS por empresa y rol.
- Añadir pruebas de rollback de Storage/metadata.
- Añadir pruebas de la máquina de estados SII y de la separación entre estado comercial y estado tributario.
- Añadir pruebas de que el resultado visible incluye track id, ambiente, glosa y fecha cuando la API los entrega.
- Añadir pruebas de doble envío, consulta repetida y reintento seguro sin tomar un folio nuevo.
- Añadir pruebas de accesibilidad mínima para estados: no depender solo de color y comunicar resultados con texto.
- Mantener pruebas del contrato multipart, Authorization sin Bearer, rate limit, timeouts y track id.
- Ejecutar `npm test`, `npm run lint` y `npm run build`.
- Ejecutar `npm run test:simpleapi` con key de certificación y fixtures; aprobar si los pasos 0–3 funcionan y el paso 4 falla únicamente por identidad no reconocida cuando corresponda.

**Salida**: evidencia A1/A2 archivada en la carpeta de la feature.

### Fase 5: Certificación oficial A3 con el cliente

1. Cargar certificado real de certificación.
2. Cargar CAF real de certificación para DTE 33 y, si aplica, 34.
3. Cargar titular, empresa, actividad, comuna y resolución de certificación.
4. Ejecutar una factura de prueba con datos válidos.
5. Enviar a SimpleAPI y registrar track id.
6. Consultar el estado del envío hasta respuesta final.
7. Ejecutar todos los casos que el SII solicite: aceptado, rechazado y aceptado con reparos si el set los contempla.
8. Guardar evidencia: fecha, ambiente, folio, track id, respuesta, XML y PDF.
9. Confirmar que los folios consumidos quedaron trazados y que los no utilizados se declaran según procedimiento SII.

**Salida**: acta de certificación aprobada por el cliente y evidencia reproducible.

### Fase 6: Habilitación de producción

- Recibir certificado, CAF y resolución de producción separados de certificación.
- Cargar y validar cada credencial en el ambiente producción.
- Verificar que ninguna factura de certificación use folios o credenciales de producción.
- Requerir confirmación administrativa explícita.
- Ejecutar una emisión controlada de producción con datos reales y conservar XML, PDF y track id.
- Activar monitoreo de errores, cuota y estados SII.
- Documentar rollback operativo: detener emisión, no borrar folios, identificar documentos afectados y contactar al responsable tributario.

**Salida**: producción habilitada con acta y checklist firmado.

## Criterios de aprobación

- No existe mezcla entre empresa, ambiente, certificado y CAF.
- Un usuario operador no puede leer ni modificar credenciales o CAF.
- Un archivo inválido no queda almacenado como credencial utilizable.
- Un CAF duplicado no reinicia folios.
- La carga fallida no deja secretos ni registros huérfanos.
- Certificación se puede ejecutar sin tocar producción.
- Un administrador puede iniciar el envío desde el dashboard y distinguir aceptación, reparos, rechazo, pendiente y error.
- Un envío pendiente puede consultarse sin duplicar la emisión ni consumir otro folio.
- Producción solo se habilita tras evidencia A3 aprobada.
- `npm test`, `npm run lint` y `npm run build` pasan.

## Comandos de verificación

```powershell
Push-Location sistema-gestion
npm test
npm run lint
npm run build
npm run fixtures
npm run test:simpleapi
Pop-Location
```

`npm run test:simpleapi` requiere `SIMPLEAPI_KEY` y no debe ejecutarse en CI ni con credenciales de producción sin una aprobación explícita.

## Artefactos de evidencia

- `research.md`: decisiones técnicas y límites de SimpleAPI.
- `plan-pruebas-dte.md`: matriz A1/A2/A3.
- `sii.md`: estado real y prerequisitos.
- `quickstart.md`: escenarios funcionales.
- `certificacion-acta.md`: resultado de la prueba oficial con el cliente, a crear al completar A3.
