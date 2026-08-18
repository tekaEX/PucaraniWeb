-- ============================================================================
-- 0050 — Cada cuenta ve SOLO su empresa
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- El problema que resuelve, tal cual se veía: cargar datos con una cuenta los
-- hacía aparecer en TODAS las demás. No era un bug de la app — era el esquema.
-- Desde la 0006 la base tiene `empresa_id` en cada tabla, pero nada lo usaba
-- para decidir quién ve qué:
--
--   · set_empresa_id() rellenaba con `select id from empresa order by
--     created_at limit 1` — la empresa MÁS VIEJA, sin mirar quién insertaba.
--     Todas las filas de todos los usuarios caían en la misma empresa.
--   · Las policies de los catálogos eran `using (true)`: cualquier autenticado
--     leía clientes, choferes y vehículos completos.
--   · Las transaccionales miraban solo el ROL: cualquier admin u operador veía
--     cotizaciones, facturas, viajes, gastos y taxis de todos.
--
-- O sea: `empresa_id` estaba escrito en cada fila y no filtraba nada. Un
-- multi-tenant a medio construir es peor que ninguno, porque la columna hace
-- creer que la separación existe.
--
-- Lo que hace esta migración:
--   1. `perfiles.empresa_id` — a qué empresa pertenece cada cuenta.
--   2. `private.get_empresa()` — la empresa del usuario actual, para las RLS.
--   3. set_empresa_id() pasa a usar la empresa de QUIEN INSERTA, y si no la
--      puede determinar FALLA en vez de adivinar la más vieja.
--   4. handle_new_user() adopta la empresa del chofer pre-registrado con ese
--      correo (así el flujo de invitación sigue funcionando).
--   5. Todas las policies filtran por empresa, además del rol.
--   6. next_cotizacion_numero() consume la numeración de SU empresa.
--   7. Índices en las columnas que ahora usan las RLS.
--   8. Storage: `certificados` y `adjuntos` quedan separados por carpeta de
--      empresa.
--
-- NO cambia nada de lo que ya existe: la única empresa actual se conserva y
-- todos los perfiles quedan dentro de ella. Después de correr esto la app se
-- comporta igual que antes hasta que exista una segunda empresa.
--
-- ⚠️ Límite que queda en pie a propósito: `vehiculos.patente` es la PK global
--    (migración 0008), así que dos empresas no pueden registrar la misma
--    patente. Igual con `choferes.email`, que es único global. Para el uso de
--    hoy (una empresa real + una de pruebas) no molesta; volverlas compuestas
--    obliga a recrear las FKs de gastos_vehiculo y viaje_asignaciones, y eso es
--    otra migración.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. perfiles.empresa_id — la cuenta pertenece a una empresa
-- ----------------------------------------------------------------------------
alter table perfiles
  add column if not exists empresa_id uuid references empresa(id) on delete cascade;

-- Backfill: todos los perfiles existentes quedan en la empresa actual. Es la
-- única que hay, y es la que hasta ahora estaban viendo.
update perfiles
   set empresa_id = (select id from empresa order by created_at limit 1)
 where empresa_id is null;

-- Sin empresa no hay a qué filtrar: la columna que decide el acceso no puede
-- ser nullable, o un perfil a medio crear vería (o escribiría) en el vacío.
alter table perfiles alter column empresa_id set not null;

-- ----------------------------------------------------------------------------
-- 2. private.get_empresa() — la empresa del usuario actual
--
-- Mismo patrón que private.get_rol() de la 0006: SECURITY DEFINER para leer
-- `perfiles` sin que la RLS de esa tabla se llame a sí misma, en el esquema
-- `private` que la API REST no expone, y con el chequeo de auth.uid() ADENTRO
-- de la función (una security definer sin ese filtro es una puerta abierta).
-- ----------------------------------------------------------------------------
create or replace function private.get_empresa()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from perfiles where id = auth.uid() and activo;
$$;

revoke all on function private.get_empresa() from public;
grant execute on function private.get_empresa() to authenticated;

-- ----------------------------------------------------------------------------
-- 2b. Helpers para las tablas HIJAS (las que no tienen empresa_id propio)
--
-- cotizacion_items, viaje_asignaciones y chofer_categorias no tienen empresa_id:
-- su empresa es la de su fila padre. Lo natural seria escribirlo en la policy
-- como una subconsulta -- `viaje_id in (select id from viajes where empresa_id =
-- ...)` -- y para dos de las tres funcionaria, pero para viaje_asignaciones NO:
--
--   consulta a viajes -> policy viajes_chofer_read (que consulta
--   viaje_asignaciones) -> policy de viaje_asignaciones (que consultaria viajes)
--   -> policy de viajes -> ...
--
-- Postgres corta eso con "infinite recursion detected in policy for relation" y
-- la pantalla de viajes deja de cargar. El ciclo no existia antes porque la
-- policy de asignaciones solo miraba el rol, sin nombrar a viajes.
--
-- Estas funciones lo rompen: al ser SECURITY DEFINER leen la tabla padre SIN
-- volver a pasar por su RLS, asi que ninguna policy se llama a si misma. De paso
-- validan el vinculo real con el padre -- no alcanza con que quien escribe
-- pertenezca a la empresa: la fila padre tiene que ser de esa empresa --, que es
-- justo lo que una columna empresa_id denormalizada en la hija no garantizaria.
--
-- El control de identidad va adentro, via get_empresa(): sin sesion devuelve
-- null, `empresa_id = null` nunca es verdadero y la funcion responde false.
-- ----------------------------------------------------------------------------
create or replace function private.mi_cotizacion(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cotizaciones
     where id = p_id and empresa_id = private.get_empresa()
  );
$$;

create or replace function private.mi_viaje(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from viajes
     where id = p_id and empresa_id = private.get_empresa()
  );
$$;

create or replace function private.mi_chofer(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from choferes
     where id = p_id and empresa_id = private.get_empresa()
  );
$$;

revoke all on function private.mi_cotizacion(uuid) from public;
revoke all on function private.mi_viaje(uuid)      from public;
revoke all on function private.mi_chofer(uuid)     from public;
grant execute on function private.mi_cotizacion(uuid) to authenticated;
grant execute on function private.mi_viaje(uuid)      to authenticated;
grant execute on function private.mi_chofer(uuid)     to authenticated;

-- ----------------------------------------------------------------------------
-- 3. set_empresa_id() — la empresa de quien inserta, y si no se sabe, error
--
-- El cambio de fondo de toda la migración está en el segundo `if`. Antes esta
-- función adivinaba (la empresa más vieja); ahora, si no puede determinar la
-- empresa, aborta el insert. Adivinar es lo que metía las filas de una cuenta
-- en la empresa de otra, y encima en silencio: la fila quedaba guardada, solo
-- que en la empresa equivocada.
--
-- Quien inserta pasando `empresa_id` explícito (la semilla de datos de prueba,
-- una carga administrativa desde el SQL Editor) no se ve afectado: el primer
-- `if` no se cumple y la fila va a la empresa que se pidió.
-- ----------------------------------------------------------------------------
create or replace function set_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is null then
    new.empresa_id := private.get_empresa();
  end if;

  if new.empresa_id is null then
    raise exception
      'No se pudo determinar la empresa de la fila en %: la sesión no tiene perfil activo con empresa_id. Pasá empresa_id explícito si insertás desde el SQL Editor.',
      tg_table_name
      using errcode = 'not_null_violation';
  end if;

  return new;
end;
$$;

-- Función de trigger: no es API. (El privilegio se exige al CREAR el trigger,
-- no al dispararse — ver el encabezado de la 0012.)
revoke execute on function set_empresa_id() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. handle_new_user() — a qué empresa entra una cuenta nueva
--
-- Orden de decisión:
--   a) Si el correo ya está pre-registrado en `choferes.email`, la cuenta entra
--      a la empresa de ESE chofer. Es el flujo de invitación de la 0020: el
--      admin anota el correo del chofer y el chofer después se registra. Sin
--      esto el chofer caería en otra empresa y no vería ni sus propios viajes.
--   b) Si no, entra a la empresa más antigua, que es lo que pasaba hasta ahora.
--
-- Para vender esto como SaaS falta el paso (c): que un registro sin invitación
-- CREE su propia empresa en vez de entrar a la de otro. No se hace acá porque
-- cambia el significado del formulario de registro (pasa a ser "dar de alta una
-- empresa"), y hoy la única puerta de entrada legítima es la invitación.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  select c.empresa_id into v_empresa
    from choferes c
   where c.email is not null
     and lower(c.email) = lower(new.email)
   limit 1;

  if v_empresa is null then
    select id into v_empresa from empresa order by created_at limit 1;
  end if;

  insert into perfiles (id, nombre, rol, empresa_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1), 'Usuario'),
    case
      when exists (select 1 from perfiles where rol = 'admin') then 'operador'::rol_usuario
      else 'admin'::rol_usuario
    end,
    v_empresa
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function handle_new_user() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. next_cotizacion_numero() — numeración por empresa
--
-- Antes incrementaba el contador de la empresa más vieja: dos empresas se
-- habrían pisado la numeración de cotizaciones entre sí.
-- ----------------------------------------------------------------------------
create or replace function next_cotizacion_numero()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  assigned  int;
begin
  if (select private.get_rol()) not in ('admin', 'operador') then
    raise exception 'Sin permiso para asignar numeración de cotizaciones';
  end if;

  v_empresa := private.get_empresa();
  if v_empresa is null then
    raise exception 'La cuenta no tiene empresa asignada';
  end if;

  update empresa
     set proximo_numero_cotizacion = proximo_numero_cotizacion + 1
   where id = v_empresa
  returning proximo_numero_cotizacion - 1 into assigned;

  if assigned is null then
    select coalesce(max(numero), 1188) + 1 into assigned
      from cotizaciones where empresa_id = v_empresa;
  end if;

  return assigned;
end;
$$;

revoke execute on function next_cotizacion_numero() from public, anon;
grant execute on function next_cotizacion_numero() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Índices para las columnas que ahora filtran las RLS
--
-- Cada policy agrega `empresa_id = private.get_empresa()` a TODA consulta de la
-- tabla. Varias tablas ya tenían un compuesto que empieza por empresa_id
-- (idx_cotizaciones_fecha, idx_facturas_emision, idx_viajes_fecha,
-- idx_gastos_empresa_fecha, servicios_taxi_fecha_idx) y sirven tal cual. Los
-- que faltaban son los catálogos, donde los únicos que había son PARCIALES
-- (`where codigo is not null`) y por eso no cubren el filtro solo.
-- ----------------------------------------------------------------------------
create index if not exists idx_perfiles_empresa  on perfiles  (empresa_id);
create index if not exists idx_clientes_empresa  on clientes  (empresa_id);
create index if not exists idx_choferes_empresa  on choferes  (empresa_id);
create index if not exists idx_vehiculos_empresa on vehiculos (empresa_id);

-- ----------------------------------------------------------------------------
-- 7. Policies: rol + empresa
--
-- Se reemplazan TODAS (drop + create) en vez de agregar una policy nueva:
-- varias policies sobre la misma tabla y acción se combinan con OR, así que
-- sumar una "policy de empresa" al lado de las viejas no habría filtrado nada.
--
-- `(select private.get_empresa())` va envuelto en subconsulta a propósito: así
-- Postgres la evalúa UNA vez por consulta en vez de una por fila. Es el mismo
-- motivo por el que la 0006 escribe `(select private.get_rol())`.
-- ----------------------------------------------------------------------------

-- perfiles ---------------------------------------------------------------------
-- El self_read se conserva igual: cada cuenta lee su propia fila, y es la
-- consulta con la que lib/auth.ts resuelve el rol (y ahora la empresa) antes de
-- saber cuál es su empresa. Filtrarla por empresa sería circular.
drop policy if exists perfiles_self_read on perfiles;
create policy perfiles_self_read on perfiles for select to authenticated
  using (id = (select auth.uid()));

-- El admin administra las cuentas de SU empresa, no las de todas.
drop policy if exists perfiles_admin_all on perfiles;
create policy perfiles_admin_all on perfiles for all to authenticated
  using (
    (select private.get_rol()) = 'admin'
    and empresa_id = (select private.get_empresa())
  )
  with check (
    (select private.get_rol()) = 'admin'
    and empresa_id = (select private.get_empresa())
  );

-- empresa ---------------------------------------------------------------------
-- Una sola fila visible: la propia. Con esto, los `select ... from empresa
-- limit 1` que hay en la app devuelven la empresa del usuario sin cambiar nada.
drop policy if exists empresa_read_auth on empresa;
create policy empresa_read_auth on empresa for select to authenticated
  using (id = (select private.get_empresa()));

-- Solo UPDATE de la propia. Crear empresas no es una operación de la app:
-- el `with check` sobre la misma fila lo impide (una fila nueva nunca es ya la
-- empresa del usuario). Las empresas se crean por migración/semilla.
drop policy if exists empresa_write_admin_op on empresa;
create policy empresa_write_admin_op on empresa for all to authenticated
  using (
    id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- clientes --------------------------------------------------------------------
drop policy if exists clientes_read_auth on clientes;
create policy clientes_read_auth on clientes for select to authenticated
  using (empresa_id = (select private.get_empresa()));

drop policy if exists clientes_write_admin_op on clientes;
create policy clientes_write_admin_op on clientes for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- choferes --------------------------------------------------------------------
drop policy if exists choferes_read_auth on choferes;
create policy choferes_read_auth on choferes for select to authenticated
  using (empresa_id = (select private.get_empresa()));

drop policy if exists choferes_write_admin_op on choferes;
create policy choferes_write_admin_op on choferes for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- vehiculos -------------------------------------------------------------------
drop policy if exists vehiculos_read_auth on vehiculos;
create policy vehiculos_read_auth on vehiculos for select to authenticated
  using (empresa_id = (select private.get_empresa()));

drop policy if exists vehiculos_write_admin_op on vehiculos;
create policy vehiculos_write_admin_op on vehiculos for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- chofer_categorias (0020) ----------------------------------------------------
-- No tiene empresa_id: es la tabla de unión del chofer. Se filtra por el padre,
-- igual que las policies de chofer de la 0006 filtran viajes por asignación.
drop policy if exists chofer_categorias_read_auth on chofer_categorias;
create policy chofer_categorias_read_auth on chofer_categorias for select to authenticated
  using (private.mi_chofer(chofer_id));

drop policy if exists chofer_categorias_write_admin_op on chofer_categorias;
create policy chofer_categorias_write_admin_op on chofer_categorias for all to authenticated
  using (
    (select private.get_rol()) in ('admin', 'operador')
    and private.mi_chofer(chofer_id)
  )
  with check (
    (select private.get_rol()) in ('admin', 'operador')
    and private.mi_chofer(chofer_id)
  );

-- cotizaciones ----------------------------------------------------------------
drop policy if exists cotizaciones_admin_op_all on cotizaciones;
create policy cotizaciones_admin_op_all on cotizaciones for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- cotizacion_items: sin empresa_id, se filtra por su cotización.
drop policy if exists cotizacion_items_admin_op_all on cotizacion_items;
create policy cotizacion_items_admin_op_all on cotizacion_items for all to authenticated
  using (
    (select private.get_rol()) in ('admin', 'operador')
    and private.mi_cotizacion(cotizacion_id)
  )
  with check (
    (select private.get_rol()) in ('admin', 'operador')
    and private.mi_cotizacion(cotizacion_id)
  );

-- facturas --------------------------------------------------------------------
drop policy if exists facturas_admin_op_all on facturas;
create policy facturas_admin_op_all on facturas for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- viajes ----------------------------------------------------------------------
drop policy if exists viajes_admin_op_all on viajes;
create policy viajes_admin_op_all on viajes for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- El chofer ve los viajes donde está asignado, dentro de su empresa.
drop policy if exists viajes_chofer_read on viajes;
create policy viajes_chofer_read on viajes for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and empresa_id = (select private.get_empresa())
    and id in (
      select va.viaje_id
      from viaje_asignaciones va
      join choferes c on c.id = va.chofer_id
      where c.user_id = (select auth.uid())
    )
  );

-- viaje_asignaciones: sin empresa_id, se filtra por su viaje.
drop policy if exists asignaciones_admin_op_all on viaje_asignaciones;
create policy asignaciones_admin_op_all on viaje_asignaciones for all to authenticated
  using (
    (select private.get_rol()) in ('admin', 'operador')
    and private.mi_viaje(viaje_id)
  )
  with check (
    (select private.get_rol()) in ('admin', 'operador')
    and private.mi_viaje(viaje_id)
  );

drop policy if exists asignaciones_chofer_read on viaje_asignaciones;
create policy asignaciones_chofer_read on viaje_asignaciones for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and private.mi_chofer(chofer_id)
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- gastos_vehiculo -------------------------------------------------------------
drop policy if exists gastos_admin_op_all on gastos_vehiculo;
create policy gastos_admin_op_all on gastos_vehiculo for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- servicios_taxi (0010) -------------------------------------------------------
drop policy if exists servicios_taxi_admin_op_all on servicios_taxi;
create policy servicios_taxi_admin_op_all on servicios_taxi for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) in ('admin', 'operador')
  );

-- sii_credenciales ------------------------------------------------------------
drop policy if exists sii_cred_admin_only on sii_credenciales;
create policy sii_cred_admin_only on sii_credenciales for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  );

-- ----------------------------------------------------------------------------
-- 8. Storage: los buckets privados también se separan por empresa
--
-- `certificados` ya guardaba en `<empresa_id>/certificado.pfx` (combustible/
-- actions.ts), así que solo hay que exigir esa carpeta en la policy.
--
-- `adjuntos` guardaba plano (`factura-<timestamp>.pdf`): la app pasa a subir a
-- `<empresa_id>/factura-<timestamp>.pdf` y la policy exige la carpeta. Se puede
-- hacer sin migrar nada porque el bucket está vacío; si tuviera archivos habría
-- que moverlos antes o quedarían inaccesibles.
--
-- `logos` y `fotos` quedan como están: son buckets PÚBLICOS (cualquiera con la
-- URL lee, sin sesión), así que una policy por empresa no protegería nada. El
-- logo ya es por empresa vía empresa.logo_url.
-- ----------------------------------------------------------------------------
drop policy if exists storage_certificados_admin on storage.objects;
create policy storage_certificados_admin on storage.objects for all to authenticated
  using (
    bucket_id = 'certificados'
    and (select private.get_rol()) = 'admin'
    and (storage.foldername(name))[1] = (select private.get_empresa())::text
  )
  with check (
    bucket_id = 'certificados'
    and (select private.get_rol()) = 'admin'
    and (storage.foldername(name))[1] = (select private.get_empresa())::text
  );

drop policy if exists storage_adjuntos_admin_op on storage.objects;
create policy storage_adjuntos_admin_op on storage.objects for all to authenticated
  using (
    bucket_id = 'adjuntos'
    and (select private.get_rol()) in ('admin', 'operador')
    and (storage.foldername(name))[1] = (select private.get_empresa())::text
  )
  with check (
    bucket_id = 'adjuntos'
    and (select private.get_rol()) in ('admin', 'operador')
    and (storage.foldername(name))[1] = (select private.get_empresa())::text
  );

-- ============================================================================
-- Verificaciones
-- ============================================================================

-- 1) Ningún perfil sin empresa. Debe dar 0.
select count(*) as "perfiles_sin_empresa_debe_ser_0"
  from perfiles where empresa_id is null;

-- 2) LA VERIFICACIÓN QUE IMPORTA: toda policy de toda tabla que tenga columna
--    `empresa_id` debe nombrar get_empresa(). Se busca por catálogo y no contra
--    una lista escrita a mano, así que una tabla nueva (o una vieja que nadie
--    recuerda) aparece acá sola en vez de quedar silenciosamente compartida.
--
--    ⚠️ HOY ESTO NO DA VACÍO: las 6 tablas `encomienda_*` siguen existiendo
--    porque la migración 0041 todavía no se corrió, y sus policies son de la
--    época en que solo miraban el rol. Son datos de un negocio que ya se fue a
--    Ares; el arreglo es correr la 0041 (que las dropea), no parchearlas acá.
--    Fuera de esas 6, la lista debe salir vacía.
select p.tablename, p.policyname
  from pg_policies p
 where p.schemaname = 'public'
   and exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name::name = p.tablename
        and c.column_name = 'empresa_id'
   )
   and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%get_empresa%'
 order by p.tablename, p.policyname;

-- 3) Tablas hijas (sin empresa_id): toda policy tiene que pasar por uno de los
--    helpers que validan la fila padre. Debe salir vacío.
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and tablename in ('cotizacion_items', 'viaje_asignaciones', 'chofer_categorias')
   and coalesce(qual, '') || coalesce(with_check, '') !~ 'mi_cotizacion|mi_viaje|mi_chofer'
 order by tablename, policyname;

-- 4) Ninguna policy de las tablas de esta migración debe quedar en `using (true)`.
--    Debe salir vacío. (perfiles_self_read filtra por auth.uid() y es correcta;
--    storage_publicos_read es de buckets públicos a propósito.)
select tablename, policyname, qual
  from pg_policies
 where schemaname = 'public'
   and btrim(coalesce(qual, '')) = 'true'
 order by tablename, policyname;

-- 5) Reparto de cuentas por empresa: el mapa de quién ve qué.
select e.nombre as empresa, p.nombre as cuenta, p.rol, p.activo
  from perfiles p
  join empresa e on e.id = p.empresa_id
 order by e.created_at, p.rol, p.nombre;

-- 6) Cuántas filas quedan en cada empresa. Después de la semilla de pruebas,
--    las dos columnas tienen que contar cosas distintas.
select e.nombre as empresa,
       (select count(*) from clientes        where empresa_id = e.id) as clientes,
       (select count(*) from choferes        where empresa_id = e.id) as choferes,
       (select count(*) from vehiculos       where empresa_id = e.id) as vehiculos,
       (select count(*) from cotizaciones    where empresa_id = e.id) as cotizaciones,
       (select count(*) from facturas        where empresa_id = e.id) as facturas,
       (select count(*) from viajes          where empresa_id = e.id) as viajes,
       (select count(*) from gastos_vehiculo where empresa_id = e.id) as gastos,
       (select count(*) from servicios_taxi  where empresa_id = e.id) as taxis
  from empresa e
 order by e.created_at;
