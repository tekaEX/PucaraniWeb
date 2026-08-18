# T003 — `npm run lint` y `npm test` como gates de validación

**Feature**: 001-dashboard-gestion-transporte · **Fecha**: 2026-08-15

Revisión de los gates que la Constitución §VI declara obligatorios, de qué cubre cada uno realmente,
y qué hacía falta para que sean gates y no buenas intenciones.

**Veredicto**: los dos gates estaban bien construidos y cubren lo que dicen cubrir. Lo que faltaba
era que alguien los hiciera cumplir: **no había CI**. Se agregó, junto con el comando que faltaba
para el tercer chequeo que la Constitución exige pero nadie podía correr.

---

## 1. Qué cubre `npm run lint` — medido, no supuesto

Un gate que no mira nada es peor que no tenerlo, así que se contó qué archivos analiza de verdad
(`eslint --format json`): **148 archivos** — 94 `.tsx`, 40 `.ts`, 14 `.mjs`.

| Zona | Cubierta |
|---|---|
| `src/` completo | sí, los 133 archivos lintables (todo menos `globals.css` e `icon.svg`) |
| `pruebas/` | sí, las 5 suites + `esquema.mjs`, `datos.mjs`, `loader.mjs`, `registrar.mjs` y los 3 dobles |
| Configs de la raíz | sí: `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs` |
| `public/` | **ignorado a propósito** (assets estáticos y libs de terceros) |

No hay puntos ciegos. `eslint` sin argumentos analiza el directorio actual con la config plana, y la
config extiende `core-web-vitals` + `typescript` de `eslint-config-next`, como pide la Constitución
§III.

## 2. Qué cubre `npm test`

66 pruebas en 5 suites, sin red ni base de datos, en menos de medio segundo. No hay framework:
`node:test` viene con Node, y `pruebas/loader.mjs` deja importar los archivos **reales** de `src/`
traduciendo el alias `@/…` y las extensiones que TypeScript resuelve y Node no.

| Suite | Regla de negocio que fija |
|---|---|
| `1-periodo` | el filtro de mes/año: que ninguna factura quede fuera de su periodo |
| `2-cobranza` | por cobrar / vencido / pagado / pendiente de facturar, cada uno entrando por la fecha que le toca |
| `3-patentes` | la patente es la PK del vehículo: dos formatos parten el historial en dos |
| `4-form-helpers` | números en formato chileno, con la trampa del punto decimal |
| `5-vencimientos-cifrado` | alertas de papeles vencidos y el cifrado AES-256-GCM del certificado SII |

Lo que **no** cubren, y está bien que se sepa: las policies RLS (los scripts de base usan la clave de
servicio, que se las salta) y las Server Actions de punta a punta. Lo que sí está probado es toda la
lógica pura que esas actions usan.

**Dependencia de versión que no estaba escrita**: las pruebas importan los `.ts` directo y necesitan
que Node les quite los tipos solo, cosa que pasa por defecto recién desde Node 23.6. En Node 22 no
corre ninguna. Quedó declarado en `engines` y en `pruebas/README.md`.

## 3. Los otros dos scripts

`npm run test:esquema` y `npm run test:datos` van contra la base real en **solo lectura** y salen con
código 1 si algo falla, así que sirven como gate — pero necesitan la clave de servicio, y por eso se
corren a mano y no en CI. `esquema.mjs` existe porque `tsc`, `eslint` y `next build` pueden estar los
tres en verde con una pantalla rota: ninguno sabe qué columnas tiene la base.

**Correlo después de cada migración.** Incluida la 0040 de este mismo ciclo de trabajo, que todavía
no está aplicada.

---

## 4. Cambios aplicados en T003

**G-A — Faltaba CI: se agregó `.github/workflows/ci.yml`.** Era el hueco de fondo. La Constitución
§VI dice "no declarar completado sin evidencia de lint/test" y el Development Workflow §5 lo repite
para los merges, pero nada lo verificaba: `.github/` solo tenía las skills de speckit. El gate existía
como disciplina personal, no como gate.

Corre `lint → typecheck → test → build` en push a `main`, en cada pull request y a mano. Dos detalles
que costaría descubrir después:

- **El archivo va en la raíz del repo, no en `sistema-gestion/`.** Este repositorio tiene la web
  estática de Pucarani en la raíz y la app en un subdirectorio; GitHub solo lee workflows desde la
  raíz. El `.github/` que hay dentro de `sistema-gestion/` nunca se habría ejecutado. De ahí el
  `working-directory: sistema-gestion`.
- **Node 24 fijo**, por lo del type stripping (§2).

El paso de build usa dos valores de relleno para las variables `NEXT_PUBLIC_SUPABASE_*`. Se verificó
que el build pasa así: todas las páginas son dinámicas, nadie consulta Supabase en tiempo de build, y
las variables solo hacen falta para que la librería arme sus clientes. **No hay secretos en el
workflow** y no hace falta configurar ninguno.

**G-B — Faltaba `npm run typecheck`.** La Constitución §III declara la estrictez de TypeScript un
gate obligatorio, pero el proyecto no tenía cómo correrlo: o `npx tsc --noEmit` de memoria, o un
`next build` entero. Ahora es un script, y es el segundo paso de CI.

**G-C — `engines: { node: ">=24" }`** en `package.json`, por lo de §2.

**G-D — `pruebas/README.md` actualizado**: el tercer doble del loader (`server-only`, agregado en
T001), la lista de gates con los dos comandos nuevos, y el requisito de Node.

---

## 5. Hallazgo grave: la limpieza de encomiendas quedó a medias

Corrí `npm run test:esquema` como parte de la revisión. **Falla, y con razón: 6 de las 9 tablas
`encomienda_*` siguen en la base de producción** — `encomienda_actividad`, `encomienda_reglas_pago`,
`encomienda_ingresos_reales`, `encomienda_pagos`, `encomienda_jornadas` y
`encomienda_periodos_facturacion`. Las otras 3 (`pedidos`, `rutas`, `paradas`) sí se fueron.

Y el motivo no es el que el propio código suponía. Tanto `esquema.mjs` como `pruebas/README.md`
decían que "la migración 0036" había borrado el rastro de encomiendas, y que si las tablas aparecían
era porque alguien restauró un respaldo viejo. **Esa migración nunca existió**: en el commit
`3789f74` se borraron del repo los archivos 0017–0035, pero ninguno de ellos dropeaba las tablas, y
no se escribió ninguna que lo hiciera. Las migraciones saltan de la 0016 a la 0020, y de la 0030 a la
0040.

Se corrigieron los dos comentarios para que digan lo que pasa de verdad, y se **escribió la migración
que falta sin ejecutarla**: `supabase/migrations/0041_retirar_encomiendas.sql`. Ver `pendientes.md`.

Revisando qué dejaron esas migraciones borradas apareció más de lo que el chequeo mira. Además de las
6 tablas siguen vivas **11 funciones** (`encomienda_repreciar_dia` y `encomienda_valorar_dia` en
`public`; nueve `private.encomienda_*` de congelado, jornadas y reglas) y —lo más incómodo— un **job
de pg_cron llamado `encomienda-cerrar-jornadas` que se dispara todos los días** para un negocio que
ya no es de esta empresa. La 0041 se lleva las tres cosas.

Importa por dos razones, más allá del prolijo: hay **datos personales de destinatarios** guardados en
una base de un negocio que ya no es de esta empresa, y mientras el chequeo falle nadie va a poder
distinguir esta falla conocida de una nueva. Por eso quedó anotado en `esquema.mjs` y en
`pruebas/README.md` que estas 6 fallas son esperadas hasta que se corra la 0041.

---

## 6. Evidencia de validación

| Comando | Resultado |
|---|---|
| `npm run lint` | limpio, 148 archivos |
| `npm run typecheck` | sin errores |
| `npm test` | **66/66** |
| `npm run build` | compila |
| `npm run build` con env de relleno (simula CI) | compila — el workflow va a pasar |
| `npm run test:esquema` | **6 fallas**, todas la misma: §5 |
