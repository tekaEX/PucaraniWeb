-- ============================================================================
-- Gastos por vehículo (entrada manual + integración SII vía SimpleAPI / RCV)
-- Ejecutar en Supabase > SQL Editor DESPUÉS de 0001 y 0002.
-- Centralizado a UNA empresa por ahora, pero con empresa_id en todo para
-- habilitar multi-empresa a futuro sin re-migrar datos.
-- ============================================================================

-- Credenciales SII (una por empresa)
create table if not exists sii_credenciales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  rut text not null,
  cert_path text not null,            -- ruta del .pfx en el bucket privado 'certificados'
  cert_password_enc text not null,    -- AES-256-GCM: iv:authTag:ciphertext (hex)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id)
);

-- Vehículos: empresa_id (forward-compat) + backfill a la empresa única
alter table vehiculos add column if not exists empresa_id uuid references empresa(id) on delete cascade;
update vehiculos set empresa_id = (select id from empresa order by created_at limit 1) where empresa_id is null;
create index if not exists idx_vehiculos_empresa_patente on vehiculos (empresa_id, patente);

-- Gastos por vehículo (manual o importados del SII)
create table if not exists gastos_vehiculo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  vehiculo_id uuid references vehiculos(id) on delete set null,
  categoria text not null default 'otros',   -- combustible | mantencion | seguros | otros
  descripcion text,
  origen text not null default 'manual',      -- manual | sii
  patente_detectada text,
  proveedor_rut text,
  proveedor_razon_social text,
  dte_tipo int,
  folio bigint,
  fecha date not null default current_date,
  litros numeric(12, 2),
  monto_neto numeric(14, 2) not null default 0,
  monto_iva numeric(14, 2) not null default 0,
  monto_total numeric(14, 2) not null default 0,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (empresa_id, proveedor_rut, dte_tipo, folio)   -- idempotencia SII (nulls en manual no chocan)
);
create index if not exists idx_gastos_empresa_fecha on gastos_vehiculo (empresa_id, fecha desc);
create index if not exists idx_gastos_vehiculo on gastos_vehiculo (vehiculo_id);
create index if not exists idx_gastos_categoria on gastos_vehiculo (categoria);

-- Row Level Security (por ahora autenticado; a futuro scope por empresa_id)
alter table sii_credenciales enable row level security;
alter table gastos_vehiculo enable row level security;

drop policy if exists "sii_cred_auth_all" on sii_credenciales;
create policy "sii_cred_auth_all" on sii_credenciales for all to authenticated using (true) with check (true);

drop policy if exists "gastos_auth_all" on gastos_vehiculo;
create policy "gastos_auth_all" on gastos_vehiculo for all to authenticated using (true) with check (true);

-- Bucket PRIVADO para los certificados digitales (.pfx)
insert into storage.buckets (id, name, public) values ('certificados', 'certificados', false)
  on conflict (id) do nothing;
drop policy if exists "certificados_auth_rw" on storage.objects;
create policy "certificados_auth_rw" on storage.objects for all to authenticated
  using (bucket_id = 'certificados')
  with check (bucket_id = 'certificados');
