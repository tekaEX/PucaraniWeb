# T002 — Configuración de Next.js, TypeScript, Tailwind y Supabase

**Feature**: 001-dashboard-gestion-transporte · **Fecha**: 2026-08-15

Confirmación de las cuatro configuraciones del stack y su alineación con la arquitectura de trabajo
verificada en T001 (`estructura-dependencias.md`).

**Veredicto**: la configuración era correcta. No había nada roto ni contradictorio con el plan. Se
aplicaron tres ajustes de alineación (§6) y quedan dos observaciones abiertas (§7), más un hallazgo
funcional que apareció de paso y no es de configuración (§8).

---

## 1. Next.js — `next.config.ts`

| Punto | Estado |
|---|---|
| Versión | 16.2.9, **Turbopack** por defecto en dev y build |
| Middleware | correcto para Next 16: se llama **Proxy** y vive en `src/proxy.ts`, no en `middleware.ts` |
| `serverExternalPackages` | `exceljs` lo necesita de verdad (no está en la lista que Next externaliza solo); `@react-pdf/renderer` **sí** está en esa lista — se deja explícito a propósito, para no depender de que siga ahí |
| `typedRoutes` | **activado en T002**, ver §6 |
| Config en TS | soportado; con `"type": "module"` el archivo puede usar sintaxis ESM directamente |

El `matcher` del proxy excluye `_next/static`, `_next/image`, favicon e imágenes — correcto: el
refresco de sesión no debe correr sobre assets.

## 2. TypeScript — `tsconfig.json`

Cumple la Constitución §III sin excepciones:

- `strict: true`, `noEmit: true`, `isolatedModules: true`, `skipLibCheck: true`.
- `moduleResolution: "bundler"` + `module: "esnext"` — lo que corresponde a Next 16.
- Alias `@/*` → `./src/*`, que es el estilo canónico de import y el que traduce el loader de
  pruebas (`pruebas/loader.mjs`).
- `include` ya trae `.next/types/**/*.ts` y `.next/dev/types/**/*.ts`, requisito para que
  `typedRoutes` tipe los enlaces. No hubo que tocarlo.
- `target: "ES2017"` es el valor con el que Next scaffoldea; se deja como está.

## 3. Tailwind CSS v4

Setup v4 correcto y completo: **no hay `tailwind.config.js` y no debe haberlo**. Toda la
configuración vive en CSS:

- `src/app/globals.css` (226 líneas): `@import "tailwindcss"` en la línea 1 y un bloque
  `@theme inline` que expone los tokens del sistema de diseño como utilidades.
- Los tokens de marca, base, estado y superficie se declaran como custom properties en `:root`.
- `postcss.config.mjs` con el único plugin que v4 necesita: `@tailwindcss/postcss`.
- Animaciones propias (`fade-in`, `scale-in`, `expand`, `page-in`, `slide-up`) con su
  `@media (prefers-reduced-motion: reduce)` correspondiente.

## 4. Supabase

Tres clientes, uno por contexto de ejecución, sin mezcla (T001 §2):

| Cliente | Contexto | Nota |
|---|---|---|
| `lib/supabase/server.ts` | RSC, Server Actions, Route Handlers | `import "server-only"` |
| `lib/supabase/client.ts` | componentes `"use client"` | única puerta al navegador |
| `lib/supabase/middleware.ts` | proxy | refresca sesión en cada request |

- El proxy **no rompe la app si Supabase no responde**: envuelve `getUser()` en try/catch y trata el
  fallo como "sin sesión" en lugar de tirar un 500.
- Migraciones: 19 archivos SQL numerados en `supabase/migrations/`, con la convención de correrlos a
  mano en Supabase > SQL Editor, re-ejecutables y con verificación al final. No hay
  `supabase/config.toml` ni CLI — ver observación C2.
- La autorización real vive en las policies RLS, no en la app (Constitución §II).

## 5. Variables de entorno

Las **5** variables usadas en el código son exactamente las 5 documentadas en `.env.example`. Sin
huérfanas y sin indocumentadas.

| Variable | Dónde se usa | Pública |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | los 3 clientes de Supabase | sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | los 3 clientes de Supabase | sí |
| `SIMPLEAPI_KEY` | integración SII | no |
| `ENCRYPTION_KEY` | `lib/crypto.ts` (AES-256-GCM) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | solo `npm run test:esquema` / `test:datos` | **nunca** |

`.env.local` tiene las 5 más `VERCEL_OIDC_TOKEN`, que inyecta la CLI de Vercel. `.gitignore` cubre
`.env*` con excepción de `.env.example`: ningún secreto entra al repo.

---

## 6. Cambios aplicados en T002

**C-A — `"type": "module"` en `package.json`.** El corredor de pruebas de Node reparsea cada `.ts`
del proyecto y avisaba con `MODULE_TYPELESS_PACKAGE_JSON` en cada corrida. Ese ruido es un costo
real: la Constitución §VI exige mostrar la salida de los gates, y un warning repetido en medio del
resumen tapa fallas de verdad. Verificado antes: no hay ningún `.js` ni `.cjs` propio en el repo, así
que nada cambia de interpretación. Los docs de Next lo contemplan explícitamente. Warning eliminado;
las pruebas bajaron de ~293 ms a ~224 ms.

> Efecto colateral atendido: bajo ESM, `node -e "require('crypto')..."` deja de funcionar. Ese
> comando aparecía como instrucción para generar `ENCRYPTION_KEY` en `.env.example` y en el
> comentario de `lib/crypto.ts`. Los dos pasaron a una forma que anda en ambos modos:
> `node -e "import('node:crypto').then(c=>console.log(c.randomBytes(32).toString('hex')))"`.

**C-B — `typedRoutes: true` en `next.config.ts`.** Tipa los `href` de `<Link>` y los métodos de
`next/navigation` contra las rutas que existen de verdad: una ruta mal escrita pasa a ser error de
compilación en vez de un 404 en producción. Encaja con la Constitución §III, y `tsconfig.json` ya
tenía el `include` que hacía falta. Encontró **dos** puntos al activarse, los dos legítimos:

1. `src/app/login/actions.ts:48` — el destino del redirect sale de `?redirect=` en la query, así que
   no es literal y hay que afirmarlo con `as Route`, la salida que indica el doc para strings no
   literales. Lo que sostiene el cast es la validación que ya existía dos líneas arriba (debe
   empezar con una sola `/`), no la confianza en el string.
2. `src/components/app-shell.tsx` — `NavItem.href` era `string`. Se tipó como `Route`, y así **cada
   literal del arreglo `grupos` queda validado en su definición**: es el caso donde typedRoutes paga
   de verdad. Hubo que importar el tipo con alias (`Route as Ruta`) porque el nombre `Route` ya lo
   ocupa el icono de lucide que usa Viajes.

**C-C — Comentario en `serverExternalPackages`.** Se dejó anotado cuál de las dos entradas es
necesaria y cuál es defensiva, para que nadie la borre por "redundante" sin saber el costo.

## 7. Observaciones abiertas (no se tocaron)

**C1 — Las variables de entorno no se validan. → RESUELTO (2026-08-17).** Ver `src/lib/supabase/env.ts` y `pendientes.md` §3.1; queda abierta solo la parte de "¿romper el build?". Lo que sigue describe el problema original:

**C1 (original) — Las variables de entorno no se validan.** Los tres clientes de Supabase hacen
`process.env.NEXT_PUBLIC_SUPABASE_URL!` con aserción de no-nulo. Si en un despliegue nuevo falta la
variable, no hay un error claro: el proxy lo absorbe como "sin sesión" y el usuario ve un login que
nunca entra, mientras que un Server Component revienta con un mensaje de la librería, no del
sistema. Un chequeo al arranque que falle rápido y con nombre propio lo resolvería. **No se aplicó
porque cambia el comportamiento de despliegue** (fallar el build vs. arrancar degradado) y esa es una
decisión del dueño, no de una tarea de configuración. Relevante para la ambición multi-empresa: cada
despliegue nuevo es una oportunidad de pisar esto.

**C2 — No hay CLI de Supabase ni control de drift.** Las migraciones se corren a mano en el SQL
Editor. Funciona y está bien documentado archivo por archivo, pero nada verifica que la base
desplegada tenga aplicadas las 19. `npm run test:esquema` existe y es el gancho natural si alguna vez
se quiere automatizar.

## 8. Hallazgo funcional (fuera del alcance de T002)

**Dos rutas construidas no están enlazadas desde ninguna parte de la app.** `/cobranzas` y
`/finanzas` compilan y funcionan, pero ningún `<Link>` del proyecto apunta a ellas: solo se llega
escribiendo la URL a mano. El menú de `app-shell.tsx` tiene los grupos *Operación*, *Taxis* y
*Datos*; no hay grupo *Finanzas*.

No es un problema de configuración y no se tocó acá: agregar el grupo implica decidir etiquetas,
orden y agrupación, que es diseño de producto. Corresponde a la User Story 1 (T011–T014), que es
justamente la del dashboard operativo y financiero. Se anota para que no llegue a producción como
una sección que existe y nadie encuentra.

> **Cómo terminó (2026-08-17)**: la conclusión de arriba llevó a agregar un grupo *Finanzas* en el
> menú, y estaba mal. Las dos rutas **no son pantallas**: `/finanzas` redirige al Dashboard y
> `/cobranzas` a Clientes, porque su contenido se fusionó ahí. No había nada que enlazar; el grupo se
> eliminó. La observación original era correcta en los hechos (nadie las enlazaba) pero la
> conclusión no: la respuesta era mirar qué hacían esas rutas, no darles un menú.

---

## 9. Evidencia de validación

Los cuatro gates, con la configuración ya modificada:

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | sin errores |
| `npm run lint` | sin advertencias |
| `npm test` | **66/66**, sin el warning de Node |
| `npm run build` | compila con `typedRoutes`; 27 rutas + proxy |
