-- ============================================================================
-- Sistema de Gestión — Transportes Pucarani
-- Esquema inicial. Cómo usarlo:
--   1. Crea un proyecto en https://supabase.com
--   2. Ve a "SQL Editor" -> "New query"
--   3. Pega TODO este archivo y presiona "Run".
-- Es seguro ejecutarlo más de una vez (usa IF NOT EXISTS / guards).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tipos enumerados de estados
-- ----------------------------------------------------------------------------
do $$ begin
  create type cotizacion_estado as enum ('borrador', 'enviada', 'aceptada', 'rechazada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type factura_estado as enum ('en_proceso', 'por_facturar', 'facturada', 'pagada');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tabla: empresa (datos del emisor; normalmente una sola fila)
-- ----------------------------------------------------------------------------
create table if not exists empresa (
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
  proximo_numero_cotizacion int not null default 1189,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla: clientes
-- ----------------------------------------------------------------------------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text,
  rut text,
  direccion text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  notas text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla: cotizaciones
-- ----------------------------------------------------------------------------
create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  fecha date not null default current_date,
  fecha_validez date,
  cliente_id uuid references clientes(id) on delete set null,
  autor text,
  titulo text,
  nota_pie text,
  exento_iva boolean not null default true,
  estado cotizacion_estado not null default 'borrador',
  subtotal numeric(12, 2) not null default 0,
  iva numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla: cotizacion_items (líneas/descripciones de cada cotización)
-- ----------------------------------------------------------------------------
create table if not exists cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  orden int not null default 0,
  descripcion text not null,
  cantidad numeric(10, 2) not null default 1,
  valor_unitario numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0
);

-- ----------------------------------------------------------------------------
-- Tabla: facturas (también funciona como seguimiento de viajes)
-- ----------------------------------------------------------------------------
create table if not exists facturas (
  id uuid primary key default gen_random_uuid(),
  numero text,
  fecha date not null default current_date,
  descripcion text,
  cliente_id uuid references clientes(id) on delete set null,
  cotizacion_id uuid references cotizaciones(id) on delete set null,
  n_buses int default 1,
  valor_servicio numeric(12, 2) not null default 0,
  valor_a_pagar numeric(12, 2),
  orden_compra text,
  estado factura_estado not null default 'en_proceso',
  fecha_pago date,
  archivo_url text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices útiles
create index if not exists idx_cotizacion_items_cotizacion on cotizacion_items (cotizacion_id);
create index if not exists idx_facturas_cliente on facturas (cliente_id);
create index if not exists idx_facturas_cotizacion on facturas (cotizacion_id);
create index if not exists idx_facturas_estado on facturas (estado);
create index if not exists idx_cotizaciones_cliente on cotizaciones (cliente_id);

-- ----------------------------------------------------------------------------
-- Función: entrega el siguiente número correlativo de cotización
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
  update empresa
    set proximo_numero_cotizacion = proximo_numero_cotizacion + 1,
        updated_at = now()
    where id = (select id from empresa order by created_at limit 1)
    returning proximo_numero_cotizacion - 1 into assigned;

  if assigned is null then
    -- No hay fila de empresa: usa el máximo existente + 1.
    select coalesce(max(numero), 1188) + 1 into assigned from cotizaciones;
  end if;

  return assigned;
end;
$$;

grant execute on function next_cotizacion_numero() to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security: solo usuarios autenticados pueden leer/escribir
-- ----------------------------------------------------------------------------
alter table empresa enable row level security;
alter table clientes enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
alter table facturas enable row level security;

drop policy if exists "empresa_auth_all" on empresa;
create policy "empresa_auth_all" on empresa for all to authenticated using (true) with check (true);

drop policy if exists "clientes_auth_all" on clientes;
create policy "clientes_auth_all" on clientes for all to authenticated using (true) with check (true);

drop policy if exists "cotizaciones_auth_all" on cotizaciones;
create policy "cotizaciones_auth_all" on cotizaciones for all to authenticated using (true) with check (true);

drop policy if exists "cotizacion_items_auth_all" on cotizacion_items;
create policy "cotizacion_items_auth_all" on cotizacion_items for all to authenticated using (true) with check (true);

drop policy if exists "facturas_auth_all" on facturas;
create policy "facturas_auth_all" on facturas for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Storage: buckets para logo de la empresa y adjuntos de facturas
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('adjuntos', 'adjuntos', true)
  on conflict (id) do nothing;

drop policy if exists "storage_auth_all" on storage.objects;
create policy "storage_auth_all" on storage.objects for all to authenticated
  using (bucket_id in ('logos', 'adjuntos'))
  with check (bucket_id in ('logos', 'adjuntos'));

drop policy if exists "storage_public_read" on storage.objects;
create policy "storage_public_read" on storage.objects for select to anon
  using (bucket_id in ('logos', 'adjuntos'));

-- ----------------------------------------------------------------------------
-- Semillas (datos iniciales)
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
