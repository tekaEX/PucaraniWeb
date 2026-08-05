-- ============================================================================
-- 0020 — Categorías de chofer (N a N) + correo/login vinculado
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- A diferencia del vehículo (una sola categoría, 0014), un chofer SÍ puede
-- trabajar en varias líneas a la vez (ej. encomiendas Y taxis), así que es
-- una tabla de unión, no una columna. Mismas categorías/check que
-- vehiculos.categoria — agregar una nueva más adelante es un simple
-- DROP/ADD CONSTRAINT en ambos lados.
--
-- choferes.email: registro de qué correo se usó para invitar/vincular el
-- login del chofer. No se lee de auth.users directamente porque ese schema
-- no está expuesto por la API REST — este campo es la fuente de verdad para
-- mostrarlo en la app.
-- ============================================================================

create table if not exists chofer_categorias (
  chofer_id uuid not null references choferes(id) on delete cascade,
  categoria text not null check (categoria in ('operacion', 'taxis', 'encomiendas')),
  created_at timestamptz not null default now(),
  primary key (chofer_id, categoria)
);

alter table chofer_categorias enable row level security;

drop policy if exists chofer_categorias_read_auth on chofer_categorias;
create policy chofer_categorias_read_auth on chofer_categorias for select to authenticated
  using (true);

drop policy if exists chofer_categorias_write_admin_op on chofer_categorias;
create policy chofer_categorias_write_admin_op on chofer_categorias for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

alter table choferes add column if not exists email text;
create unique index if not exists choferes_email_unico on choferes (email) where email is not null;
