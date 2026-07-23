-- ============================================================================
-- 0010 — Servicios de taxi
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Área de taxis de la empresa: servicios que se gestionan aislados (no tocan
-- viajes/facturas/cotizaciones) pero SÍ suman a los ingresos por cliente.
-- Empresa = tabla clientes; chofer = tabla choferes (FKs nullable).
-- `cliente_texto`/`chofer_texto` conservan el nombre cuando la importación
-- desde la app antigua no encuentra match (o si el registro se borra: set null
-- en la FK no rompe el histórico). `origen_id` = id de la app antigua, con
-- índice único para que re-importar un respaldo no duplique.
-- ============================================================================

create table if not exists servicios_taxi (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null check (tipo in (
    'aeropuerto_arica', 'arica_aeropuerto', 'tacna_peru',
    'local', 'taxi_exclusivo', 'taxi_compartido', 'especial'
  )),
  descripcion text,                                      -- solo tipo = especial
  monto integer not null default 0 check (monto >= 0),
  pasajero text,                                         -- nombre del pasajero
  cliente_id uuid references clientes(id) on delete set null,
  chofer_id uuid references choferes(id) on delete set null,
  cliente_texto text,                                    -- fallback sin match
  chofer_texto text,
  origen_id text,                                        -- id de la app antigua
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint servicio_especial_con_descripcion
    check (tipo <> 'especial' or descripcion is not null)
);

create unique index if not exists servicios_taxi_origen_uniq
  on servicios_taxi (empresa_id, origen_id) where origen_id is not null;
create index if not exists servicios_taxi_fecha_idx on servicios_taxi (empresa_id, fecha desc);
create index if not exists servicios_taxi_cliente_idx on servicios_taxi (cliente_id);
create index if not exists servicios_taxi_chofer_idx on servicios_taxi (chofer_id);

drop trigger if exists trg_servicios_taxi_empresa on servicios_taxi;
create trigger trg_servicios_taxi_empresa before insert on servicios_taxi
  for each row execute function set_empresa_id();
drop trigger if exists trg_servicios_taxi_updated on servicios_taxi;
create trigger trg_servicios_taxi_updated before update on servicios_taxi
  for each row execute function set_updated_at();

-- RLS: transaccional/financiero (mismo patrón que facturas).
alter table servicios_taxi enable row level security;

drop policy if exists servicios_taxi_admin_op_all on servicios_taxi;
create policy servicios_taxi_admin_op_all on servicios_taxi for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists servicios_taxi_contador_read on servicios_taxi;
create policy servicios_taxi_contador_read on servicios_taxi for select to authenticated
  using ((select private.get_rol()) = 'contador');
