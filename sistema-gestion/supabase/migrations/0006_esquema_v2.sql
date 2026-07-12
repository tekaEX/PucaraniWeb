-- ============================================================================
-- ESQUEMA v2 — Rediseño completo de la base de datos
-- Ejecutar en Supabase > SQL Editor. ¡DESTRUCTIVO!: borra y recrea todas las
-- tablas (aprobado: sin datos que conservar). Re-ejecutable: cada corrida
-- deja la base en el mismo estado limpio.
--
-- Cambios de fondo respecto al esquema v1 (migraciones 0001–0005):
--   1. `facturas` se separa en tres conceptos:
--        viajes (operación) / facturas (documento tributario) / cobranza
--        (fecha_pago). Una factura puede agrupar N viajes.
--   2. Estados DERIVADOS, no declarados: "por facturar" = viaje realizado sin
--        factura_id; "pagada" = fecha_pago not null. Sin doble fuente de verdad.
--   3. `viaje_asignaciones`: N choferes/buses por viaje (multi-bus, multi-día).
--   4. `perfiles` + roles (admin/operador/contador/chofer) con RLS por rol.
--   5. Facturas listas para DTE (tipo_dte, folio, estado_sii) — emisión por
--        SimpleAPI en fase futura.
--   6. Integridad dura: únicos (patente, folio, rut, codigo), checks de montos
--        y fechas, triggers de updated_at y empresa_id.
--   7. Bucket `adjuntos` pasa a privado (los PDF de facturas eran públicos).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Limpieza
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  viaje_asignaciones, viajes, cotizacion_items, cotizaciones, facturas,
  gastos_vehiculo, sii_credenciales, clientes, choferes, vehiculos,
  empresa, perfiles
cascade;

drop type if exists cotizacion_estado cascade;
drop type if exists factura_estado cascade;
drop type if exists viaje_estado cascade;
drop type if exists rol_usuario cascade;
drop type if exists gasto_categoria cascade;
drop type if exists gasto_origen cascade;

drop function if exists next_cotizacion_numero() cascade;
drop function if exists handle_new_user() cascade;
drop function if exists set_updated_at() cascade;
drop function if exists set_empresa_id() cascade;
drop function if exists private.get_rol() cascade;

-- ----------------------------------------------------------------------------
-- 1. Función UUIDv7 (Postgres < 18; ver migración 0005)
-- ----------------------------------------------------------------------------
create or replace function uuid_generate_v7()
returns uuid
language sql
volatile
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

grant execute on function uuid_generate_v7() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Tipos enumerados
-- ----------------------------------------------------------------------------
create type cotizacion_estado as enum ('borrador', 'enviada', 'aceptada', 'rechazada');
create type viaje_estado      as enum ('programado', 'realizado', 'cancelado');
create type factura_estado    as enum ('borrador', 'emitida', 'anulada');
create type rol_usuario       as enum ('admin', 'operador', 'contador', 'chofer');
create type gasto_categoria   as enum ('combustible', 'mantencion', 'seguros', 'otros');
create type gasto_origen      as enum ('manual', 'sii');

-- ----------------------------------------------------------------------------
-- 3. Funciones de infraestructura
-- ----------------------------------------------------------------------------
-- Mantiene updated_at sin depender de la app.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Rellena empresa_id con la empresa única si el insert no lo trae.
-- (Multi-empresa futuro: la app pasa empresa_id explícito y listo.)
create or replace function set_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.empresa_id is null then
    select id into new.empresa_id from empresa order by created_at limit 1;
  end if;
  return new;
end;
$$;

-- Schema privado (no expuesto por la API) para helpers de RLS.
create schema if not exists private;
grant usage on schema private to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Perfiles de usuario y roles
-- ----------------------------------------------------------------------------
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  rol rol_usuario not null default 'operador',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rol del usuario actual. SECURITY DEFINER: lee perfiles sin recursión de RLS.
create or replace function private.get_rol()
returns rol_usuario
language sql
stable
security definer
set search_path = public
as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

revoke all on function private.get_rol() from public;
grant execute on function private.get_rol() to authenticated;

-- Alta automática de perfil al registrarse un usuario.
-- El primer usuario del sistema queda como admin; los siguientes, operador
-- (el admin les ajusta el rol después).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1), 'Usuario'),
    case
      when exists (select 1 from perfiles where rol = 'admin') then 'operador'::rol_usuario
      else 'admin'::rol_usuario
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Usuarios ya existentes (creados antes de este esquema): todos admin.
insert into perfiles (id, nombre, rol)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'nombre', split_part(u.email, '@', 1), 'Usuario'),
       'admin'
from auth.users u
on conflict (id) do nothing;

create trigger trg_perfiles_updated before update on perfiles
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Empresa (emisor; una fila hoy, multi-empresa posible a futuro)
-- ----------------------------------------------------------------------------
create table empresa (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Transportes Pucarani',
  razon_social text,
  rut text,
  direccion text,
  ciudad text,
  giro text,
  telefono text,
  email text,
  logo_url text,
  representante text,
  proximo_numero_cotizacion int not null default 1189 check (proximo_numero_cotizacion > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_empresa_updated before update on empresa
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Catálogos: clientes, choferes, vehículos
-- ----------------------------------------------------------------------------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  nombre text not null,
  codigo text,
  rut text,
  direccion text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index clientes_codigo_unico on clientes (empresa_id, lower(codigo)) where codigo is not null;
create unique index clientes_rut_unico    on clientes (empresa_id, rut) where rut is not null;

create trigger trg_clientes_empresa before insert on clientes
  for each row execute function set_empresa_id();
create trigger trg_clientes_updated before update on clientes
  for each row execute function set_updated_at();

create table choferes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,  -- login futuro del chofer
  nombre text not null,
  rut text,
  telefono text,
  foto_url text,
  licencia_numero text,
  licencia_clase text,
  licencia_vencimiento date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index choferes_rut_unico on choferes (empresa_id, rut) where rut is not null;
create index idx_choferes_user on choferes (user_id) where user_id is not null;

create trigger trg_choferes_empresa before insert on choferes
  for each row execute function set_empresa_id();
create trigger trg_choferes_updated before update on choferes
  for each row execute function set_updated_at();

create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  patente text not null,
  marca text,
  modelo text,
  anio int check (anio is null or anio between 1950 and 2100),
  capacidad int check (capacidad is null or capacidad > 0),
  km_actual int check (km_actual is null or km_actual >= 0),
  revision_tecnica_venc date,
  soap_venc date,
  permiso_circulacion_venc date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehiculos_patente_unica on vehiculos (empresa_id, upper(patente));

create trigger trg_vehiculos_empresa before insert on vehiculos
  for each row execute function set_empresa_id();
create trigger trg_vehiculos_updated before update on vehiculos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Cotizaciones
-- ----------------------------------------------------------------------------
create table cotizaciones (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  numero int not null,
  fecha date not null default current_date,
  fecha_validez date check (fecha_validez is null or fecha_validez >= fecha),
  cliente_id uuid references clientes(id) on delete set null,
  autor text,
  titulo text,
  nota_pie text,
  exento_iva boolean not null default true,
  estado cotizacion_estado not null default 'borrador',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  iva numeric(14,2) not null default 0 check (iva >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, numero),
  check (total = subtotal + iva),
  check (not exento_iva or iva = 0)
);

create index idx_cotizaciones_cliente on cotizaciones (cliente_id);
create index idx_cotizaciones_fecha on cotizaciones (empresa_id, fecha desc);

create trigger trg_cotizaciones_empresa before insert on cotizaciones
  for each row execute function set_empresa_id();
create trigger trg_cotizaciones_updated before update on cotizaciones
  for each row execute function set_updated_at();

create table cotizacion_items (
  id uuid primary key default uuid_generate_v7(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  orden int not null default 0,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1 check (cantidad > 0),
  valor_unitario numeric(14,2) not null default 0 check (valor_unitario >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now()
);

create index idx_cotizacion_items_cotizacion on cotizacion_items (cotizacion_id, orden);

-- Correlativo atómico de cotizaciones (mismo mecanismo del esquema v1).
create or replace function next_cotizacion_numero()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned int;
begin
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

revoke all on function next_cotizacion_numero() from public;
grant execute on function next_cotizacion_numero() to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Facturas (documento tributario + cobranza) — SIN datos de operación
-- ----------------------------------------------------------------------------
create table facturas (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete restrict,
  tipo_dte int not null default 34 check (tipo_dte in (33, 34, 56, 61)),  -- 33 afecta, 34 exenta, 56/61 notas
  folio bigint check (folio is null or folio > 0),
  fecha_emision date,
  estado factura_estado not null default 'borrador',
  neto numeric(14,2) not null default 0 check (neto >= 0),
  iva numeric(14,2) not null default 0 check (iva >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  fecha_pago date,
  estado_sii text,      -- reservado: emisión vía SimpleAPI (fase futura)
  sii_track_id text,    -- reservado
  archivo_path text,    -- ruta en bucket privado 'adjuntos'
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total = neto + iva),
  check (tipo_dte <> 34 or iva = 0),                                        -- exenta ⇒ sin IVA
  check (estado <> 'emitida' or (folio is not null and fecha_emision is not null)),
  check (fecha_pago is null or estado <> 'borrador')                        -- no se paga un borrador
);

create unique index facturas_folio_unico on facturas (empresa_id, tipo_dte, folio) where folio is not null;
create index idx_facturas_cliente on facturas (cliente_id);
create index idx_facturas_emision on facturas (empresa_id, fecha_emision desc);
create index idx_facturas_por_cobrar on facturas (empresa_id) where estado = 'emitida' and fecha_pago is null;

create trigger trg_facturas_empresa before insert on facturas
  for each row execute function set_empresa_id();
create trigger trg_facturas_updated before update on facturas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. Viajes (la operación) y asignaciones de chofer/vehículo
-- ----------------------------------------------------------------------------
create table viajes (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete restrict,   -- todo servicio tiene cliente
  cotizacion_id uuid references cotizaciones(id) on delete set null,
  factura_id uuid references facturas(id) on delete set null,            -- null = sin facturar
  descripcion text not null,
  fecha_inicio date not null default current_date,
  fecha_fin date check (fecha_fin is null or fecha_fin >= fecha_inicio), -- null = un solo día
  estado viaje_estado not null default 'programado',
  valor numeric(14,2) not null default 0 check (valor >= 0),
  orden_compra text,
  costo_combustible numeric(14,2) not null default 0 check (costo_combustible >= 0),
  costo_peajes      numeric(14,2) not null default 0 check (costo_peajes >= 0),
  costo_viaticos    numeric(14,2) not null default 0 check (costo_viaticos >= 0),
  costo_otros       numeric(14,2) not null default 0 check (costo_otros >= 0),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_viajes_fecha on viajes (empresa_id, fecha_inicio desc);
create index idx_viajes_cliente on viajes (cliente_id);
create index idx_viajes_factura on viajes (factura_id);
create index idx_viajes_cotizacion on viajes (cotizacion_id);
-- "Por facturar" es un estado derivado; este índice lo hace barato de listar.
create index idx_viajes_por_facturar on viajes (empresa_id) where factura_id is null and estado = 'realizado';

create trigger trg_viajes_empresa before insert on viajes
  for each row execute function set_empresa_id();
create trigger trg_viajes_updated before update on viajes
  for each row execute function set_updated_at();

create table viaje_asignaciones (
  id uuid primary key default uuid_generate_v7(),
  viaje_id uuid not null references viajes(id) on delete cascade,
  chofer_id uuid references choferes(id) on delete restrict,     -- restrict: no perder historia (usar choferes.activo)
  vehiculo_id uuid references vehiculos(id) on delete restrict,
  fecha date,                                                    -- día específico en servicios multi-día; null = todo el servicio
  notas text,
  created_at timestamptz not null default now(),
  check (chofer_id is not null or vehiculo_id is not null),
  unique nulls not distinct (viaje_id, chofer_id, vehiculo_id, fecha)
);

create index idx_asignaciones_chofer on viaje_asignaciones (chofer_id);
create index idx_asignaciones_vehiculo on viaje_asignaciones (vehiculo_id);

-- ----------------------------------------------------------------------------
-- 10. Gastos por vehículo (manual + SII) — diseño v1 conservado
-- ----------------------------------------------------------------------------
create table gastos_vehiculo (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  vehiculo_id uuid references vehiculos(id) on delete set null,
  categoria gasto_categoria not null default 'otros',
  descripcion text,
  origen gasto_origen not null default 'manual',
  patente_detectada text,
  proveedor_rut text,
  proveedor_razon_social text,
  dte_tipo int,
  folio bigint,
  fecha date not null default current_date,
  litros numeric(12,2) check (litros is null or litros > 0),
  monto_neto  numeric(14,2) not null default 0 check (monto_neto >= 0),
  monto_iva   numeric(14,2) not null default 0 check (monto_iva >= 0),
  monto_total numeric(14,2) not null default 0 check (monto_total >= 0),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, proveedor_rut, dte_tipo, folio)   -- idempotencia importación SII
);

create index idx_gastos_empresa_fecha on gastos_vehiculo (empresa_id, fecha desc);
create index idx_gastos_vehiculo on gastos_vehiculo (vehiculo_id);
create index idx_gastos_categoria on gastos_vehiculo (categoria);

create trigger trg_gastos_empresa before insert on gastos_vehiculo
  for each row execute function set_empresa_id();
create trigger trg_gastos_updated before update on gastos_vehiculo
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 11. Credenciales SII (solo admin)
-- ----------------------------------------------------------------------------
create table sii_credenciales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  rut text not null,
  cert_path text not null,            -- .pfx en bucket privado 'certificados'
  cert_password_enc text not null,    -- AES-256-GCM: iv:authTag:ciphertext (hex)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id)
);

create trigger trg_sii_cred_empresa before insert on sii_credenciales
  for each row execute function set_empresa_id();
create trigger trg_sii_cred_updated before update on sii_credenciales
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. Row Level Security por rol
--     admin/operador: todo · contador: solo lectura de negocio ·
--     chofer: sus viajes y su ficha · sii_credenciales: solo admin
-- ----------------------------------------------------------------------------
alter table perfiles enable row level security;
alter table empresa enable row level security;
alter table clientes enable row level security;
alter table choferes enable row level security;
alter table vehiculos enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
alter table facturas enable row level security;
alter table viajes enable row level security;
alter table viaje_asignaciones enable row level security;
alter table gastos_vehiculo enable row level security;
alter table sii_credenciales enable row level security;

-- perfiles: cada uno ve el suyo; admin administra todos.
create policy perfiles_self_read on perfiles for select to authenticated
  using (id = (select auth.uid()));
create policy perfiles_admin_all on perfiles for all to authenticated
  using ((select private.get_rol()) = 'admin')
  with check ((select private.get_rol()) = 'admin');

-- Catálogos: lectura para todo usuario interno; escritura admin/operador.
create policy empresa_read_auth on empresa for select to authenticated using (true);
create policy empresa_write_admin_op on empresa for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

create policy clientes_read_auth on clientes for select to authenticated using (true);
create policy clientes_write_admin_op on clientes for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

create policy choferes_read_auth on choferes for select to authenticated using (true);
create policy choferes_write_admin_op on choferes for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

create policy vehiculos_read_auth on vehiculos for select to authenticated using (true);
create policy vehiculos_write_admin_op on vehiculos for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

-- Transaccionales: admin/operador todo; contador solo lectura.
create policy cotizaciones_admin_op_all on cotizaciones for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
create policy cotizaciones_contador_read on cotizaciones for select to authenticated
  using ((select private.get_rol()) = 'contador');

create policy cotizacion_items_admin_op_all on cotizacion_items for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
create policy cotizacion_items_contador_read on cotizacion_items for select to authenticated
  using ((select private.get_rol()) = 'contador');

create policy facturas_admin_op_all on facturas for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
create policy facturas_contador_read on facturas for select to authenticated
  using ((select private.get_rol()) = 'contador');

create policy viajes_admin_op_all on viajes for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
create policy viajes_contador_read on viajes for select to authenticated
  using ((select private.get_rol()) = 'contador');
-- El chofer ve los viajes donde está asignado.
create policy viajes_chofer_read on viajes for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and id in (
      select va.viaje_id
      from viaje_asignaciones va
      join choferes c on c.id = va.chofer_id
      where c.user_id = (select auth.uid())
    )
  );

create policy asignaciones_admin_op_all on viaje_asignaciones for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
create policy asignaciones_contador_read on viaje_asignaciones for select to authenticated
  using ((select private.get_rol()) = 'contador');
create policy asignaciones_chofer_read on viaje_asignaciones for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

create policy gastos_admin_op_all on gastos_vehiculo for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
create policy gastos_contador_read on gastos_vehiculo for select to authenticated
  using ((select private.get_rol()) = 'contador');

-- Credenciales SII: SOLO admin (contienen la password cifrada del certificado).
create policy sii_cred_admin_only on sii_credenciales for all to authenticated
  using ((select private.get_rol()) = 'admin')
  with check ((select private.get_rol()) = 'admin');

-- ----------------------------------------------------------------------------
-- 13. Storage: adjuntos y certificados PRIVADOS; logos y fotos públicos
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('logos', 'logos', true),
  ('fotos', 'fotos', true),
  ('adjuntos', 'adjuntos', false),
  ('certificados', 'certificados', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "storage_auth_all" on storage.objects;
drop policy if exists "storage_public_read" on storage.objects;
drop policy if exists "certificados_auth_rw" on storage.objects;
drop policy if exists "fotos_auth_rw" on storage.objects;
drop policy if exists "fotos_public_read" on storage.objects;
drop policy if exists "storage_publicos_read" on storage.objects;
drop policy if exists "storage_publicos_rw_admin_op" on storage.objects;
drop policy if exists "storage_adjuntos_admin_op" on storage.objects;
drop policy if exists "storage_adjuntos_contador_read" on storage.objects;
drop policy if exists "storage_certificados_admin" on storage.objects;

-- Públicos: cualquiera lee; admin/operador escribe.
create policy storage_publicos_read on storage.objects for select
  using (bucket_id in ('logos', 'fotos'));
create policy storage_publicos_rw_admin_op on storage.objects for all to authenticated
  using (bucket_id in ('logos', 'fotos') and (select private.get_rol()) in ('admin', 'operador'))
  with check (bucket_id in ('logos', 'fotos') and (select private.get_rol()) in ('admin', 'operador'));

-- Adjuntos de facturas: privado; admin/operador rw, contador lectura (URLs firmadas).
create policy storage_adjuntos_admin_op on storage.objects for all to authenticated
  using (bucket_id = 'adjuntos' and (select private.get_rol()) in ('admin', 'operador'))
  with check (bucket_id = 'adjuntos' and (select private.get_rol()) in ('admin', 'operador'));
create policy storage_adjuntos_contador_read on storage.objects for select to authenticated
  using (bucket_id = 'adjuntos' and (select private.get_rol()) = 'contador');

-- Certificados digitales: SOLO admin.
create policy storage_certificados_admin on storage.objects for all to authenticated
  using (bucket_id = 'certificados' and (select private.get_rol()) = 'admin')
  with check (bucket_id = 'certificados' and (select private.get_rol()) = 'admin');

-- ----------------------------------------------------------------------------
-- 14. Semillas
-- ----------------------------------------------------------------------------
insert into empresa (nombre, razon_social, direccion, ciudad, giro, telefono, representante, proximo_numero_cotizacion)
select 'Transportes Pucarani',
       'Cristian Enrique Carreño Rosas',
       'Quinsachata 1749',
       'Arica',
       'Traslado de Personal y Operador Turístico',
       '+569983417385',
       'Cristian Enrique Carreño Rosas',
       1189
where not exists (select 1 from empresa);

insert into clientes (nombre, codigo)
select 'Empresa Portuaria Arica', 'epa'
where not exists (select 1 from clientes where codigo = 'epa');

insert into clientes (nombre, codigo)
select 'Terminal Puerto Arica', 'tpa'
where not exists (select 1 from clientes where codigo = 'tpa');
