-- ============================================================================
-- 0034 — Periodos de facturación: de qué fecha a qué fecha va cada corte.
--        Ejecutar en Supabase > SQL Editor, DESPUÉS de la 0033. Re-ejecutable.
--
-- ⚠️ REQUIERE btree_gist. Viene disponible en todo proyecto de Supabase, pero
--    si la sección 2 falla andá a Database > Extensions, activá `btree_gist` y
--    volvé a correr el archivo.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ
--
-- El periodo global de la app (la cookie que fija el PeriodoSelector) es un mes
-- del calendario, y eso alcanza para mirar el panel. Pero la facturación no
-- corta el 30 a las 23:59: el corte va de una fecha a otra, y esas fechas las
-- pone quien factura. Sin una tabla que las guarde, saber cuánto entró "en el
-- periodo que se cerró" obliga a sumar días a mano cada vez.
--
-- Un periodo acá es exactamente dos fechas. No tiene nombre y no hay que
-- ponerle uno: se llama por lo que es —"1 al 15 de mayo"— y un nombre escrito
-- a mano solo abre la puerta a que diga una cosa distinta de las fechas.
--
-- Tampoco tiene color guardado. El color con el que cada periodo se pinta en el
-- gráfico sale de su posición en la lista (lib/encomiendas/periodos.ts), así
-- que dos periodos vecinos nunca caen en el mismo tono y no hay un dato más
-- que mantener.
--
-- ----------------------------------------------------------------------------
-- LOS PERIODOS DE UNA EMPRESA NO SE PISAN
--
-- Hoy hay una sola empresa, así que no puede haber dos periodos de facturación
-- solapados: un día pertenece a un corte o a ninguno, nunca a dos. Eso no es
-- una convención que se recuerda, es la restricción de exclusión de la sección
-- 2 — la base rechaza el solape.
--
-- El empresa_id entra en la restricción con `=`, así que la regla es "dentro de
-- una misma empresa". Cuando haya varias, los periodos de una no van a
-- estorbarle a los de la otra sin que haya que tocar nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La tabla
-- ----------------------------------------------------------------------------
create table if not exists encomienda_periodos_facturacion (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  fecha_inicio date not null,
  fecha_fin date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un periodo que termina antes de empezar no es un periodo corto: es un dedazo
-- con las fechas al revés, y sin esto quedaría guardado sin cubrir ni un día.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encomienda_periodos_fechas_ordenadas'
      and conrelid = 'public.encomienda_periodos_facturacion'::regclass
  ) then
    alter table encomienda_periodos_facturacion
      add constraint encomienda_periodos_fechas_ordenadas
      check (fecha_fin >= fecha_inicio);
  end if;
end $$;

-- Para listar los periodos de la empresa en orden, que es como se leen siempre.
create index if not exists idx_encomienda_periodos_empresa_inicio
  on encomienda_periodos_facturacion (empresa_id, fecha_inicio);

-- ----------------------------------------------------------------------------
-- 2. Sin solapes dentro de la misma empresa
--
-- Un unique no sirve: dos periodos se pisan sin compartir ninguna fecha exacta
-- (1–15 y 10–20 no tienen ni el inicio ni el fin en común). Lo que hay que
-- comparar son los RANGOS, y eso es una restricción de exclusión sobre un
-- índice gist. El `[]` del daterange es a propósito: las dos fechas que se
-- cargan son inclusive — el día `fecha_fin` es parte del periodo.
--
-- btree_gist es lo que le permite al índice gist manejar el `=` de un uuid,
-- para poder mezclar empresa_id con el rango en la misma restricción.
-- ----------------------------------------------------------------------------
create extension if not exists btree_gist;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encomienda_periodos_sin_solape'
      and conrelid = 'public.encomienda_periodos_facturacion'::regclass
  ) then
    alter table encomienda_periodos_facturacion
      add constraint encomienda_periodos_sin_solape
      exclude using gist (
        empresa_id with =,
        daterange(fecha_inicio, fecha_fin, '[]') with &&
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Triggers de siempre: la empresa la pone la base, updated_at también
-- ----------------------------------------------------------------------------
drop trigger if exists trg_encomienda_periodos_empresa on encomienda_periodos_facturacion;
create trigger trg_encomienda_periodos_empresa before insert on encomienda_periodos_facturacion
  for each row execute function set_empresa_id();

drop trigger if exists trg_encomienda_periodos_updated on encomienda_periodos_facturacion;
create trigger trg_encomienda_periodos_updated before update on encomienda_periodos_facturacion
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS: mismo patrón que el resto del módulo
--    admin/operador: todo · contador: solo lectura · chofer: nada
--
-- El conductor no entra: los cortes de facturación son de oficina y no cambian
-- en nada lo que él ve en el teléfono.
-- ----------------------------------------------------------------------------
alter table encomienda_periodos_facturacion enable row level security;

drop policy if exists encomienda_periodos_admin_op_all on encomienda_periodos_facturacion;
create policy encomienda_periodos_admin_op_all on encomienda_periodos_facturacion for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_periodos_contador_read on encomienda_periodos_facturacion;
create policy encomienda_periodos_contador_read on encomienda_periodos_facturacion for select to authenticated
  using ((select private.get_rol()) = 'contador');
