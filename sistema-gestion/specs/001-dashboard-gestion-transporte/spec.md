# Especificación: Dashboard de gestión para transporte

## Resumen del problema
El proyecto debe ayudar a una empresa de transporte a gestionar de forma centralizada la operación diaria, la facturación, la cobranza, la flota, los choferes y la salud financiera del negocio.

## Objetivo
Crear un dashboard interno que permita ahorrar tiempo en tareas repetitivas, mejorar la trazabilidad de cotizaciones, viajes y facturas, y ofrecer reportes financieros mensuales para la toma de decisiones.

## Usuarios
- Jefes de la empresa
- Administradores
- Operadores
- Contadores
- Personal de cobranza y facturación

## Historias de usuario

### US1: Dashboard operativo y financiero
Como jefe o administrador, quiero ver un resumen del negocio por periodo para entender el estado operativo y financiero sin revisar múltiples fuentes.

Criterios de aceptación:
- El dashboard muestra KPIs del período actual.
- El selector de periodo global aplica la vista a toda la app.
- El usuario puede distinguir ingresos, costos, utilidad, facturación y cobros.
- La vista se adapta al contexto de operación de viajes especiales y taxis.

### US2: Gestión de cotizaciones
Como operador, quiero crear y gestionar cotizaciones con su correlatividad y detalle de servicio para preparar la operación con rapidez.

Criterios de aceptación:
- Se puede crear una cotización con cliente, detalle, monto y estado.
- El sistema asigna número correlativo de forma automatizada.
- La cotización puede exportarse a PDF y Excel para el cliente.
- La cotización puede aceptarse y convertirse en viaje programado.

### US3: Gestión de viajes y costos
Como operador, quiero registrar viajes, asignar choferes y vehículos, y controlar costos para mantener la operación bajo control.

Criterios de aceptación:
- Se puede crear un viaje con origen, destino, fechas, cliente y servicio.
- Se pueden asignar choferes y vehículos al viaje.
- El sistema registra costos operativos y calcula utilidad.
- El viaje puede cambiar de estado según su avance y facturación.

### US4: Facturación y cobranza
Como contador o administrador, quiero emitir facturas y controlar cobranzas para asegurar la salud financiera del negocio.

Criterios de aceptación:
- Se pueden crear facturas a partir de viajes o servicios.
- El sistema mantiene estados derivados de facturación y pago.
- El estado de cuenta del cliente refleja montos por facturar, por cobrar y vencidos.
- El cliente puede recibir el documento facturado en formato exportable.

### US5: Gestión vehicular y de choferes
Como responsable de operación, quiero controlar los vencimientos legales de vehículos y choferes para evitar riesgos operativos.

Criterios de aceptación:
- Se registran vehículos y choferes con sus documentos y vencimientos.
- La app presenta alertas visibles por vencimiento o próximo vencimiento.
- La documentación requerida aparece como parte del flujo de operación.
- Los riesgos relacionados con revisión técnica, SOAT, permisos y licencias son visibles.

### US6: Reportes financieros mensuales
Como jefe de la empresa, quiero visualizar la información financiera consolidada por mes para evaluar el negocio y tomar decisiones estratégicas.

Criterios de aceptación:
- La app permite ver ingreso, egreso y utilidad por periodo mensual.
- El resumen financiero integra cotizaciones, viajes, facturas y costos.
- El resultado es consistente con el periodo global activo.
- La información puede usarse para análisis de negocio y control financiero.

## Reglas de negocio clave
- Los estados derivados no deben almacenarse como una fuente autónoma; deben calcularse desde los datos operativos.
- La patente es el identificador del vehículo y debe validarse consistentemente.
- La operación debe mantener un flujo coherente: cotización → viajes → facturas → cobros.
- La gestión de flota y choferes es parte del núcleo del sistema y no puede tratarse como un módulo opcional.
- La parte de taxis y la operación especial deben convivir dentro del mismo dashboard con la misma lógica global.
- Los informes financieros mensuales deben derivarse del mismo conjunto de datos que la operación.

## Restricciones
- Debe respetar la arquitectura actual del repositorio: Next.js App Router, React, TypeScript, Tailwind y Supabase.
- Debe seguir la lógica de autenticación por roles y la separación de responsabilidades por carpetas.
- No debe exponer información sensible o funcionalidad sin autenticación adecuada.
- La integración con SII es un potencial crecimiento posterior, no el foco inicial.

## Criterio de éxito
El sistema será exitoso si permite reducir el trabajo manual, tener trazabilidad completa de la operación, controlar vencimientos legales y generar reportes financieros útiles para la gestión del negocio.
