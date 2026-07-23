-- ============================================================================
-- 0012 — Endurecimiento de funciones (Security Advisor de Supabase)
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Resuelve los avisos del linter de seguridad:
--   1) "Function Search Path Mutable": funciones sin search_path fijo pueden
--      ser engañadas si alguien crea objetos homónimos en otro esquema.
--   2) "Public/Signed-In Can Execute SECURITY DEFINER Function": Supabase da
--      EXECUTE a anon/authenticated por defecto al crear funciones; las de
--      trigger no son API y nadie debe poder llamarlas por /rest/v1/rpc.
--      (Los triggers siguen funcionando: el privilegio se exige al CREAR el
--      trigger, no al dispararse.)
--   3) next_cotizacion_numero sí es API (la usa la app al crear cotización),
--      pero ahora valida el rol por dentro y anon no puede llamarla.
--
-- El aviso "Leaked Password Protection Disabled" no es SQL: se activa en el
-- dashboard (Authentication > Providers > Email > Prevent leaked passwords).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) search_path fijo
-- ----------------------------------------------------------------------------
-- Cuerpos 100% pg_catalog: pueden vivir con search_path vacío.
alter function set_updated_at() set search_path = '';
alter function uuid_generate_v7() set search_path = '';
alter function normalizar_patente(text) set search_path = '';
-- Llama a normalizar_patente (en public), así que fija public.
alter function formatear_patente(text) set search_path = public;

-- ----------------------------------------------------------------------------
-- 2) Las funciones de trigger no se llaman por API
-- ----------------------------------------------------------------------------
revoke execute on function set_empresa_id() from public, anon, authenticated;
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function gasto_vincular_por_patente() from public, anon, authenticated;
revoke execute on function vehiculo_adoptar_gastos() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;

-- Utilitarias que solo usan la base y los defaults de columnas.
revoke execute on function uuid_generate_v7() from public, anon;
revoke execute on function normalizar_patente(text) from public, anon;
revoke execute on function formatear_patente(text) from public, anon;

-- ----------------------------------------------------------------------------
-- 3) next_cotizacion_numero: API real, con control de rol por dentro
-- ----------------------------------------------------------------------------
create or replace function next_cotizacion_numero()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned int;
begin
  -- Solo quienes pueden crear cotizaciones pueden consumir numeración.
  if (select private.get_rol()) not in ('admin', 'operador') then
    raise exception 'Sin permiso para asignar numeración de cotizaciones';
  end if;

  update empresa
    set proximo_numero_cotizacion = proximo_numero_cotizacion + 1
    where id = (select id from empresa order by created_at limit 1)
    returning proximo_numero_cotizacion - 1 into assigned;

  if assigned is null then
    select coalesce(max(numero), 1188) + 1 into assigned from cotizaciones;
  end if;

  return assigned;
end;
$$;

revoke execute on function next_cotizacion_numero() from public, anon;
grant execute on function next_cotizacion_numero() to authenticated;
