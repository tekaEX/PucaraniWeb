-- ============================================================================
-- UUIDv7 como default de PK en las tablas transaccionales
-- Ejecutar en Supabase > SQL Editor DESPUÉS de las migraciones anteriores.
-- Es seguro ejecutarlo más de una vez.
--
-- Postgres 18 trae uuidv7() nativo pero Supabase aún no lo ofrece (jul 2026),
-- así que se define una función propia (RFC 9562): toma un UUIDv4 y superpone
-- el timestamp Unix en ms en los primeros 48 bits + bits de versión (0111).
-- Los ids quedan ordenados por tiempo de creación: los inserts caen al final
-- del índice B-tree (sin fragmentación) y `order by id` ≈ orden de creación.
--
-- Solo cambian las tablas que acumulan filas sin límite. Los catálogos chicos
-- (empresa, clientes, choferes, vehiculos) y sii_credenciales conservan
-- gen_random_uuid(): ahí el orden temporal no aporta y en credenciales se
-- prefiere un id 100 % aleatorio que no revele fecha de creación.
-- Las filas existentes mantienen su id v4; ambas versiones conviven en la
-- misma columna uuid sin afectar FKs, RLS ni índices.
--
-- Cuando Supabase ofrezca PG18: cambiar los defaults a uuidv7() nativo y
-- eliminar esta función.
-- ============================================================================

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

alter table cotizaciones     alter column id set default uuid_generate_v7();
alter table cotizacion_items alter column id set default uuid_generate_v7();
alter table facturas         alter column id set default uuid_generate_v7();
alter table gastos_vehiculo  alter column id set default uuid_generate_v7();
