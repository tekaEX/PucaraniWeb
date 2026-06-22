-- ============================================================================
-- Mejoras: Choferes, Vehículos y Costos por viaje
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 0001_init.sql.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Choferes (conductores)
-- ----------------------------------------------------------------------------
create table if not exists choferes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  telefono text,
  licencia_numero text,
  licencia_clase text,
  licencia_vencimiento date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Vehículos (flota) con vencimientos de documentos
-- ----------------------------------------------------------------------------
create table if not exists vehiculos (
  id uuid primary key default gen_random_uuid(),
  patente text not null,
  marca text,
  modelo text,
  anio int,
  capacidad int,
  km_actual int,
  revision_tecnica_venc date,
  soap_venc date,
  permiso_circulacion_venc date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Facturas: asignación de chofer/vehículo y costos del viaje
-- ----------------------------------------------------------------------------
alter table facturas
  add column if not exists chofer_id uuid references choferes(id) on delete set null,
  add column if not exists vehiculo_id uuid references vehiculos(id) on delete set null,
  add column if not exists costo_combustible numeric(12, 2) not null default 0,
  add column if not exists costo_peajes numeric(12, 2) not null default 0,
  add column if not exists costo_viaticos numeric(12, 2) not null default 0,
  add column if not exists costo_otros numeric(12, 2) not null default 0;

create index if not exists idx_facturas_chofer on facturas (chofer_id);
create index if not exists idx_facturas_vehiculo on facturas (vehiculo_id);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table choferes enable row level security;
alter table vehiculos enable row level security;

drop policy if exists "choferes_auth_all" on choferes;
create policy "choferes_auth_all" on choferes for all to authenticated using (true) with check (true);

drop policy if exists "vehiculos_auth_all" on vehiculos;
create policy "vehiculos_auth_all" on vehiculos for all to authenticated using (true) with check (true);
