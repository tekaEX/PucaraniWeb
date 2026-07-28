-- ============================================================================
-- 0016 — Categoría de vehículo (dónde se va a ocupar)
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Clasifica cada vehículo en una línea de trabajo: operación, taxis o
-- encomiendas. Es texto + check (no un enum de Postgres) siguiendo el mismo
-- patrón que servicios_taxi.tipo (migración 0010): agregar una categoría
-- nueva más adelante es un simple DROP/ADD CONSTRAINT, sin las limitaciones
-- de los enums nativos (que solo permiten agregar valores, nunca quitarlos).
--
-- Los vehículos existentes quedan con categoria = null ("Sin categoría"):
-- se clasifican a mano, no se asume un valor por defecto.
-- ============================================================================

alter table vehiculos add column if not exists categoria text;

alter table vehiculos drop constraint if exists vehiculos_categoria_valida;
alter table vehiculos add constraint vehiculos_categoria_valida
  check (categoria is null or categoria in ('operacion', 'taxis', 'encomiendas'));

create index if not exists idx_vehiculos_categoria on vehiculos (categoria);
