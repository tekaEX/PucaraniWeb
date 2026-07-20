-- ============================================================================
-- 0008 — La PATENTE pasa a ser EL identificador del vehículo (PK)
-- Ejecutar en Supabase > SQL Editor.
--
-- Decisión de diseño (del dueño): la patente nunca se digita mal porque el
-- ingreso queda validado con formato estricto (app + check en la base).
-- Con esto:
--   · vehiculos.id (uuid) desaparece; la PK es la patente en formato
--     canónico "ABCD-12" (nuevo) o "AB-1234" (antiguo).
--   · viaje_asignaciones.vehiculo_id y gastos_vehiculo.vehiculo_id pasan a
--     ser TEXT = la patente, con FK real (visible en el Schema Visualizer).
--   · ON UPDATE CASCADE: si algún día una patente cambia, toda la historia
--     la sigue automáticamente.
--   · Los triggers de la 0007 se reescriben para vincular por patente.
-- ============================================================================

-- Normaliza para comparar: "jklm-12" -> "JKLM12".
create or replace function normalizar_patente(t text) returns text
language sql immutable as $$
  select nullif(regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

-- Forma canónica de almacenamiento: "ABCD-12" / "AB-1234" (null si inválida).
create or replace function formatear_patente(t text) returns text
language plpgsql immutable as $$
declare
  n text := normalizar_patente(t);
begin
  if n ~ '^[A-Z]{4}[0-9]{2}$' then
    return substring(n, 1, 4) || '-' || substring(n, 5, 2);
  elsif n ~ '^[A-Z]{2}[0-9]{4}$' then
    return substring(n, 1, 2) || '-' || substring(n, 3, 4);
  end if;
  return null;
end $$;

do $$
begin
  -- --------------------------------------------------------------------------
  -- 1. Llevar las patentes existentes a la forma canónica
  -- --------------------------------------------------------------------------
  update vehiculos set patente = formatear_patente(patente)
   where formatear_patente(patente) is not null
     and patente <> formatear_patente(patente);

  if exists (select 1 from vehiculos where formatear_patente(patente) is null) then
    raise exception 'Hay vehículos con patente inválida: %. Corrígelas antes de migrar.',
      (select string_agg(patente, ', ') from vehiculos where formatear_patente(patente) is null);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. viaje_asignaciones.vehiculo_id: uuid -> patente (text)
-- ----------------------------------------------------------------------------
alter table viaje_asignaciones add column if not exists vehiculo_patente_tmp text;
update viaje_asignaciones a
   set vehiculo_patente_tmp = v.patente
  from vehiculos v
 where v.id = a.vehiculo_id;
alter table viaje_asignaciones drop column vehiculo_id;   -- cae unique/check/índice viejos
alter table viaje_asignaciones rename column vehiculo_patente_tmp to vehiculo_id;

-- ----------------------------------------------------------------------------
-- 3. gastos_vehiculo.vehiculo_id: uuid -> patente (text)
-- ----------------------------------------------------------------------------
alter table gastos_vehiculo add column if not exists vehiculo_patente_tmp text;
update gastos_vehiculo g
   set vehiculo_patente_tmp = v.patente
  from vehiculos v
 where v.id = g.vehiculo_id;
alter table gastos_vehiculo drop column vehiculo_id;
alter table gastos_vehiculo rename column vehiculo_patente_tmp to vehiculo_id;

-- ----------------------------------------------------------------------------
-- 4. vehiculos: PK = patente, con formato garantizado por la base
-- ----------------------------------------------------------------------------
drop index if exists vehiculos_patente_unica;
alter table vehiculos drop constraint vehiculos_pkey;
alter table vehiculos drop column id;
alter table vehiculos add primary key (patente);
alter table vehiculos add constraint vehiculos_patente_formato
  check (patente ~ '^[A-Z]{4}-[0-9]{2}$' or patente ~ '^[A-Z]{2}-[0-9]{4}$');

-- ----------------------------------------------------------------------------
-- 5. FKs nuevas (visibles en el visualizer) + índices
-- ----------------------------------------------------------------------------
alter table viaje_asignaciones
  add constraint asignaciones_vehiculo_fk
  foreign key (vehiculo_id) references vehiculos(patente)
  on update cascade on delete restrict;
alter table viaje_asignaciones
  add constraint asignaciones_chofer_o_vehiculo
  check (chofer_id is not null or vehiculo_id is not null);
alter table viaje_asignaciones
  add constraint asignaciones_unicas
  unique nulls not distinct (viaje_id, chofer_id, vehiculo_id, fecha);
create index if not exists idx_asignaciones_vehiculo on viaje_asignaciones (vehiculo_id);

alter table gastos_vehiculo
  add constraint gastos_vehiculo_fk
  foreign key (vehiculo_id) references vehiculos(patente)
  on update cascade on delete set null;
create index if not exists idx_gastos_vehiculo on gastos_vehiculo (vehiculo_id);

-- ----------------------------------------------------------------------------
-- 6. Triggers de vinculación por patente (reemplazan a los de la 0007)
-- ----------------------------------------------------------------------------
create or replace function gasto_vincular_por_patente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vehiculo_id is null and normalizar_patente(new.patente_detectada) is not null then
    select patente into new.vehiculo_id
    from vehiculos
    where empresa_id = new.empresa_id
      and normalizar_patente(patente) = normalizar_patente(new.patente_detectada)
    limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_gastos_vincular_patente on gastos_vehiculo;
create trigger trg_gastos_vincular_patente
  before insert or update of patente_detectada on gastos_vehiculo
  for each row execute function gasto_vincular_por_patente();

create or replace function vehiculo_adoptar_gastos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update gastos_vehiculo g
     set vehiculo_id = new.patente
   where g.vehiculo_id is null
     and g.empresa_id = new.empresa_id
     and normalizar_patente(g.patente_detectada) = normalizar_patente(new.patente);
  return new;
end $$;

drop trigger if exists trg_vehiculos_adoptar_gastos on vehiculos;
create trigger trg_vehiculos_adoptar_gastos
  after insert or update of patente on vehiculos
  for each row execute function vehiculo_adoptar_gastos();

-- ----------------------------------------------------------------------------
-- 7. Verificación
-- ----------------------------------------------------------------------------
select v.patente,
       (select count(*) from viaje_asignaciones a where a.vehiculo_id = v.patente) as asignaciones,
       (select count(*) from gastos_vehiculo g where g.vehiculo_id = v.patente)    as gastos
from vehiculos v
order by v.patente;
