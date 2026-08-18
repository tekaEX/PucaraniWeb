# Tasks: Dashboard de gestión para transporte

**Input**: Design documents from `/specs/001-dashboard-gestion-transporte/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Verificar que la estructura del proyecto actual cumple con el plan y documentar dependencias clave en `src/app`, `src/components`, `src/lib` y `src/types` → `estructura-dependencias.md`
- [X] T002 Confirmar la configuración de Next.js, TypeScript, Tailwind y Supabase y dejarla alineada a la arquitectura de trabajo actual → `configuracion.md` (aplicó `type: module`, `typedRoutes`; su observación C1 —las variables de entorno sin validar— quedó **cerrada el 2026-08-17** con `lib/supabase/env.ts`)
- [X] T003 [P] Revisar y mantener `npm run lint` y `npm test` como gates de validación del proyecto → `gates-validacion.md`

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T004 Validar la capa de sesión y acceso por roles desde `src/lib/auth.ts` y asegurar que los flujos nuevos respeten el modelo actual — guardias en 7 route handlers + 25 server actions, prueba `6-auth.test.mjs`
- [X] T005 [P] Confirmar que la arquitectura de páginas y layouts en `src/app/` sigue siendo el punto central para nuevas vistas — faltaban las 3 fronteras: `not-found.tsx`, `error.tsx`, `global-error.tsx`
- [X] T006 [P] Revisar y documentar la capa de negocio en `src/lib/` para cotizaciones, viajes, facturas, costos y alertas de documentación legal — IVA unificado en `lib/totales.ts` (estaba copiado 4 veces), prueba `7-totales.test.mjs`
- [X] T007 Crear o ajustar modelos de dominio de negocio para cotizaciones, viajes, facturas, clientes, vehículos, choferes y reportes financieros mensuales — faltaba el 7.º: `lib/finanzas.ts` + prueba `8-finanzas.test.mjs`
- [X] T008 Definir el patrón de periodización global para el selector de periodo y su uso en dashboard, reportes y listas — `periodo.ts` (puro) / `periodo-server.ts` (cookie); regla "cada concepto entra por una fecha distinta" documentada

**Checkpoint**: Foundation ready - user story implementation can now begin

## Phase 3: User Story 1 - Dashboard operativo y financiero (Priority: P1)

**Goal**: Entregar la vista general del estado operativo y financiero del negocio en un dashboard único.

**Independent Test**: Verificar que un usuario con sesión válida observe KPIs del período y la información financiera clave.

### Tests for User Story 1
- [X] T009 [P] [US1] Crear prueba de validación del cálculo de KPIs básicos del dashboard — 7 casos nuevos en `8-finanzas.test.mjs` (conteos, cotizado por periodo)
- [X] T010 [P] [US1] Crear prueba de validación del selector de periodo global aplicado a dashboard y reportes — bordes de mes, vista anual y timestamps

### Implementation for User Story 1
- [X] T011 [P] [US1] Preparar el layout del dashboard en `src/app` y/o componentes del shell para la vista principal — el shell quedó con Dashboard / Operación / Taxis / Datos. **Corrección (2026-08-17)**: se había agregado acá un grupo *Finanzas* con "Resumen financiero" y "Cobranzas", y era menú de más — esas rutas ya no son pantallas, redirigen al Dashboard y a Clientes, que ya están en el menú. Grupo eliminado
- [X] T012 [P] [US1] Crear la capa de consulta para KPIs financieros y operativos en `src/lib/` — `lib/finanzas-server.ts`
- [X] T013 [US1] Implementar el cálculo de indicadores y agregados del período actual en la lógica del dashboard — page.tsx pasó de 245 a 153 líneas, usa `resumenFinanciero`
- [X] T014 [US1] Integrar el selector de periodo global y la visualización de ingresos, costos, utilidad y facturación — una carga cubre periodo y anterior; deltas desde el modelo
- [X] T015 [US1] Añadir validación de acceso y controles de permisos a la vista del dashboard — `exigirPanel()` en el cargador (DAL), no solo en el layout

**Checkpoint**: User Story 1 funcional y verificable de forma independiente

## Phase 4: User Story 2 - Gestión de cotizaciones (Priority: P1)

**Goal**: Gestionar cotizaciones con correlatividad, detalle y exportación para cliente.

**Independent Test**: Verificar que una cotización puede crearse, exportarse y aceptarse como viaje programado.

### Tests for User Story 2
- [X] T016 [P] [US2] Crear prueba de flujo de cotización y correlatividad — `9-cotizaciones.test.mjs`; la correlatividad es atómica en la RPC + `unique(empresa_id,numero)`
- [X] T017 [P] [US2] Crear prueba de exportación PDF/Excel de una cotización — `nombreArchivo()` unificado (había 3 versiones) y probado

### Implementation for User Story 2
- [X] T018 [P] [US2] Definir la forma de almacenamiento y validación de cotizaciones en `src/lib/` y/o `src/types/` — `lib/cotizaciones.ts`
- [X] T019 [P] [US2] Crear la vista y flujo de creación/edición de cotizaciones en `src/app` — ya existía (form + editor inline con autoguardado); verificado
- [X] T020 [US2] Implementar cálculo y persistencia de totales, IVA y estados de cotización — IVA desde `lib/totales.ts` (T006); estados derivados del diccionario
- [X] T021 [US2] Añadir exportación de cotización a PDF/Excel y permitir aceptación para generar viajes — ya existía; se unificó el nombre de archivo en los 5 endpoints
- [X] T022 [US2] Integrar el flujo con la lógica de viajes programados desde la cotización aceptada — `viajesDesdeCotizacion()` puro y probado

**Checkpoint**: User Story 2 funcional y verificable de forma independiente

## Phase 5: User Story 3 - Gestión de viajes y costos (Priority: P1)

**Goal**: Registrar viajes, asignar choferes/vehículos y controlar costos y utilidad.

**Independent Test**: Verificar que un viaje puede programarse, ejecutarse y calcular utilidad a partir de costos.

### Tests for User Story 3
- [X] T023 [P] [US3] Crear prueba del ciclo viaje programado → realizado → facturables — `10-viajes.test.mjs`
- [X] T024 [P] [US3] Crear prueba del cálculo de utilidad por viaje — `utilidadViaje()` y `margenViaje()` nuevos en db.ts

### Implementation for User Story 3
- [X] T025 [P] [US3] Definir modelos y consultas para viajes, costos y asignación de chófer/vehículo en `src/lib/` — `lib/viajes.ts`
- [X] T026 [P] [US3] Crear la interfaz para registrar viajes y su estado en `src/app` — ya existía; el form ahora usa las funciones compartidas
- [X] T027 [US3] Implementar asignación de choferes y vehículos por viaje — ya existía (N por viaje); `parsearAsignaciones()` extraída y probada
- [X] T028 [US3] Integrar cálculo de costos, utilidad y relación con facturación — el form ya no recalcula a mano
- [X] T029 [US3] Asegurar compatibilidad con el flujo global de periodo y filtros — verificado: las 6 listas usan el periodo, cada una por su fecha

**Checkpoint**: User Story 3 funcional y verificable de forma independiente

## Phase 6: User Story 4 - Facturación y cobranza (Priority: P1)

**Goal**: Emitir facturas y controlar cobros y estados de cuenta.

**Independent Test**: Verificar que una factura puede emitirse desde viajes y que su estado de pago se actualiza correctamente.

### Tests for User Story 4
- [X] T030 [P] [US4] Crear prueba del ciclo facturación → pago → estado de cuenta — `11-facturas.test.mjs` + el estado de cuenta ya cubierto en `2-cobranza`
- [X] T031 [P] [US4] Crear prueba de estados derivados para facturas y cobranza — ciclo completo borrador → por cobrar → pagada → anulada

### Implementation for User Story 4
- [X] T032 [P] [US4] Definir el modelo y consulta de facturas y cobros en `src/lib/` — `lib/facturas.ts`
- [X] T033 [P] [US4] Crear la vista de facturas y del estado de cuenta por cliente en `src/app` — ya existían: el estado de cuenta está en el acordeón de cada cliente (`/clientes`), que es a donde redirige `/cobranzas`
- [X] T034 [US4] Implementar la creación de facturas, el folio y el adjunto PDF — validación extraída y probada; el desglose se recalcula en el servidor
- [X] T035 [US4] Integrar los estados derivados para por facturar, por cobrar y pagada — ya existía en db.ts + cobranza.ts; verificado
- [X] T036 [US4] Añadir la lógica de exportación y seguimiento de documentos para cliente — informe PDF/Excel ya existía; nombre de archivo unificado (T017)

**Checkpoint**: User Story 4 funcional y verificable de forma independiente

## Phase 7: User Story 5 - Gestión vehicular y de choferes (Priority: P2)

**Goal**: Gestionar flota, choferes y documentación legal con alertas de vencimiento.

**Independent Test**: Verificar que la app vuelve visible el vencimiento de documentación legal y los controles operativos asociados.

### Tests for User Story 5
- [X] T037 [P] [US5] Crear prueba de alertas por vencimiento de documentación legal — `12-flota.test.mjs`; las dos fallas caras son opuestas: no avisar, y avisar de más hasta que la campana se deja de mirar
- [X] T038 [P] [US5] Crear prueba de validación de identificación de vehículos por patente — ya estaba en `3-patentes`; se agregó el contrato con el CHECK `vehiculos_patente_formato` de la base

### Implementation for User Story 5
- [X] T039 [P] [US5] Definir modelos y validaciones de vehículos, choferes y vencimientos en `src/lib/` y `src/types/` — `lib/flota.ts` (qué se deja guardar) + `lib/vencimientos.ts` crece a modelo de documentación
- [X] T040 [P] [US5] Crear la interfaz de gestión de flota y choferes en `src/app` — ya existía; las columnas y los campos de documentos ahora salen de `DOCS_VEHICULO` (estaban escritos a mano en 4 lugares) y las listas abren con `DocsResumen`
- [X] T041 [US5] Integrar alertas y campana de notificaciones para documentación vencida o próxima a vencer — ya existía; **la flota dada de baja ya no alerta** y una fecha ilegible dejó de leerse como "Vigente"
- [X] T042 [US5] Asegurar que los documentos legales formen parte del flujo prioritario de operación y no un módulo auxiliar — el estado de los papeles aparece al ASIGNAR chofer/bus (Viajes y Taxis), con aviso que no bloquea

**Checkpoint**: User Story 5 funcional y verificable de forma independiente

## Phase 8: User Story 6 - Reportes financieros mensuales (Priority: P2)

**Goal**: Consolidar la información financiera y operativa del negocio por mes para la toma de decisiones.

**Independent Test**: Verificar que el resumen mensual refleje ingresos, egresos, utilidad y situación general del período seleccionado.

### Tests for User Story 6
- [X] T043 [P] [US6] Crear prueba del cálculo de KPI y resumen mensual del negocio — 12 casos nuevos en `8-finanzas.test.mjs`: la serie mensual da lo mismo que el KPI de cada mes, y los cortes suman el KPI de ingresos
- [X] T044 [P] [US6] Crear prueba del filtrado por periodo global en el informe financiero mensual — la ventana de meses: cruce de año, vista anual y anclaje al día de Chile

### Implementation for User Story 6
- [X] T045 [P] [US6] Definir la lógica de agregación mensual en `src/lib/` — `serieMensual`, `ingresosPorCliente`, `egresosPorVehiculo/Categoria` en `lib/finanzas.ts`; `mesesVentana` en `lib/periodo.ts`
- [X] T046 [P] [US6] Crear componentes o vistas para gráficos y tarjetas de resumen mensual en `src/components/` y/o `src/app/` — `components/grafico-meses.tsx`, con la paleta de dos series validada para daltonismo
- [X] T047 [US6] Integrar el resumen financiero con la operación general (cotizaciones, viajes, facturas, costos y pago) — el dashboard hacía **12 consultas**: 5 para los KPI y 7 más de la sección financiera sobre las mismas tablas. Ahora es **una sola carga** y las dos cosas salen de las mismas filas
- [X] T048 [US6] Validar consistencia del período mensual con la estructura global de filtros de la app — el gráfico y `todayInput()` usaban el reloj del servidor (UTC): de noche adelantaban un día/mes. Anclados a `hoyChile()`

**Checkpoint**: User Story 6 funcional y verificable de forma independiente

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T049 [P] Revisar documentación del proyecto y mantener la constitución, plan y especificación sincronizados con la implementación — `data-model.md` describía entidades como se pensaron, no como quedaron (patente como PK, costos desagregados, estados derivados, el rol `contador` retirado, los taxis que faltaban); constitución 1.0.1: el seguro es **SOAP**, no SOAT
- [X] T050 [P] Revisar accesos por roles y seguridad en rutas principales del dashboard — 33 acciones y 7 endpoints auditados; **2 acciones de lectura estaban sin guardia** (`tieneHistorial*`), y sin sesión respondían "no tiene historial" en vez de rechazar. La invariante quedó fijada en `6-auth.test.mjs`, que lee los `actions.ts` reales
- [X] T051 [P] Corregir inconsistencias de diseño y estado en componentes compartidos — el aviso de autoguardado estaba copiado en **8 pantallas** con tres redacciones distintas: `components/ui/estado-guardado.tsx`, ahora con `aria-live`
- [X] T052 Ejecutar validación final con `npm run lint` y `npm test` — lint, typecheck, 203/203 y build, todo limpio
- [X] T053 Revisar y documentar cualquier pendiente de integración futura con SII como expansión no prioritaria — `sii.md`: lo que existe, los cuatro cabos sin confirmar (cuerpo del request, cabecera, RUT de distribuidores de ejemplo, y que el RCV no trae detalle para deducir la patente) y lo que está fuera de alcance

## Dependencies & Execution Order

- Setup and foundation must be complete before user stories begin.
- User stories 1–4 are core business functionality and should be treated as the primary MVP.
- User stories 5–6 extend the operational and management layer with compliance and financial reporting.
- Tasks can be executed in parallel when they touch different files and are not dependent on each other.

## Notes

- The current repo already contains the core architecture to implement this feature.
- No separate project shell or framework switch is needed.
- The implementation should be incremental and follow a TDD-friendly workflow when business logic is testable.
