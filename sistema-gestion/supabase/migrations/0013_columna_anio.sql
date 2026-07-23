-- ============================================================================
-- 0013 — vehiculos: la columna del año vuelve a llamarse "anio"
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- La auditoría del esquema vivo (2026-07-23) encontró la columna renombrada a
-- "año" (con ñ) — probablemente desde el editor de tablas. La app, los tipos
-- y el seed usan "anio": con la columna en "año", la ficha de vehículos
-- muestra el año vacío y GUARDAR un vehículo falla. Los identificadores con
-- caracteres no ASCII también obligan a comillas en todo SQL manual: mala
-- idea en general. El check constraint sigue al rename automáticamente.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehiculos' and column_name = 'año'
  ) then
    alter table vehiculos rename column "año" to anio;
  end if;
end $$;
