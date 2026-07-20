-- ============================================================================
-- REPARA TEXTO CON DOBLE CODIFICACIÓN ("CarreÃ±o" → "Carreño")
-- Ejecutar en Supabase > SQL Editor.
--
-- Causa: un .sql se ejecutó leyendo los bytes UTF-8 como Windows-1252, así
-- que "ñ" (C3 B1) quedó guardado como "Ã±". Este script revierte esa doble
-- codificación SOLO en los valores afectados (los que contienen 'Ã'), por lo
-- que es seguro re-ejecutarlo: el texto ya correcto no se toca.
-- ============================================================================

create or replace function pg_temp.fixenc(t text) returns text
language sql as $$
  select convert_from(convert_to(t, 'WIN1252'), 'UTF8')
$$;

-- Empresa (aquí está el "CarreÃ±o" del membrete del PDF)
update empresa set nombre        = pg_temp.fixenc(nombre)        where nombre        ~ 'Ã';
update empresa set razon_social  = pg_temp.fixenc(razon_social)  where razon_social  ~ 'Ã';
update empresa set giro          = pg_temp.fixenc(giro)          where giro          ~ 'Ã';
update empresa set direccion     = pg_temp.fixenc(direccion)     where direccion     ~ 'Ã';
update empresa set ciudad        = pg_temp.fixenc(ciudad)        where ciudad        ~ 'Ã';
update empresa set representante = pg_temp.fixenc(representante) where representante ~ 'Ã';

-- Barrido de seguridad por el resto de las tablas con texto libre
update clientes set nombre           = pg_temp.fixenc(nombre)           where nombre           ~ 'Ã';
update clientes set direccion        = pg_temp.fixenc(direccion)        where direccion        ~ 'Ã';
update clientes set contacto_nombre  = pg_temp.fixenc(contacto_nombre)  where contacto_nombre  ~ 'Ã';
update clientes set notas            = pg_temp.fixenc(notas)            where notas            ~ 'Ã';

update choferes set nombre = pg_temp.fixenc(nombre) where nombre ~ 'Ã';
update choferes set notas  = pg_temp.fixenc(notas)  where notas  ~ 'Ã';

update vehiculos set marca  = pg_temp.fixenc(marca)  where marca  ~ 'Ã';
update vehiculos set modelo = pg_temp.fixenc(modelo) where modelo ~ 'Ã';
update vehiculos set notas  = pg_temp.fixenc(notas)  where notas  ~ 'Ã';

update cotizaciones set titulo   = pg_temp.fixenc(titulo)   where titulo   ~ 'Ã';
update cotizaciones set nota_pie = pg_temp.fixenc(nota_pie) where nota_pie ~ 'Ã';
update cotizaciones set autor    = pg_temp.fixenc(autor)    where autor    ~ 'Ã';

update cotizacion_items set descripcion = pg_temp.fixenc(descripcion) where descripcion ~ 'Ã';

update viajes set descripcion = pg_temp.fixenc(descripcion) where descripcion ~ 'Ã';
update viajes set notas       = pg_temp.fixenc(notas)       where notas       ~ 'Ã';

update facturas set notas = pg_temp.fixenc(notas) where notas ~ 'Ã';

update gastos_vehiculo set descripcion            = pg_temp.fixenc(descripcion)            where descripcion            ~ 'Ã';
update gastos_vehiculo set proveedor_razon_social = pg_temp.fixenc(proveedor_razon_social) where proveedor_razon_social ~ 'Ã';

update perfiles set nombre = pg_temp.fixenc(nombre) where nombre ~ 'Ã';

drop function pg_temp.fixenc(text);

-- Verificación: no debería quedar ninguna fila con mojibake.
select 'empresa' as tabla, count(*) as afectadas from empresa
  where coalesce(nombre,'') || coalesce(razon_social,'') || coalesce(giro,'') ~ 'Ã'
union all
select 'clientes', count(*) from clientes where coalesce(nombre,'') || coalesce(direccion,'') ~ 'Ã'
union all
select 'choferes', count(*) from choferes where nombre ~ 'Ã'
union all
select 'viajes', count(*) from viajes where descripcion ~ 'Ã'
union all
select 'cotizaciones', count(*) from cotizaciones where coalesce(titulo,'') || coalesce(nota_pie,'') ~ 'Ã';
