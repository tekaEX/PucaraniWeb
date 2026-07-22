-- ============================================================================
-- 0007 — Vinculación automática gasto ↔ vehículo POR PATENTE
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ⚠️ SUPERSEDIDA por 0008: ahí la patente pasa a ser la PK del vehículo y estos
-- triggers se recrean para usar la patente en vez del uuid. En una instalación
-- nueva basta con ejecutar 0006 → 0007 → 0008 en orden. NO re-ejecutar 0007
-- después de 0008 (asume una columna `vehiculos.id` que 0008 elimina).
--
-- El id (uuid) sigue siendo el FK interno (si corriges una patente mal
-- escrita, los gastos no se pierden). La PATENTE pasa a ser la llave de
-- negocio que vincula solos a los gastos:
--   1. Un gasto que llega con patente (SII) y sin vehículo se engancha al
--      vehículo cuya patente coincida.
--   2. Al crear un vehículo (o corregir su patente), adopta automáticamente
--      los gastos huérfanos que traían esa patente.
--   3. Repara de inmediato los huérfanos existentes.
-- Las patentes se comparan normalizadas: "jklm-12" = "JKLM12" = "JKLM-12".
-- ============================================================================

create or replace function normalizar_patente(t text) returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(coalesce(t, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

-- 1) Gasto nuevo (o con patente corregida): resolver vehículo por patente.
--    Nombre con 'v' para que corra DESPUÉS de trg_gastos_empresa (orden alfabético).
create or replace function gasto_vincular_por_patente() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vehiculo_id is null and normalizar_patente(new.patente_detectada) is not null then
    select id into new.vehiculo_id
    from vehiculos
    where empresa_id = new.empresa_id
      and normalizar_patente(patente) = normalizar_patente(new.patente_detectada)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gastos_vincular_patente on gastos_vehiculo;
create trigger trg_gastos_vincular_patente
  before insert or update of patente_detectada on gastos_vehiculo
  for each row execute function gasto_vincular_por_patente();

-- 2) Vehículo nuevo o patente corregida: adoptar gastos huérfanos.
create or replace function vehiculo_adoptar_gastos() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update gastos_vehiculo g
     set vehiculo_id = new.id
   where g.vehiculo_id is null
     and g.empresa_id = new.empresa_id
     and normalizar_patente(g.patente_detectada) = normalizar_patente(new.patente);
  return new;
end;
$$;

drop trigger if exists trg_vehiculos_adoptar_gastos on vehiculos;
create trigger trg_vehiculos_adoptar_gastos
  after insert or update of patente on vehiculos
  for each row execute function vehiculo_adoptar_gastos();

-- 3) Reparación inmediata: enganchar los gastos huérfanos que ya existan.
update gastos_vehiculo g
   set vehiculo_id = v.id
  from vehiculos v
 where g.vehiculo_id is null
   and v.empresa_id = g.empresa_id
   and normalizar_patente(v.patente) = normalizar_patente(g.patente_detectada);

-- Verificación: gastos que quedaron sin vehículo (patente aún no registrada).
select g.patente_detectada, count(*) as gastos_sin_vehiculo, sum(g.monto_total) as monto
from gastos_vehiculo g
where g.vehiculo_id is null
group by g.patente_detectada
order by monto desc;
