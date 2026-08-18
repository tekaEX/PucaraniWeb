# T001 — Estructura del proyecto y dependencias clave

**Feature**: 001-dashboard-gestion-transporte · **Rama**: `separar-encomiendas` · **Fecha**: 2026-08-15

Verificación de que el árbol real de `src/` cumple lo declarado en `plan.md` §Project Structure y en
la Constitución §IV, más el mapa de dependencias de `src/app`, `src/components`, `src/lib` y
`src/types`.

**Veredicto**: cumple. No hay Pages Router, no hay un segundo "feature root" fuera de las cuatro
carpetas, y la dirección de las dependencias respeta las capas. Se anotan 3 desvíos menores y 3
hallazgos accionables al final.

Tamaño verificado: **135 archivos** en `src/` — 36 con `"use client"`, 10 archivos de Server
Actions (`"use server"`), 17 primitivas en `components/ui/`, 20 módulos en `lib/`, 7 Route Handlers.

---

## 1. Estructura real vs. `plan.md`

| Carpeta | Plan | Real | Estado |
|---|---|---|---|
| `src/app/` | `(app)/`, `api/`, `login/`, `globals.css`, `layout.tsx` | idem + `icon.svg` + slot `@modal` | ✅ slot agregado al plan |
| `src/components/` | `app-shell`, `notificaciones`, `page-header`, `periodo-selector`, `ui/` | idem + `estado-cuenta.tsx` | ✅ agregado al plan |
| `src/lib/` | `auth`, `cobranza`, `crypto`, `format`, `patentes`, `queries`, `supabase/`, `utils`, `vencimientos`, `...` | idem + `cobranza-server`, `form-helpers`, `logo`, `periodo`, `taxis-export`, `pdf/` | ✅ cubierto por el `...` |
| `src/types/` | `db.ts` | `db.ts` | ✅ exacto |
| `src/proxy.ts` | reservado a chequeos optimistas | delega en `lib/supabase/middleware.ts` y nada más | ✅ |

**El desvío que importaba**: `src/app/(app)/@modal/` no aparecía en el plan y no es un detalle. Son 10
archivos que implementan un **slot paralelo con rutas interceptoras** (`(.)choferes/nuevo`,
`(.)clientes/nuevo`, `(.)cotizaciones/nueva`, `(.)facturas/nueva`, `(.)taxis/nuevo`,
`(.)vehiculos/nuevo`, `(.)viajes/nueva`, más `[...catchAll]`, `default.tsx` y `page.tsx`): cada
"nuevo/nueva" abre como modal si se llega navegando, y como página completa si se entra por URL
directa o recarga. Cualquier alta que se agregue después tiene que respetar ese par de rutas, o
queda inconsistente con las siete que ya existen.

---

## 2. Dependencias clave por carpeta

Las capas van en una sola dirección:

```
src/app  ──▶  src/components  ──▶  src/lib  ──▶  src/types
   │                                  │              ▲
   └──────────────────────────────────┴──────────────┘
```

Verificado: `src/lib` **no** importa nada de `@/components` ni de `@/app`, y `src/types/db.ts` no
importa nada (hoja pura). Una sola arista sube de capa, ver §4.

### `src/types` — el vocabulario común

`db.ts` es el módulo más importado del repo: **58 imports**. No tiene dependencias. Contiene los
tipos de fila (`Cliente`, `Vehiculo`, `Chofer`, `Cotizacion`, `Factura`, `Viaje`, `Perfil`…), las
uniones de estado, los estados **derivados** (`facturaEstadoDerivado`, que la Constitución §V exige
calcular y no almacenar) y los diccionarios de etiquetas (`ROLES`, `TIPOS_DTE`,
`GASTO_CATEGORIAS`). Tocar este archivo repercute en toda la app: es el punto de mayor acoplamiento
y por eso el que más cuidado pide.

### `src/lib` — dominio y acceso a datos

Grafo interno (nadie importa hacia arriba):

```
format.ts ──▶ periodo.ts ──▶ cobranza-server.ts ──▶ (cobranza.ts)
    ├──────▶ cobranza.ts               taxis-export.ts ──▶ periodo.ts
    └──────▶ vencimientos.ts
supabase/server.ts ──▶ auth.ts · queries.ts · taxis-export.ts
logo.ts + queries.ts + format.ts ──▶ pdf/*.tsx
```

| Módulo | Rol | Depende de | Entorno |
|---|---|---|---|
| `supabase/server.ts` | cliente para RSC, actions y route handlers | `@supabase/ssr`, `next/headers` | servidor |
| `supabase/client.ts` | cliente de navegador | `@supabase/ssr` | cliente |
| `supabase/middleware.ts` | refresco de sesión y guardia de rutas | `@supabase/ssr`, `next/server` | proxy |
| `auth.ts` | sesión + rol; `ROLES_PANEL`, `exigirSesion`, `exigirPanel` | `supabase/server`, `types/db`, `react.cache` | servidor |
| `queries.ts` | lecturas compuestas del dominio (8 consumidores) | `supabase/server`, `types/db` | servidor |
| `periodo.ts` | periodo global mes/año en cookie (12 consumidores) | `next/headers`, `format` | servidor |
| `format.ts` | CLP y fechas es-CL; `hoyChile` (36 consumidores) | — | puro |
| `cobranza.ts` / `cobranza-server.ts` | estado de cuenta: helpers puros / agregación con periodo | `types/db`, `format` / `+ periodo` | puro / servidor |
| `vencimientos.ts` | alertas de documentación legal | `types/db`, `format` | puro |
| `patentes.ts` | normaliza y valida patente (identificador de vehículo) | — | puro |
| `form-helpers.ts` | lectura de `FormData` en Server Actions | — | puro |
| `utils.ts` | `cn()` de clases | `clsx`, `tailwind-merge` | puro |
| `crypto.ts` | AES-256-GCM para la clave del certificado SII | `node:crypto` + `ENCRYPTION_KEY` | servidor |
| `logo.ts` | carga el logo desde disco para los PDF | `node:fs`, `node:path` | servidor |
| `taxis-export.ts` | carga compartida de vales PDF y Excel | `supabase/server`, `periodo` | servidor |
| `pdf/*.tsx` | 3 documentos: cotización, informe, vales | `@react-pdf/renderer`, `format`, `logo` | servidor |

El par `cobranza.ts` / `cobranza-server.ts` es la separación deliberada entre lógica pura y lógica
que toca la cookie del periodo. Vale como patrón a repetir.

### `src/components` — UI reutilizable

- **Shell**: `app-shell.tsx` (cliente) monta navegación, `notificaciones.tsx` (campana de
  vencimientos, alimentada por `lib/vencimientos`) y `periodo-selector.tsx` (escribe el periodo
  global). Se instancian una sola vez, desde `src/app/(app)/layout.tsx`.
- **Presentación**: `page-header.tsx` (22 usos, el más reutilizado) y `estado-cuenta.tsx`.
- **`ui/`**: 17 primitivas. Las más usadas son `button` (34), `card` (20), `input` (18), `select`
  (11), `label` (11), `badge` (10). 8 de las 25 piezas de `components/` llevan `"use client"`; el
  resto son de servidor, en línea con la Constitución §I.

### `src/app` — rutas, layouts y Server Actions

- `layout.tsx` raíz + `(app)/layout.tsx`, que es **la puerta de acceso**: llama `exigirPanel()`
  antes de cualquier consulta.
- 11 secciones de negocio bajo `(app)/`: `choferes`, `clientes`, `cobranzas`, `combustible`,
  `configuracion`, `cotizaciones`, `facturas`, `finanzas`, `taxis`, `vehiculos`, `viajes`, más el
  dashboard en `(app)/page.tsx`.
- Patrón repetido por sección: `page.tsx` (servidor, consulta) + `*-form.tsx` / `*-accordion.tsx` /
  `*-panel.tsx` (cliente) + `actions.ts` (`"use server"`). Nueve secciones lo siguen; `cobranzas` y
  `finanzas` son de solo lectura y no tienen `actions.ts`.
- 7 Route Handlers en `api/`, todos de exportación o sincronización: PDF y Excel de cotización,
  PDF y Excel del informe de facturas, Excel y vales de taxis, y `combustible/sync`.
- `login/` fuera del grupo `(app)`: es la única ruta pública.

---

## 3. Dependencias externas y dónde viven

| Paquete | Se usa en | Nota |
|---|---|---|
| `next` 16.2.9 / `react` 19.2.4 | todo | App Router; el middleware es `src/proxy.ts` |
| `@supabase/ssr` | solo `lib/supabase/*` (3 archivos) | acceso a datos bien encapsulado |
| `@supabase/supabase-js` | ningún import directo | peer requerido por `@supabase/ssr`: **se queda** |
| `@react-pdf/renderer` | `lib/pdf/*` (3) | |
| `exceljs` | 3 route handlers de `api/` | |
| `clsx` + `tailwind-merge` | solo `lib/utils.ts` | |
| `lucide-react` | iconografía, ~40 componentes | |
| `zod` | **1 archivo**: `(app)/taxis/actions.ts` | validación concentrada en un solo lugar |
| `date-fns` | **1 archivo**: `cotizaciones/cotizacion-form.tsx` (`addDays`) | |
| `server-only` | 8 módulos de `lib/` | agregado en T001, ver H3 |
| ~~`react-hook-form`~~ | — | **desinstalado en T001**, ver H1 |
| ~~`@hookform/resolvers`~~ | — | **desinstalado en T001**, ver H1 |

Los formularios no usan librería: son `FormData` nativo contra Server Actions, con
`lib/form-helpers.ts` para leer y normalizar. Es coherente con "Server Components por defecto".

---

## 4. Reglas de capa: cumplimiento y la única excepción

✅ `src/lib` nunca importa `@/components` ni `@/app` (0 coincidencias).
✅ `src/types/db.ts` es hoja: sin imports.
✅ `src/proxy.ts` no hace acceso a datos de negocio; delega en `lib/supabase/middleware.ts`.

⚠️ **Única arista que sube de capa**: `src/components/app-shell.tsx:22` importa `logout` desde
`@/app/login/actions`. Es una Server Action usada por el botón de salir del shell. Funciona y es
inofensiva, pero deja a `components/` dependiendo de una ruta concreta. Si `login/` se mueve o se
renombra, el shell se rompe. Se decidió no tocarla: ver H4.

---

## 5. Evidencia de validación

Ejecutado sobre el árbol actual (Constitución §VI):

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `npm run lint` | sin advertencias |
| `npm test` | **66/66** pasan (5 suites: periodo, cobranza, patentes, form-helpers, vencimientos+cifrado) |
| `npm run build` | compila; 27 rutas + proxy |

---

## 6. Hallazgos y resolución

**H1 — Dos dependencias muertas. → Resuelto.** `react-hook-form` y `@hookform/resolvers` estaban en
`package.json` sin un solo import en `src/`. Tampoco figuraban en las "Primary Dependencies" del
plan: el `package.json` era el desactualizado. Desinstaladas. Los formularios siguen siendo
`FormData` nativo contra Server Actions.

**H2 — El slot `@modal` no estaba en el plan. → Resuelto.** Agregado a `plan.md` §Project Structure,
junto con las tres convenciones obligatorias que T001 dejó verificadas (patrón por sección, par de
rutas para cada alta, y `server-only` en los módulos de servidor).

**H3 — Nada impedía importar un módulo de servidor desde el cliente. → Resuelto.** El repo no usaba
`server-only`: `queries.ts`, `auth.ts`, `periodo.ts`, `taxis-export.ts`, `cobranza-server.ts`,
`logo.ts`, `crypto.ts` y `supabase/server.ts` eran de servidor solo por convención. Algunos habrían
fallado solos al compilar por usar `node:fs` o `node:crypto`, pero `queries.ts` no: importado desde
un componente cliente habría filtrado la forma de las consultas al bundle. Los 8 llevan ahora
`import "server-only"` en la primera línea. Se verificó antes que ningún consumidor actual sea un
componente cliente, así que el cambio no rompió nada.

> Efecto colateral atendido: el paquete lanza al importarse salvo que quien resuelve active la
> condición `react-server`, cosa que hace el bundler de Next pero no el corredor de pruebas de Node.
> Las suites que tocan `periodo.ts`, `crypto.ts` y `cobranza-server.ts` se caían enteras. Se agregó
> `pruebas/dobles/server-only.mjs` al mapa `DOBLES` de `pruebas/loader.mjs`, el mismo mecanismo que
> el repo ya usaba para `next/headers` y el cliente de Supabase. La garantía real la sigue dando el
> build de Next, que ve el paquete de verdad.

**H4 — Arista que sube de capa en `app-shell`. → No se toca, a propósito.** `app-shell.tsx:22`
importa `logout` desde `@/app/login/actions` (§4). Sacarla obligaría a mover esa Server Action a un
módulo compartido, rompiendo la convención de co-locación que siguen las 10 `actions.ts` del repo:
cada una vive junto a la sección que la usa. La Constitución §Code quality pide fixes mínimos y
desaconseja refactors amplios; el costo de la mudanza supera al de la arista. Queda documentada: si
`login/` se mueve o se renombra, hay que actualizar el shell.
