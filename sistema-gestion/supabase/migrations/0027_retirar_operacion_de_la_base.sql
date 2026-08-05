-- ============================================================================
-- 0027 — Retira de la base la operación diaria de encomiendas.
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ⚠️⚠️ ESTA MIGRACIÓN BORRA DATOS Y NO SE PUEDE DESHACER. ⚠️⚠️
--
-- Elimina encomienda_pedidos, encomienda_rutas y encomienda_paradas con todo su
-- contenido: nombres, teléfonos y direcciones de destinatarios, el orden de
-- visita y el historial de paradas. Eso es exactamente el objetivo (ver la
-- cabecera de la 0026: son datos personales de clientes de Starken que Pucarani
-- no necesita y que la Ley 21.719 la obligaría a custodiar), pero significa que
-- después de correr esto no hay vuelta atrás sin un respaldo.
--
-- NO se toca nada de la plata: encomienda_reglas_pago y encomienda_pagos quedan
-- intactas, y encomienda_actividad (0026) ya tiene el conteo por conductor y por
-- día del que salen los ingresos y las liquidaciones.
--
-- ----------------------------------------------------------------------------
-- ANTES DE CORRER ESTO — dos requisitos, en este orden:
--
-- 1. Cada conductor tiene que haber apretado "Traer a este teléfono" en
--    /conductor/encomiendas. Ese botón COPIA los pendientes al teléfono; no los
--    borra de acá, así que las filas siguen apareciendo abajo aunque el
--    traspaso ya se haya hecho. Solo el conductor puede confirmar que los ve en
--    su app.
--
-- 2. Correr esta consulta y GUARDAR el resultado (copiarlo a una planilla). Es
--    el único respaldo en papel de lo que está por borrarse:
--
--      select fecha_pedido, destinatario_nombre, destinatario_telefono,
--             destinatario_direccion, estado, notas
--        from encomienda_pedidos
--       order by estado, fecha_pedido desc;
--
-- Recién con esas dos cosas hechas, ejecutar el resto del archivo.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. Las funciones que operaban sobre esas tablas
--
-- Van primero y con "if exists" para que la migración sea re-ejecutable: al
-- borrar las tablas con cascade, los triggers se van solos, pero las funciones
-- de trigger quedan huérfanas en el esquema si no se las nombra.
-- ----------------------------------------------------------------------------

-- RPC que llamaba la app del conductor para cerrar una parada (0019, reescritas
-- en la 0025). Ahora el conductor inserta directo en encomienda_actividad, con
-- una policy en vez de una función SECURITY DEFINER: no hay nada que validar
-- contra otras filas.
drop function if exists encomienda_marcar_llamada(uuid, text);
drop function if exists encomienda_marcar_entrega(uuid, text);

-- Triggers de sincronización parada ↔ pedido (0017, 0018). Todo ese ida y
-- vuelta de estados vivía porque el pedido y su parada eran dos filas en dos
-- tablas que tenían que contarse la misma historia. En el teléfono es un solo
-- objeto y el problema no existe.
drop function if exists encomienda_parada_marcar_programado() cascade;
drop function if exists encomienda_parada_liberar_pedido() cascade;
drop function if exists encomienda_parada_sincronizar_pedido() cascade;

-- ----------------------------------------------------------------------------
-- 2. Las tablas
--
-- En orden de dependencia (paradas → rutas → pedidos). El cascade se lleva
-- también sus policies, índices y triggers.
-- ----------------------------------------------------------------------------
drop table if exists encomienda_paradas cascade;
drop table if exists encomienda_rutas cascade;
drop table if exists encomienda_pedidos cascade;

-- ----------------------------------------------------------------------------
-- 3. Verificación
--
-- Las tres primeras columnas deben quedar en false y las dos últimas en true.
-- Si alguna no cuadra, algo del retiro no se aplicó.
-- ----------------------------------------------------------------------------
select
  to_regclass('public.encomienda_pedidos') is not null as "pedidos_retirada_si_es_false",
  to_regclass('public.encomienda_rutas') is not null    as "rutas_retirada_si_es_false",
  to_regclass('public.encomienda_paradas') is not null  as "paradas_retirada_si_es_false",
  to_regclass('public.encomienda_actividad') is not null as "actividad_ok_si_es_true",
  to_regclass('public.encomienda_pagos') is not null     as "pagos_intactos_si_es_true";
