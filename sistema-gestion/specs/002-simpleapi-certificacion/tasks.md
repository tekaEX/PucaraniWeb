# Tareas: SimpleAPI y certificación SII

> **Estado al 2026-08-20**, con las migraciones `0053` y `0054` **aplicadas y
> verificadas** contra la base real (control negativo incluido). Las dos empresas
> quedaron en ambiente `certificacion`.
>
> **Estado de las marcas.** `[X]` verificado con `npm test` / `lint` / `typecheck`
> / `build` en verde. `[~]` parcial. `[ ]` sin empezar o bloqueado por algo que
> no está en el repositorio. Los bloqueos y las decisiones estructurales están
> en [`decisiones.md`](decisiones.md); no se marcó ninguna tarea que dependa de
> credenciales reales, de la base de producción o de una respuesta del cliente.

> **Restricción confirmada el 2026-08-20**: el cliente tiene el certificado
> digital y **no lo entrega** — es su firma electrónica y hace bien. Por eso
> A3 (T041) y la habilitación de producción no las ejecuta el equipo técnico:
> las hace el cliente siguiendo [`manual-carga-sii.md`](manual-carga-sii.md), y
> el resultado se registra en [`certificacion-acta.md`](certificacion-acta.md).
> El sistema tiene que ser autoservicio y explicarse solo.

## Fase 0: Preparación

- [X] T001 Confirmar con el cliente certificado digital, contraseña, RUT titular, RUT empresa, CAF, resolución y ambiente de certificación. — **confirmado: el cliente tiene el certificado y no lo entrega**, que es la postura correcta para una firma electrónica. La tarea se cumple con el autoservicio: [`manual-carga-sii.md`](manual-carga-sii.md) es el procedimiento para que lo cargue él mismo.
- [X] T002 Respaldar metadata de `sii_credenciales`, `sii_caf` y facturas antes de cambios. — `npm run respaldo:sii` (`pruebas/respaldo-sii.mjs`). Ejecutado: 0 credenciales, 0 CAF, 2 empresas, 12 facturas con folio. **No respalda la clave cifrada del certificado**: un respaldo con material de firma es una copia del problema.
- [X] T003 [P] Verificar `SIMPLEAPI_KEY`, `ENCRYPTION_KEY`, buckets privados y políticas RLS en el entorno objetivo. — verificado por el mismo script: la key responde (10/500 usados), `ENCRYPTION_KEY` **cifra y descifra** (no solo mide 32 bytes), y `certificados` y `adjuntos` son privados. RLS confirmada por `test:esquema`.

## Fase 1: Estructura por ambiente

- [X] T004 Decidir y documentar el modelo de credenciales por ambiente en `sii_credenciales`. — decisión D1 en `decisiones.md`: una credencial por `(empresa_id, ambiente)`.
- [X] T005 Crear migración para separar certificación/producción y agregar unicidad por empresa/ambiente. — `0053_sii_por_ambiente.sql` **aplicada y verificada** contra la base real (2026-08-20). Se sumó `0054_ambiente_activo.sql` (aditiva) para decidir cuál de los dos ambientes emite: sin ella, cargar el certificado de producción habría sido, por sí solo, empezar a emitir documentos reales.
- [X] T006 [P] Normalizar rutas `certificados/<empresa>/<ambiente>/...` para `.pfx` y CAF.
- [X] T007 [P] Ajustar RLS de tablas y Storage para aislamiento por empresa y rol admin. — la 0053 re-creó `sii_cred_admin_only` y está aplicada. `npm run test:esquema` confirma que ninguna de las 14 tablas se lee sin sesión.
- [ ] T008 Probar que una empresa no puede leer o escribir credenciales/CAF de otra empresa. — 🚧 exige entrar con dos cuentas reales: `test:esquema` y `test:datos` usan la service key, que se salta RLS.

## Fase 2: Carga segura de certificado

- [X] T009 Validar en servidor archivo no vacío, extensión, MIME y tamaño máximo.
- [~] T010 Validar que la contraseña abre el `.pfx/.p12` y que el titular corresponde al RUT configurado. — **decisión del dueño (2026-08-20): se deja diferida**, sin sumar `node-forge`. Se valida que el archivo SEA un PKCS#12; la contraseña se comprueba al primer uso real y el fallo ya es seguro (no cuesta folio). Si aparece un problema al cargar, se resuelve entonces.
- [X] T011 Cifrar contraseña con `ENCRYPTION_KEY` y evitar que aparezca en respuestas, logs o HTML.
- [X] T012 Implementar reemplazo atómico: conservar certificado anterior si el nuevo no se valida.
- [X] T013 Implementar limpieza compensatoria cuando Storage sube pero Postgres falla.
- [~] T014 [P] Añadir pruebas de certificado corrupto, password incorrecta, RUT inconsistente y archivo sobredimensionado. — tres de cuatro (`19-certificado`, `18-rut`, `15-documento-dte`). La de contraseña incorrecta queda fuera por la decisión de T010.

## Fase 3: Carga segura de CAF

- [X] T015 Rechazar CAF corrupto, tipo no soportado, rango invertido y fecha inválida.
- [ ] T016 Añadir validación de CAF vencido según regla confirmada con el SII. — 🚧 falta la regla de vigencia confirmada con el SII. Adivinarla falla caro en los dos sentidos (D3).
- [X] T017 Validar RUT del CAF contra la empresa usando dígito verificador y normalización.
- [X] T018 Validar que CAF y certificado pertenecen al mismo ambiente. — credenciales, CAF y folios se leen y se escriben SIEMPRE filtrados por ambiente, en los cinco módulos. Dos pruebas lo fijan.
- [X] T019 Hacer la carga idempotente y evitar que un duplicado reinicie `folio_siguiente`.
- [X] T020 [P] Añadir pruebas de CAF duplicado, otro RUT, ambiente incorrecto y rollback de Storage. — los cuatro. El duplicado se prueba por su manejo del 23505 y por que **no borre el XML** (es el mismo archivo del CAF bueno); la ejecución contra Postgres queda como caso CAF-11 del anillo A3.

## Fase 4: Configuración y emisión

- [X] T021 Mostrar estado individual de key, certificado, titular, CAF, resolución y ambiente en Configuración SII. — `configSii()` devuelve los 7 componentes con su estado y detalle; la pantalla los lista con ✓/✗ y texto (no solo color). De la key se informa si está puesta, nunca su valor.
- [X] T022 Bloquear emisión si los componentes no corresponden al mismo ambiente. — `emitirFactura()` toma el ambiente de `configSii()` y exige credencial, resolución y CAF de ESE ambiente; si falta, el mensaje nombra cuál.
- [X] T023 Añadir confirmación administrativa explícita para producción. — tarjeta *Ambiente* con tres barreras: solo admin, hay que **escribir PRODUCCION** (un botón se aprieta sin leer), y no se activa sin certificado, resolución y CAF **de producción** cargados. Volver a certificación no pide nada: es la dirección segura.
- [X] T024 Verificar que folios se obtienen únicamente por `tomar_folio()` y que los fallos posteriores dejan trazabilidad. — cierra la brecha G5: migración `0055` crea `sii_folios_no_utilizados` y `abortar()` inserta ahí el folio quemado con motivo y factura. El trámite ante el SII pasa de leer glosas de a una a ser una consulta.
- [X] T025 Integrar consulta de estado por track id y persistir estado/glosa finales.

## Fase 4.1: US5 - Envío y seguimiento desde el dashboard

**Objetivo**: permitir que un administrador envíe una factura desde el dashboard y entienda claramente la respuesta del SII.

- [X] T026 [P] Definir el modelo de estados SII visible y su traducción en `src/lib/sii/estado.ts`, separándolo del estado comercial de la factura.
- [X] T027 [P] Implementar o completar el estado de envío, consulta y resultado en `src/app/(app)/facturas/emitir.ts` y `src/app/(app)/facturas/consultar-sii.ts`.
- [X] T028 [P] Mostrar badge de estado SII, ambiente, folio y track id en `src/app/(app)/facturas/factura-accordion.tsx`.
- [X] T029 Crear el panel de detalle del envío en `src/app/(app)/facturas/sii-panel.tsx` con fecha, ambiente, track id, glosa, XML y PDF. — completo. XML y PDF se abren con **URL firmada**, no con enlace directo: están en un bucket privado y un href fijo sería una dirección pública a la factura de un cliente.
- [X] T030 Integrar una acción clara de enviar/reintentar/consultar desde la fila o detalle de factura, sin pedir al usuario datos técnicos de SimpleAPI. — las tres acciones existen. `reenviar.ts` cierra la brecha G2: manda el DTE ya timbrado **sin tomar folio**, y solo aparece en el callejón que lo necesita. 8 pruebas lo fijan.
- [X] T031 Proteger la acción contra doble envío desde dos pestañas y deshabilitar controles mientras una operación está pendiente.
- [X] T032 Mostrar mensajes accionables para rechazo, reparos, timeout, error de red, cuota excedida y respuesta ilegible. — la cuota mensual dejó de confundirse con el 429: el 429 se arregla esperando segundos, la cuota **no se arregla esperando**. Tres pruebas nuevas lo fijan.
- [X] T033 Añadir `aria-live`, texto alternativo a los colores y foco visible para estados y errores del flujo SII. — región `aria-live="polite"` en el panel SII, `role="alert"`/`"status"` en la emisión, y todos los estados con texto además de color (incluido el `sr-only` «Listo:»/«Falta:» del diagnóstico).
- [X] T034 [P] Crear pruebas de aceptación para estados aceptado, reparos, rechazado, pendiente, error y sin clasificar.
- [X] T035 [P] Crear pruebas de consulta repetida por track id y reintento seguro sin consumir otro folio.
- [X] T036 [P] Crear prueba de concurrencia o guardia que impida emitir dos veces la misma factura.
- [X] T037 [P] Crear pruebas de renderizado/contrato para que la lista muestre estado, ambiente, folio y track id cuando existan. — pruebas de contrato: los 8 campos que el panel necesita, que la consulta los traiga, que la fila muestre las dos pastillas y que el XML/PDF no salgan por enlace directo.

**Checkpoint**: el administrador puede iniciar un envío, conocer su resultado y seguir un documento pendiente sin duplicarlo.

## Fase 5: Validación

- [X] T038 Ejecutar `npm test` y cubrir el flujo completo de carga/validación.
- [X] T039 Ejecutar `npm run lint` y `npm run build`.
- [X] T040 Ejecutar `npm run fixtures` y `npm run test:simpleapi` en A2 con credenciales no productivas. — **ejecutado el 2026-08-20** con el `.pfx` autofirmado y el CAF sintético. Pasos 0–3 ✔ (timbrado con TED y firma, sobre, PDF de 48 KB) y el envío falla solo con «Certificado vencido», que es el resultado que valida todo lo anterior. No consumió cuota.
- [ ] T041 Ejecutar el set A3 con certificado y CAF reales de certificación del cliente. — 🚧 **lo ejecuta el cliente**, no el equipo: el certificado no sale de su computador. Procedimiento y planilla de evidencia ya escritos.
- [~] T042 Crear `certificacion-acta.md` con folios, track ids, estados, XML/PDF y evidencia de respuestas. — [`certificacion-acta.md`](certificacion-acta.md) creada como **plantilla lista para llenar**. Los valores los anota quien ejecute A3.

## Fase 6: Producción

- [ ] T043 Recibir y cargar credenciales/CAF de producción separados de certificación. — 🚧 después de A3.
- [ ] T044 Confirmar resolución y autorización de emisión real. — 🚧 después de A3.
- [ ] T045 Ejecutar una emisión controlada en producción. — 🚧 después de A3.
- [X] T046 Documentar monitoreo, cuotas, errores, folios no utilizados y procedimiento de rollback. — [`operacion-produccion.md`](operacion-produccion.md): qué mirar y cada cuánto, cuotas, qué hacer con cada error según si el folio se perdió o no, cómo declarar folios no utilizados, cómo destrabar una factura en «Emitiendo…», el vencimiento del certificado y el procedimiento de vuelta atrás.
