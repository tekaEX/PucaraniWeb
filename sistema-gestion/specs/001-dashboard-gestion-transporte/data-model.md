# Data model: dashboard de gestión para transporte

> **Sincronizado con la implementación el 2026-08-17 (T049).** Este documento se
> escribió antes de construir, y varias entidades quedaron distintas. Se
> corrigieron acá abajo, con una nota **(cambió)** donde el modelo real se
> separó del planeado, para que nadie diseñe contra una versión que no existe.
>
> La fuente de verdad son `src/types/db.ts` (los tipos y los diccionarios de
> estados) y `supabase/migrations/` (la base). Si algo de este archivo se
> contradice con esos dos, mandan ellos.

## Core entities

### Cliente
- id
- nombre
- rut / identificador fiscal (if applicable)
- email
- telefono
- direccion
- created_at
- estado activo/inactivo

### Cotizacion
- id
- numero_correlativo
- cliente_id
- fecha_creacion
- fecha_viaje
- estado: borrador · enviada · aceptada · rechazada **(cambió: no hay "vencida"; una cotización vieja sigue en el estado en que quedó)**
- subtotal
- descuentos
- iva
- total
- observaciones

### Viaje
- id
- cotizacion_id (nullable)
- cliente_id
- fecha_inicio
- fecha_termino
- origen
- destino
- chofer_id(s)
- vehiculo_id(s)
- estado: programado · realizado · cancelado. "Por facturar" **no es un estado guardado**: se deriva de un viaje realizado sin factura (`viajePorFacturar` en types/db.ts)
- costo_combustible · costo_peajes · costo_viaticos · costo_otros **(cambió: los costos se guardan desagregados; `costo_total` y `utilidad` se derivan, no se almacenan)**
- comentarios

### Factura
- id
- numero_folio
- cliente_id
- fecha_emision
- fecha_pago
- estado del DOCUMENTO: borrador · emitida · anulada. **(cambió)** "Por cobrar" y "pagada" son estados DERIVADOS de cruzar ese estado con `fecha_pago`; guardarlos sería tener dos verdades
- monto_total
- tipo_dte
- adjunto_pdf (nullable)
- viaja_ids asociados

### Vehiculo
- **patente = la clave primaria (cambió: no hay `id` aparte).** En formato
  canónico "ABCD-12" / "AB-1234", garantizado por la app y por un CHECK en la base
- marca, modelo, anio, capacidad, km_actual
- activo (no "estado")
- categoria: operación · taxis. **(cambió)** Es solo una ETIQUETA de dónde se
  ocupa el vehículo: no filtra ni condiciona nada
- Documentos legales, una fecha de vencimiento cada uno **(cambió: no se guarda
  el documento anterior, solo cuándo vence el vigente)**:
  - revision_tecnica_venc
  - soap_venc — **SOAP**, el seguro obligatorio chileno (no "SOAT", que es otro país)
  - permiso_circulacion_venc
- La lista de esos documentos vive en un solo lugar (`DOCS_VEHICULO` en
  `src/lib/vencimientos.ts`) y de ahí salen la tabla, el formulario y las alertas

### Chofer
- id, nombre, rut, telefono, foto_url
- licencia_numero · licencia_clase (A1–A5, B, C, D, E, F) · licencia_vencimiento
- activo (no "estado"); **no hay `fecha_ingreso`**
- **(cambió)** El chofer es una FICHA, no un usuario: no tiene cuenta ni entra
  al sistema. La tuvo mientras existió la app de reparto, que se fue a Ares
- categorías (operación/taxis) en la tabla aparte `chofer_categorias`

### Perfil / Usuario
- id
- email
- rol: admin · operador **(cambió: el rol `contador` se retiró — ver migración 0040)**
- estado

### Gasto / Coste operativo (`gastos_vehiculo`)
- id, empresa_id
- vehiculo_id = **la patente** (nullable: un gasto puede no estar imputado)
- categoria: combustible · mantencion · seguros · otros
- origen: manual · sii (lo importado del Registro de Compras — ver `sii.md`)
- fecha, monto_neto, monto_iva, monto_total, descripcion
- **(cambió)** No cuelga de un viaje: los costos del viaje son cuatro columnas
  del propio viaje

### Servicio de taxi (`servicios_taxi`) — no estaba en el modelo original

El área de taxis se construyó aislada: **no genera cotización ni factura**, pero
su plata sí suma a los ingresos del periodo y a los ingresos por cliente.

- id, empresa_id, fecha (se cobran al momento: esa fecha ES la de cobro)
- tipo: los **siete del talonario**, en ese orden — aeropuerto_arica ·
  arica_aeropuerto · tacna_peru · local · taxi_exclusivo · taxi_compartido ·
  especial. Los seis primeros son las casillas impresas del vale; "especial" no
  tiene casilla porque en el papel se escribe a mano
- descripcion: qué fue el servicio. **Solo para "especial"** —el único tipo cuyo
  nombre no lo dice— y es obligatoria ahí. En el vale ocupa la línea escrita a mano
- monto, pasajero
- cliente_id / chofer_id, y `cliente_texto` / `chofer_texto` para conservar el
  nombre cuando una importación del sistema anterior no encontró a quién apuntar
- origen_id: id en la app antigua, para que reimportar el respaldo no duplique

## Derived logic

- `estado_factura` is derived from invoice, payment date, and trip associations.
- `estado_cobranza` is derived from outstanding invoices and payment history.
- `estado_periodo` is controlled through a global period selector.
- `utilidad` is derived from trip income and operating costs.

Implementado en: `src/types/db.ts` (derivaciones de una fila), `src/lib/cobranza.ts`
(estado de cuenta) y `src/lib/finanzas.ts` (el resumen del periodo). Ninguno de
esos estados se guarda en una columna.

## Relationships

- Cliente has many cotizaciones, viajes, facturas.
- Cotizacion has one cliente and many viajes or lines.
- Viaje belongs to one cliente and may belong to many choferes and many vehiculos.
- Factura belongs to one cliente and many viajes.
- Vehiculo has many viajes and related compliance documents.
- Chofer has many viajes and one or many compliance records.

## Validation rules

- `patente` must be unique and valid in the app and DB.
- `numero_correlativo` and `folio` must remain in increasing/consistent order for the business process.
- Invoice and collection states cannot be manually stored as the only source of truth; they must be derived from payment and trip data.
- Fleet compliance dates must be visible in the alert queue and must not be silently ignored.

## Reporting aggregates

Monthly reporting derives from:
- booked and accepted quotes
- completed trips
- issued invoices
- collected amounts
- operating costs
- fleet and driver compliance exposure
- global period filters managed in the app shell

Implementado en `src/lib/finanzas.ts` (puro) sobre lo que carga
`src/lib/finanzas-server.ts` (una sola pasada que cubre el periodo, el anterior
y los meses del gráfico). La regla que gobierna todo el informe: **cada concepto
entra al periodo por una fecha distinta** —la factura por su pago, el viaje por
su ejecución, el gasto por la suya— y está escrita en `src/lib/periodo.ts`.
