-- ============================================================================
-- 0014 — Permitir borrado total de un vehículo (con historial)
-- Ejecutar en Supabase > SQL Editor.
--
-- Antes: viaje_asignaciones.vehiculo_id -> vehiculos(patente) era
-- "on delete restrict", así que un vehículo con viajes asignados NO se podía
-- eliminar (el intento fallaba en silencio en la app: ver fix del server
-- action). Decisión del dueño: se distinguen dos casos al eliminar un
-- vehículo con historial —
--   1) "Ya no se va a ocupar" -> no se elimina, se marca activo=false.
--   2) "Eliminar todo el registro" -> borrado real, avisando antes.
-- Para que el caso 2 funcione sin perder el historial de los CHOFERES:
--   · Filas de viaje_asignaciones que además tienen chofer_id: se conservan,
--     solo se les limpia el vehiculo_id (queda "sin vehículo asignado").
--   · Filas que eran SOLO de este vehículo (sin chofer): se eliminan del
--     todo, porque no queda nada útil que conservar.
-- gastos_vehiculo no cambia: ya era "on delete set null" (los gastos son
-- registros financieros de la empresa, se conservan huérfanos).
-- ============================================================================

create or replace function vehiculo_purgar_asignaciones_huerfanas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from viaje_asignaciones
   where vehiculo_id = old.patente
     and chofer_id is null;
  return old;
end $$;

drop trigger if exists trg_vehiculo_purgar_asignaciones on vehiculos;
create trigger trg_vehiculo_purgar_asignaciones
  before delete on vehiculos
  for each row execute function vehiculo_purgar_asignaciones_huerfanas();

revoke execute on function vehiculo_purgar_asignaciones_huerfanas() from public, anon, authenticated;

alter table viaje_asignaciones drop constraint if exists asignaciones_vehiculo_fk;
alter table viaje_asignaciones
  add constraint asignaciones_vehiculo_fk
  foreign key (vehiculo_id) references vehiculos(patente)
  on update cascade on delete set null;
