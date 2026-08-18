-- ============================================================================
-- 0042 — 'encomiendas' fuera de las categorías de vehículo y de chofer
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Esa línea de trabajo se fue al proyecto Ares, pero el valor quedó vivo en dos
-- CHECK y en filas reales. La categoría del vehículo, además, ya no filtra nada
-- en la app: es una etiqueta que dice dónde se ocupa.
--
-- LO QUE TOCA DATOS (mirar antes de correr, sección 0):
--   · vehiculos con categoria='encomiendas' → quedan sin categoría (null)
--   · chofer_categorias con categoria='encomiendas' → se borran esas filas
--
-- Al 2026-08-17 en la base real eso es: 1 vehículo y 3 filas de chofer_categorias.
--
-- NOTA — los tipos de servicio de taxi NO se tocan. Una versión anterior de
-- este archivo recortaba `servicios_taxi.tipo` de 7 valores a 4; el dueño lo
-- revirtió: los siete son los del talonario y siguen existiendo, con
-- 'especial' como la línea que se escribe a mano en el vale.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Qué se va a tocar (correr SOLO esto primero y mirar el resultado)
-- ----------------------------------------------------------------------------
-- select 'vehiculos' as tabla, categoria as valor, count(*)
--   from vehiculos where categoria = 'encomiendas' group by categoria
-- union all
-- select 'chofer_categorias', categoria, count(*)
--   from chofer_categorias where categoria = 'encomiendas' group by categoria;

-- ----------------------------------------------------------------------------
-- 1. Vehículos: la categoría retirada queda en null
-- ----------------------------------------------------------------------------
update vehiculos set categoria = null where categoria = 'encomiendas';

alter table vehiculos drop constraint if exists vehiculos_categoria_valida;
alter table vehiculos add constraint vehiculos_categoria_valida
  check (categoria is null or categoria in ('operacion', 'taxis'));

-- ----------------------------------------------------------------------------
-- 2. Choferes: se borran las filas de esa categoría
-- ----------------------------------------------------------------------------
delete from chofer_categorias where categoria = 'encomiendas';

-- El check de la 0020 se creó dentro del CREATE TABLE, así que su nombre lo
-- puso Postgres. En vez de adivinarlo, se busca por lo que dice.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'chofer_categorias'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%encomiendas%'
  loop
    execute format('alter table chofer_categorias drop constraint %I', c.conname);
  end loop;
end $$;

alter table chofer_categorias drop constraint if exists chofer_categorias_categoria_valida;
alter table chofer_categorias add constraint chofer_categorias_categoria_valida
  check (categoria in ('operacion', 'taxis'));

-- ----------------------------------------------------------------------------
-- 3. Verificación (debe dar 0 filas en las dos)
-- ----------------------------------------------------------------------------
-- select count(*) from vehiculos where categoria = 'encomiendas';
-- select count(*) from chofer_categorias where categoria = 'encomiendas';

-- Después de correrla, en vehiculo-accordion.tsx sobra el camino defensivo de
-- esCategoriaConocida(): ya no puede haber una categoría que la app no conozca.
