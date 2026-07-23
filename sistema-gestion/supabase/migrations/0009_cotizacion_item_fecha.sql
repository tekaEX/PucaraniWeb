-- ============================================================================
-- 0009 — Líneas de cotización: fecha en vez de cantidad
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- La cantidad no aportaba (siempre 1). Se elimina y en su lugar cada línea
-- lleva una FECHA opcional (el día del servicio). Al aceptar la cotización,
-- esa fecha se usa como fecha_inicio del viaje generado. El total de la línea
-- pasa a ser simplemente su valor.
-- ============================================================================

alter table cotizacion_items add column if not exists fecha date;
alter table cotizacion_items drop column if exists cantidad;
