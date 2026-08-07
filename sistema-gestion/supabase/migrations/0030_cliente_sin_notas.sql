-- ============================================================================
-- 0030 — Saca las notas de los clientes.
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ⚠️ ESTA MIGRACIÓN BORRA UNA COLUMNA Y SU CONTENIDO. No se puede deshacer sin
--    un respaldo.
--
-- Al momento de escribirla la columna estaba VACÍA: 1 cliente en la base, 0 con
-- notas escritas. Así que correrla no pierde nada. Pero eso fue cierto en un
-- momento concreto: si pasó tiempo, comprobalo antes con
--
--      select nombre, notas from clientes where notas is not null and notas <> '';
--
-- y recién si sale vacío, corré el resto.
--
-- El campo ya no existe en la app: se fue de la ficha del cliente, del panel de
-- la lista, del tipo Cliente y de la server action que guardaba. La columna
-- quedaría huérfana, y una columna que nadie escribe ni lee es de las que
-- después nadie sabe si se puede tocar.
-- ============================================================================

alter table clientes drop column if exists notas;

-- ----------------------------------------------------------------------------
-- Verificación: tiene que dar false.
-- ----------------------------------------------------------------------------
select exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'clientes' and column_name = 'notas'
) as "notas_retirada_si_es_false";
