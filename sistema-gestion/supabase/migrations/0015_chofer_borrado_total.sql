-- ============================================================================
-- 0015 — Permitir borrado total de un chofer (con historial)
-- Ejecutar en Supabase > SQL Editor.
--
-- Mismo patrón que la 0014 para vehículos: viaje_asignaciones.chofer_id pasa
-- de "on delete restrict" a "on delete set null", y un trigger borra las
-- filas que quedarían sin chofer NI vehículo (no aportan nada ya). Las filas
-- que además tienen vehiculo_id se conservan, solo pierden el chofer.
-- ============================================================================

create or replace function chofer_purgar_asignaciones_huerfanas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from viaje_asignaciones
   where chofer_id = old.id
     and vehiculo_id is null;
  return old;
end $$;

drop trigger if exists trg_chofer_purgar_asignaciones on choferes;
create trigger trg_chofer_purgar_asignaciones
  before delete on choferes
  for each row execute function chofer_purgar_asignaciones_huerfanas();

revoke execute on function chofer_purgar_asignaciones_huerfanas() from public, anon, authenticated;

alter table viaje_asignaciones drop constraint if exists viaje_asignaciones_chofer_id_fkey;
alter table viaje_asignaciones
  add constraint asignaciones_chofer_fk
  foreign key (chofer_id) references choferes(id)
  on delete set null;
