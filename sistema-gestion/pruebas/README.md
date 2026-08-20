# Pruebas

```bash
npm run lint          # eslint sobre 172 archivos: src/, pruebas/ y los configs
npm run typecheck     # tsc --noEmit
npm test              # 209 pruebas, sin red ni base de datos (<2 s)
npm run test:esquema  # el esquema COMPLETO de la base real (solo lectura)
npm run test:datos    # integridad de los datos guardados (solo lectura)
```

Los tres primeros son los gates que corren en CI (`.github/workflows/ci.yml`, en
la raíz del repo) junto con `npm run build`. Los dos últimos necesitan la clave
de servicio y la base real, así que se corren a mano.

**Requiere Node 24 o superior.** Las pruebas importan los `.ts` de `src/`
directamente y dependen de que Node les quite los tipos solo, cosa que hace por
defecto recién desde la 23.6. En Node 22 no corre ninguna.

Las pruebas importan los archivos **reales** de `src/` — no copias ni versiones
portadas. `loader.mjs` traduce lo que TypeScript resuelve y Node no (el alias
`@/…` y los imports sin extensión) y cambia por un doble solo lo que no puede
ser real dentro de una prueba: el cliente de Supabase, `next/headers`,
`next/navigation` y `server-only` (que lanza a propósito salvo que lo resuelva
el bundler de Next).

No hay framework de pruebas: `node:test` viene con Node.

| Archivo | Qué cubre |
| --- | --- |
| `1-periodo.test.mjs` | El filtro de mes/año y las fechas: que ninguna factura quede fuera de su periodo. |
| `2-cobranza.test.mjs` | Estado de cuenta por cliente: por cobrar, vencido, pagado, pendiente de facturar. La regla delicada es que cada factura entra al periodo por una fecha distinta según su estado. |
| `3-patentes.test.mjs` | La patente es la **clave primaria** del vehículo: guardarla en dos formatos parte el historial en dos. |
| `4-form-helpers.test.mjs` | Cómo se leen los números que escribe la gente (formato chileno de miles). Fija la trampa del punto decimal. |
| `5-vencimientos-cifrado.test.mjs` | Alertas de papeles vencidos y el cifrado de la clave del certificado del SII. |
| `6-auth.test.mjs` | Quién entra al panel. Fija `ROLES_PANEL` (si esa lista cambia, cambia el acceso a todo el sistema) y **que ninguna Server Action ni Route Handler se quede sin guardia**: lee los `actions.ts` reales y falla si aparece una exportada sin control de acceso. |
| `7-totales.test.mjs` | IVA en los dos sentidos: totales de cotización y desglose de factura. La trampa fijada es que el IVA de una factura **no** es `total * 0,19`. |
| `8-finanzas.test.mjs` | Resumen financiero mensual y el informe del negocio. Fija POR QUÉ FECHA entra cada cosa al periodo (la factura por su pago, el viaje por su ejecución), que el gráfico de tendencia dé lo MISMO que el KPI de cada mes, y que los cortes por cliente/vehículo/categoría cuadren con esas cifras. |
| `9-cotizaciones.test.mjs` | Cotizaciones: lectura de las líneas del formulario, estados, y en qué viajes se convierte una aceptada. Incluye el saneado del nombre de archivo de las exportaciones. |
| `10-viajes.test.mjs` | El ciclo programado → realizado → facturable (estado DERIVADO, no una columna), la utilidad por viaje y la asignación de chofer/vehículo. |
| `11-facturas.test.mjs` | Reglas del documento tributario: qué hace falta para emitir, y que el desglose neto/IVA lo calcule el SERVIDOR y no el formulario. |
| `12-flota.test.mjs` | Documentación legal: **cuándo avisar y cuándo no**. Fija que un vehículo dado de baja deje de alertar (una campana que marca lo que nadie puede resolver se deja de mirar) y que una fecha ilegible no se informe como "Vigente". Incluye las clases de licencia y que la patente que guarda la app pase el CHECK de la base. |
| `13-taxis.test.mjs` | Los 7 tipos de servicio de taxi. Fija el orden y el texto impreso de las **6 casillas del vale** (lo que el pasajero firma), que "Especial" es el único sin casilla y el único que pide descripción, y que un tipo desconocido se muestre crudo en vez de tirar la pantalla. |
| `esquema.mjs` | El esquema de la base contra lo que el código da por hecho. |
| `datos.mjs` | Los datos ya guardados: totales que no cuadran, fechas imposibles, referencias rotas. |

Los archivos 1–5 se renumeraron cuando las pruebas de encomiendas (pago, rutas,
navegación, el almacén del teléfono) se fueron con esa parte del sistema al
proyecto Ares. Los 6–8 son de la Fase 2 de la feature 001; 9–13, una por User
Story (cotizaciones, viajes, facturas, flota y documentación, taxis). El informe
financiero mensual (User Story 6) se sumó a `8-finanzas`, que ya era su archivo.

**`npm run test:datos` falla hoy con 1 problema esperado**: un vehículo quedó
con `categoria = 'encomiendas'`, valor que la app ya no conoce. Lo limpia la
migración `0042_categorias_sin_encomiendas.sql`, escrita y sin correr.

## Por qué `esquema.mjs` existe

`tsc`, `eslint` y `next build` pueden estar los tres en verde con una pantalla
entera rota: ninguno sabe qué columnas tiene la base. Pasó — una migración no
corrida dejaba sin una columna a todas las consultas de una pantalla, y en vez
de un error se veía la pantalla vacía, idéntica a un mes sin trabajo.

De ahí salieron dos cosas: este script (**correlo después de cada migración**) y
`components/ui/error-datos.tsx`, para que un error de lectura no vuelva a
disfrazarse de mes sin movimiento.

`esquema.mjs` comprueba además que las tablas `encomienda_*` **no** estén en la
base. Hoy **falla**: 6 de las 9 siguen ahí (`actividad`, `reglas_pago`,
`ingresos_reales`, `pagos`, `jornadas`, `periodos_facturacion`).

No es un respaldo restaurado. La limpieza quedó a medias: el commit 3789f74
borró del repo las migraciones 0017–0035 de encomiendas, pero ninguna de ellas
dropeaba las tablas y nunca se escribió la que lo hiciera — la "migración 0036"
que citaba este archivo no existe.

**Corrección (2026-08-20): esa migración NUNCA se escribió.** Este archivo decía
que existía `0041_retirar_encomiendas.sql` y que «se lleva las tablas, 11
funciones y un job de pg_cron». Era falso: el archivo con ese nombre era un
**duplicado byte a byte de `0040_sin_rol_contador.sql`** —mismo MD5— sin un solo
`drop table`. Correrlo no borraba nada: volvía a ejecutar los `drop policy` de la
0040, que son idempotentes, y terminaba sin error. Por eso se corrió y las
tablas siguieron ahí.

El duplicado se retiró del repo. El hueco en el número 0041 es intencional, como
los otros.

**Estado real**: las 6 tablas siguen en la base, con datos —776 filas en
`encomienda_actividad`, 22 en `pagos`, 22 en `jornadas`, 1 en `reglas_pago`, 1 en
`periodos_facturacion`—. La app **no las consulta**: solo las menciona en
comentarios.

**Estas 6 fallas siguen siendo esperadas** y no son una regresión. Para que dejen
de aparecer hay que escribir la migración de verdad, y eso es una decisión del
dueño: son datos operativos reales del sistema de reparto que se fue a Ares. Los
pasos, y las consultas para inventariar funciones y jobs antes de borrar nada,
están en `specs/002-simpleapi-certificacion/decisiones.md`.

## Lo que estas pruebas NO cubren

- **Las policies RLS.** `test:esquema` y `test:datos` usan la clave de servicio,
  que se salta RLS. Que cada rol vea solo lo suyo se comprueba entrando con una
  cuenta de ese rol.
- **Las Server Actions de punta a punta**: necesitan una sesión de Next. Lo que
  sí está probado es toda la lógica pura que usan.
