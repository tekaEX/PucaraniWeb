-- ============================================================================
-- 0017 — Encomiendas: pedidos, rutas diarias, paradas y pago a conductores
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Área nueva, aislada de clientes/facturas/cotizaciones (los destinatarios de
-- encomiendas NO son "clientes" de la empresa — son personas puntuales, sin
-- relación con la tabla clientes). SÍ reutiliza choferes: el conductor de
-- encomiendas es un chofer más del sistema (hoy 1, pensado para escalar a
-- varios sin rediseño).
--
-- MVP de 1 conductor / ~30 pedidos día: el orden de las paradas se calcula
-- con un algoritmo propio (vecino más cercano + 2-opt) en el servidor de la
-- app, no con VROOM. El polyline de la ruta se pide al demo público de OSRM
-- (uso bajísimo: ~1 ruta/día). Sin costo, sin servidor propio que mantener.
--
-- Como en servicios_taxi (0010): categorías/estados son texto + check, no
-- enums nativos — agregar un estado nuevo más adelante es un simple
-- DROP/ADD CONSTRAINT, sin las limitaciones de los enums de Postgres.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pedidos (persisten aunque no se entreguen y se re-programen otro día)
-- ----------------------------------------------------------------------------
create table if not exists encomienda_pedidos (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  fecha_pedido date not null default current_date,
  destinatario_nombre text not null,
  destinatario_telefono text not null,
  destinatario_direccion text not null,
  -- Geocodificadas desde la dirección (Nominatim/OSM) al cargar el pedido.
  destinatario_lat double precision,
  destinatario_lng double precision,
  valor integer not null default 0 check (valor >= 0),
  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'programado', 'entregado', 'no_entregado', 'cancelado'
  )),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_encomienda_pedidos_estado on encomienda_pedidos (empresa_id, estado);
create index if not exists idx_encomienda_pedidos_fecha on encomienda_pedidos (empresa_id, fecha_pedido desc);

drop trigger if exists trg_encomienda_pedidos_empresa on encomienda_pedidos;
create trigger trg_encomienda_pedidos_empresa before insert on encomienda_pedidos
  for each row execute function set_empresa_id();
drop trigger if exists trg_encomienda_pedidos_updated on encomienda_pedidos;
create trigger trg_encomienda_pedidos_updated before update on encomienda_pedidos
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Rutas diarias (una por chofer/día)
-- ----------------------------------------------------------------------------
create table if not exists encomienda_rutas (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- set null (no restrict): permite eliminar del todo a un chofer (ver
  -- eliminarChofer / migración 0015) sin perder el historial de rutas.
  chofer_id uuid references choferes(id) on delete set null,
  fecha date not null default current_date,
  estado text not null default 'generada' check (estado in (
    'generada', 'en_curso', 'finalizada'
  )),
  distancia_total_m integer check (distancia_total_m is null or distancia_total_m >= 0),
  duracion_total_s integer check (duracion_total_s is null or duracion_total_s >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (empresa_id, chofer_id, fecha)
);

create index if not exists idx_encomienda_rutas_chofer on encomienda_rutas (chofer_id, fecha desc);

drop trigger if exists trg_encomienda_rutas_empresa on encomienda_rutas;
create trigger trg_encomienda_rutas_empresa before insert on encomienda_rutas
  for each row execute function set_empresa_id();
drop trigger if exists trg_encomienda_rutas_updated on encomienda_rutas;
create trigger trg_encomienda_rutas_updated before update on encomienda_rutas
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Paradas (un pedido dentro de una ruta concreta: secuencia + estados)
-- ----------------------------------------------------------------------------
create table if not exists encomienda_paradas (
  id uuid primary key default uuid_generate_v7(),
  ruta_id uuid not null references encomienda_rutas(id) on delete cascade,
  pedido_id uuid not null references encomienda_pedidos(id) on delete cascade,
  secuencia int not null check (secuencia > 0),
  estado_llamada text not null default 'pendiente' check (estado_llamada in (
    'pendiente', 'contesto', 'no_contesto'
  )),
  estado_entrega text not null default 'pendiente' check (estado_entrega in (
    'pendiente', 'entregado', 'omitido'
  )),
  hora_llamada timestamptz,
  hora_entrega timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ruta_id, pedido_id),
  unique (ruta_id, secuencia)
);

create index if not exists idx_encomienda_paradas_ruta on encomienda_paradas (ruta_id, secuencia);
create index if not exists idx_encomienda_paradas_pedido on encomienda_paradas (pedido_id);

drop trigger if exists trg_encomienda_paradas_updated on encomienda_paradas;
create trigger trg_encomienda_paradas_updated before update on encomienda_paradas
  for each row execute function set_updated_at();

-- Al crear una parada, el pedido pasa de "pendiente" a "programado".
create or replace function encomienda_parada_marcar_programado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update encomienda_pedidos set estado = 'programado'
   where id = new.pedido_id and estado = 'pendiente';
  return new;
end $$;

drop trigger if exists trg_encomienda_parada_programado on encomienda_paradas;
create trigger trg_encomienda_parada_programado after insert on encomienda_paradas
  for each row execute function encomienda_parada_marcar_programado();

-- Si se borra la parada (ruta regenerada) y el pedido no quedó en otra ruta,
-- vuelve a "pendiente" para poder re-programarlo.
create or replace function encomienda_parada_liberar_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from encomienda_paradas where pedido_id = old.pedido_id and id <> old.id) then
    update encomienda_pedidos set estado = 'pendiente'
     where id = old.pedido_id and estado in ('programado', 'entregado', 'no_entregado');
  end if;
  return old;
end $$;

drop trigger if exists trg_encomienda_parada_liberar on encomienda_paradas;
create trigger trg_encomienda_parada_liberar after delete on encomienda_paradas
  for each row execute function encomienda_parada_liberar_pedido();

-- El estado de entrega de la parada sincroniza el estado del pedido.
create or replace function encomienda_parada_sincronizar_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado_entrega is distinct from old.estado_entrega then
    if new.estado_entrega = 'entregado' then
      update encomienda_pedidos set estado = 'entregado' where id = new.pedido_id;
      new.hora_entrega := coalesce(new.hora_entrega, now());
    elsif new.estado_entrega = 'omitido' then
      update encomienda_pedidos set estado = 'no_entregado' where id = new.pedido_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_encomienda_parada_sincronizar on encomienda_paradas;
create trigger trg_encomienda_parada_sincronizar before update of estado_entrega on encomienda_paradas
  for each row execute function encomienda_parada_sincronizar_pedido();

-- ----------------------------------------------------------------------------
-- 4. Reglas de pago (configurables; con vigencia, para no alterar pagos ya
--    calculados si la regla cambia más adelante)
-- ----------------------------------------------------------------------------
create table if not exists encomienda_reglas_pago (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- null = regla general (todos los choferes); con valor = override puntual.
  chofer_id uuid references choferes(id) on delete cascade,
  tipo_pago text not null check (tipo_pago in ('porcentaje', 'monto_fijo')),
  -- % (0-100) si tipo_pago = porcentaje, o CLP por pedido si monto_fijo.
  valor_pago numeric(10,2) not null check (valor_pago >= 0),
  meta_entregas_dia int check (meta_entregas_dia is null or meta_entregas_dia > 0),
  bono_monto integer check (bono_monto is null or bono_monto >= 0),
  vigente_desde date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_encomienda_reglas_vigencia
  on encomienda_reglas_pago (empresa_id, chofer_id, vigente_desde desc);

drop trigger if exists trg_encomienda_reglas_empresa on encomienda_reglas_pago;
create trigger trg_encomienda_reglas_empresa before insert on encomienda_reglas_pago
  for each row execute function set_empresa_id();

-- ----------------------------------------------------------------------------
-- 5. Pago calculado por día/chofer (snapshot: no se recalcula solo si cambia
--    la regla después — auditable via regla_id)
-- ----------------------------------------------------------------------------
create table if not exists encomienda_pagos (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  chofer_id uuid references choferes(id) on delete set null,
  fecha date not null,
  pedidos_entregados int not null default 0 check (pedidos_entregados >= 0),
  pedidos_no_entregados int not null default 0 check (pedidos_no_entregados >= 0),
  ingresos_totales integer not null default 0 check (ingresos_totales >= 0),
  pago_base integer not null default 0 check (pago_base >= 0),
  pago_bono integer not null default 0 check (pago_bono >= 0),
  pago_total integer generated always as (pago_base + pago_bono) stored,
  regla_id uuid references encomienda_reglas_pago(id) on delete set null,
  calculado_en timestamptz not null default now(),
  unique nulls not distinct (chofer_id, fecha)
);

drop trigger if exists trg_encomienda_pagos_empresa on encomienda_pagos;
create trigger trg_encomienda_pagos_empresa before insert on encomienda_pagos
  for each row execute function set_empresa_id();

-- ----------------------------------------------------------------------------
-- 6. RLS: mismo patrón que el resto del sistema
--    admin/operador: todo · contador: solo lectura · chofer: solo lo suyo
-- ----------------------------------------------------------------------------
alter table encomienda_pedidos enable row level security;
alter table encomienda_rutas enable row level security;
alter table encomienda_paradas enable row level security;
alter table encomienda_reglas_pago enable row level security;
alter table encomienda_pagos enable row level security;

drop policy if exists encomienda_pedidos_admin_op_all on encomienda_pedidos;
create policy encomienda_pedidos_admin_op_all on encomienda_pedidos for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
drop policy if exists encomienda_pedidos_contador_read on encomienda_pedidos;
create policy encomienda_pedidos_contador_read on encomienda_pedidos for select to authenticated
  using ((select private.get_rol()) = 'contador');

drop policy if exists encomienda_rutas_admin_op_all on encomienda_rutas;
create policy encomienda_rutas_admin_op_all on encomienda_rutas for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
drop policy if exists encomienda_rutas_contador_read on encomienda_rutas;
create policy encomienda_rutas_contador_read on encomienda_rutas for select to authenticated
  using ((select private.get_rol()) = 'contador');
-- El chofer ve (SELECT) sus propias rutas. La actualización de estado de
-- parada/llamada/entrega se hace por función SECURITY DEFINER (fase 3), no
-- por policy directa: así no puede tocar secuencia/pedido_id de otra parada.
drop policy if exists encomienda_rutas_chofer_read on encomienda_rutas;
create policy encomienda_rutas_chofer_read on encomienda_rutas for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

drop policy if exists encomienda_paradas_admin_op_all on encomienda_paradas;
create policy encomienda_paradas_admin_op_all on encomienda_paradas for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
drop policy if exists encomienda_paradas_contador_read on encomienda_paradas;
create policy encomienda_paradas_contador_read on encomienda_paradas for select to authenticated
  using ((select private.get_rol()) = 'contador');
drop policy if exists encomienda_paradas_chofer_read on encomienda_paradas;
create policy encomienda_paradas_chofer_read on encomienda_paradas for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and ruta_id in (
      select r.id from encomienda_rutas r
      join choferes c on c.id = r.chofer_id
      where c.user_id = (select auth.uid())
    )
  );

drop policy if exists encomienda_reglas_admin_op_all on encomienda_reglas_pago;
create policy encomienda_reglas_admin_op_all on encomienda_reglas_pago for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
drop policy if exists encomienda_reglas_contador_read on encomienda_reglas_pago;
create policy encomienda_reglas_contador_read on encomienda_reglas_pago for select to authenticated
  using ((select private.get_rol()) = 'contador');

drop policy if exists encomienda_pagos_admin_op_all on encomienda_pagos;
create policy encomienda_pagos_admin_op_all on encomienda_pagos for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));
drop policy if exists encomienda_pagos_contador_read on encomienda_pagos;
create policy encomienda_pagos_contador_read on encomienda_pagos for select to authenticated
  using ((select private.get_rol()) = 'contador');
drop policy if exists encomienda_pagos_chofer_read on encomienda_pagos;
create policy encomienda_pagos_chofer_read on encomienda_pagos for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- 7. Endurecimiento (mismo criterio que la 0012): las funciones de trigger no
--    se llaman por API.
-- ----------------------------------------------------------------------------
revoke execute on function encomienda_parada_marcar_programado() from public, anon, authenticated;
revoke execute on function encomienda_parada_liberar_pedido() from public, anon, authenticated;
revoke execute on function encomienda_parada_sincronizar_pedido() from public, anon, authenticated;
