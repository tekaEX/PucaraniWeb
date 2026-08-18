-- ============================================================================
-- 0040 — Retira el rol 'contador'.
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- El rol venía de la 0006 pensado para el contador externo: lectura de
-- facturas, cotizaciones, viajes, gastos y adjuntos, sin poder escribir nada y
-- sin ver sii_credenciales. Nunca se usó. Y la app nunca implementó ese "solo
-- lectura": el panel solo pregunta por ROLES_PANEL, así que un contador habría
-- visto todos los botones de crear, editar y borrar, y recién al guardar le
-- habría fallado la operación contra estas policies. Un rol a medio construir
-- que no le sirve a nadie es una puerta que después nadie sabe si está cerrada.
--
-- Lo que se va acá son sus permisos, que es lo único que el rol podía hacer.
--
-- ⚠️ Lo que NO se puede ir: el valor 'contador' del enum rol_usuario. Postgres
--    no tiene ALTER TYPE ... DROP VALUE, y sacarlo de verdad obliga a recrear
--    el tipo, lo que exige un DROP FUNCTION private.get_rol() CASCADE que se
--    llevaría por delante las ~28 policies de toda la base para recrearlas a
--    mano. Riesgo real (dejar una tabla sin RLS o abierta de más) a cambio de
--    cero: un valor de enum, por sí solo, no da acceso a nada. Queda igual que
--    'chofer' desde que se fue encomiendas: existe en el tipo, no lo tiene
--    nadie, no le queda ninguna policy y src/lib/auth.ts no lo deja al panel.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Policies de lectura del contador — tablas de negocio (0006)
-- ----------------------------------------------------------------------------
drop policy if exists cotizaciones_contador_read     on cotizaciones;
drop policy if exists cotizacion_items_contador_read on cotizacion_items;
drop policy if exists facturas_contador_read         on facturas;
drop policy if exists viajes_contador_read           on viajes;
drop policy if exists asignaciones_contador_read     on viaje_asignaciones;
drop policy if exists gastos_contador_read           on gastos_vehiculo;

-- ----------------------------------------------------------------------------
-- 2) Área taxis (0010)
-- ----------------------------------------------------------------------------
drop policy if exists servicios_taxi_contador_read on servicios_taxi;

-- ----------------------------------------------------------------------------
-- 3) Storage: lectura de los PDF de facturas (0006)
-- ----------------------------------------------------------------------------
drop policy if exists "storage_adjuntos_contador_read" on storage.objects;

-- ----------------------------------------------------------------------------
-- Verificación 1: ninguna policy debe seguir nombrando al rol. Debe dar 0.
--
-- OJO si todavía no corriste la 0041: encomienda_periodos_facturacion tiene una
-- policy encomienda_periodos_contador_read y esta cuenta va a dar 1, no 0. No
-- es un fallo de esta migración — esa tabla es de un negocio que ya no existe
-- acá y se la lleva la 0041. Después de correr las dos, da 0.
-- ----------------------------------------------------------------------------
select count(*) as "policies_con_contador_debe_ser_0"
  from pg_policies
 where schemaname in ('public', 'storage')
   and coalesce(qual, '') || coalesce(with_check, '') like '%contador%';

-- ----------------------------------------------------------------------------
-- Verificación 2: cuentas que hubieran quedado con ese rol. Lo esperable es 0.
-- Si sale alguna, esa persona ya no entra al panel (el login la rechaza) y no
-- lee ningún dato: hay que reasignarle rol o darla de baja a mano.
-- ----------------------------------------------------------------------------
select id, nombre, activo
  from perfiles
 where rol = 'contador';
