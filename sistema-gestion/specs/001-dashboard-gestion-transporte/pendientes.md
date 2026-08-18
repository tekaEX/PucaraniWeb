# Pendientes de ejecución

Todo lo que la Fase 1 (T001–T003) dejó **escrito pero sin ejecutar**, más las decisiones que quedaron
abiertas a propósito. Este archivo es la lista de "qué falta apretar", no un resumen de lo hecho: eso
está en `estructura-dependencias.md`, `configuracion.md` y `gates-validacion.md`.

Última actualización: 2026-08-17.

---

## 1. Migraciones escritas y sin correr

Las migraciones de este proyecto se corren **a mano en Supabase > SQL Editor**, en orden, y todas son
re-ejecutables. Ninguna de estas tres se ejecutó.

### `0040_sin_rol_contador.sql` — sin riesgo de datos

Quita las 8 policies RLS del rol `contador`, que era el único poder que ese rol tenía. No borra
tablas ni columnas ni filas. El código de la app ya no lo conoce.

- **Verificación 1 va a dar 1, no 0, si corrés esta antes que la 0041.** No es un fallo: la cuenta
  incluye la policy `encomienda_periodos_contador_read`, que vive en una tabla que se lleva la 0041.
  Corriendo las dos, da 0.
- Verificación 2 (perfiles con rol contador) debería dar vacío.

### `0041_retirar_encomiendas.sql` — ⚠️ DESTRUCTIVA, no se deshace sin respaldo

Retira lo que quedó del negocio de encomiendas, que se fue al proyecto Ares. Tres cosas:

| Qué | Cuánto |
|---|---|
| Job de pg_cron `encomienda-cerrar-jornadas` | 1 — **se sigue disparando todos los días** |
| Funciones `encomienda_*` en `public` y `private` | 11 |
| Tablas `encomienda_*` con sus índices, triggers y policies | 6 (+3 que la 0027 ya borró, por si un respaldo las revivió) |

**Antes de correrla**: la sección 0 del archivo es una consulta suelta que cuenta las filas de cada
tabla. Corré **solo eso** primero y mirá el resultado. `encomienda_pagos` e
`encomienda_ingresos_reales` son plata pagada a choferes, y `encomienda_actividad` tiene datos
personales de destinatarios. Si hay filas que le sirven a alguien, exportalas o mandale el respaldo a
Ares antes de seguir.

**Después de correrla**: `npm run test:esquema` tiene que pasar limpio. Hoy falla con 6 errores, y
eso está anotado como esperado en `pruebas/esquema.mjs` y `pruebas/README.md`.

### `0042_categorias_sin_encomiendas.sql` — toca datos, pero no borra historial

Saca `encomiendas` de las categorías de vehículo y de chofer: esa línea de
trabajo se fue al proyecto Ares y el valor quedó vivo en dos CHECK. Afecta a **1
vehículo** (queda sin categoría) y **3 filas de `chofer_categorias`** (se
borran). Son etiquetas, no historial.

Mientras no corra, la base sigue aceptando el valor viejo y `npm run test:datos`
marca ese vehículo como problema esperado.

> **Los tipos de servicio de taxi quedaron como estaban.** Una versión anterior
> de esta migración también recortaba `servicios_taxi.tipo` de 7 valores a 4; el
> dueño lo revirtió y el archivo se reescribió: los siete son los del talonario
> —seis casillas impresas más "Especial", que se escribe a mano— y siguen
> existiendo tal cual en la app, en el vale y en la base.

**Orden recomendado**: 0040 → 0041 → 0042 → `npm run test:esquema` y `npm run test:datos`.

---

## 2. Se activa solo al hacer push

**`.github/workflows/ci.yml`** (en la raíz del repo, no en `sistema-gestion/`). Desde el primer push
a `main` o el primer pull request, corre `lint → typecheck → test → build`. No necesita ningún secreto
configurado: el build usa dos valores de relleno para las variables públicas de Supabase, y se
verificó que pasa así. Si preferís que todavía no corra, borrá el archivo o sacale los disparadores
`push` y `pull_request` dejando solo `workflow_dispatch`.

---

## 3. Decisiones abiertas

Cosas que se encontraron, se documentaron y **no se tocaron** porque la decisión no es técnica.

### 3.1 Validar las variables de entorno al arrancar *(de T002, C1)* — ✅ CERRADO EN PARTE

Los tres clientes leían `process.env.NEXT_PUBLIC_SUPABASE_URL!` con aserción de no-nulo, y un
despliegue sin esas variables terminaba en un login que no entra nunca: el proxy absorbía el fallo
como "sin sesión", indistinguible de una contraseña equivocada.

**Ya no.** `src/lib/supabase/env.ts` las lee en un solo lugar y revienta nombrando la que falta
(probado en `6-auth.test.mjs`, incluida la variable creada pero vacía, que es el error fácil de
cometer en Vercel). El proxy la llama ANTES de su try/catch, que existe para Supabase caído y no para
una app mal configurada.

**Lo que sigue siendo decisión del dueño**: si además un despliegue mal configurado tiene que
**romper el build**. Hoy la app compila y arranca; falla al primer request, con el nombre de la
variable. Romper el build es más estricto y también más molesto (el build de CI usa valores de
relleno a propósito).

### 3.2 Control de drift de la base *(de T002, C2)*

No hay CLI de Supabase ni `config.toml`: las migraciones se corren a mano y nada verifica que la base
desplegada tenga aplicadas todas. `npm run test:esquema` es el gancho natural si alguna vez se quiere
automatizar. Con tres migraciones pendientes en la lista de arriba, el drift ya no es hipotético.

### 3.3 La arista de capa en `app-shell` *(de T001, H4)*

`src/components/app-shell.tsx:22` importa `logout` desde `@/app/login/actions`: es la única
dependencia que sube de capa en todo el repo. Sacarla obliga a mover esa Server Action a un módulo
compartido, rompiendo la co-locación que siguen las 10 `actions.ts`. Se recomendó dejarla como está;
queda anotada por si `login/` se mueve o se renombra.

### 3.4 `/cobranzas` y `/finanzas` no están en el menú *(de T002, §8)* — ✅ CERRADO, pero NO como decía

**Ninguna de las dos es una pantalla.** `/finanzas` redirige al Dashboard y `/cobranzas` a Clientes:
su contenido se fusionó ahí —el resumen financiero es el Dashboard, y el estado de cuenta vive en el
acordeón de cada cliente—. Las rutas se conservan solo para enlaces guardados.

Así que no faltaba un grupo en el menú: faltaba darse cuenta de que ya no había nada que enlazar. En
T011 se agregó igual un grupo *Finanzas* con "Resumen financiero" y "Cobranzas", dos ítems que
llevaban a otros dos ítems del mismo menú. **Se eliminó el 2026-08-17** (lo notó el dueño), y quedó
un comentario en `app-shell.tsx` para que no vuelva.

---

### 3.5 Clases de licencia guardadas antes de que hubiera validación *(de T039, US5)*

`actualizarLicencia` ahora normaliza las clases y **rechaza** lo que no sea una
clase de la Ley 18.290 (A1–A5, B, C, D, E, F). Las formas que la gente escribe
están cubiertas —"clase A-3, b" queda "A3, B", igual que "B y C" o "A-2/A-4"—
pero si alguna ficha vieja tiene algo que no se parece a ninguna clase, al
guardar la licencia de ese chofer va a aparecer el error en vez de guardarse.

**La decisión es**: se corrige a mano esa ficha (es lo esperado: hasta ahora no
se podía saber si el chofer estaba habilitado para manejar un bus), o se relaja
la validación a solo avisar. Se dejó rechazando.

### 3.6 La flota dada de baja dejó de alertar *(de T041, US5)*

La campana y los resúmenes de documentación ahora ignoran los vehículos y
choferes con `activo = false`. Es a propósito: sus papeles no se renuevan, y
antes la única forma de callar la alerta era borrar el registro con su
historial. **Efecto visible**: el número de la campana puede bajar de golpe la
primera vez que se abra la app con esto puesto.

---

## 4. Chequeo rápido de estado

```bash
npm run lint          # limpio (172 archivos)
npm run typecheck     # limpio
npm test              # 209/209
npm run build         # compila
npm run test:esquema  # 6 fallas ESPERADAS hasta que se corra la 0041
npm run test:datos    # 1 falla ESPERADA hasta que se corra la 0042
```
