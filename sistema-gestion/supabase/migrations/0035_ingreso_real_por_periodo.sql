-- ============================================================================
-- 0035 — El ingreso real se imputa a un PERIODO de facturación, no a un mes.
--        Ejecutar en Supabase > SQL Editor, DESPUÉS de la 0034. Re-ejecutable.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ
--
-- Lo que Starken liquida no llega por mes calendario: llega por corte, y el
-- corte lo definen dos fechas (0034). Mientras el ingreso real se cargaba por
-- (año, mes), comparar el estimado con lo que entró de verdad obligaba a repartir
-- a ojo una liquidación que cruzaba dos meses — y esa comparación es justo el
-- número con el que se calibra el valor por entrega de la regla de pago.
--
-- Ahora una fila apunta a un periodo. El estimado de ese periodo sale de los
-- días que cubre, así que las dos cifras hablan exactamente del mismo rango.
--
-- ----------------------------------------------------------------------------
-- LO QUE YA ESTABA CARGADO NO SE TOCA
--
-- Las filas por mes se quedan como están, y se siguen viendo en el diálogo de
-- Comparar ingresos como historial de solo lectura. No se convierten a periodos
-- porque no hay a cuál: un mes no es un corte, y adivinarle uno inventaría una
-- correspondencia que nadie decidió.
--
-- De ahí que anio y mes pasen a aceptar null y que una fila tenga que ser una de
-- las dos cosas —periodo o mes, nunca las dos ni ninguna—, que es lo que dice el
-- check de la sección 3.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La columna nueva
--
-- on delete restrict y no cascade: si un periodo tiene cargado lo que se
-- facturó de verdad, borrarlo es tirar una cifra que vino de una liquidación y
-- no se puede reconstruir desde la app. La base lo frena y la pantalla lo
-- explica ("bórralo primero desde Comparar ingresos").
-- ----------------------------------------------------------------------------
alter table encomienda_ingresos_reales
  add column if not exists periodo_id uuid
  references encomienda_periodos_facturacion(id) on delete restrict;

-- Un periodo tiene UNA liquidación. Es unique común y no parcial a propósito:
-- las filas viejas por mes llevan periodo_id null, y en Postgres los null son
-- distintos entre sí, así que conviven todas sin chocar. Además PostgREST
-- necesita una restricción real para poder usarla como on_conflict al corregir
-- un periodo ya cargado.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encomienda_ingresos_reales_periodo_unico'
      and conrelid = 'public.encomienda_ingresos_reales'::regclass
  ) then
    alter table encomienda_ingresos_reales
      add constraint encomienda_ingresos_reales_periodo_unico unique (periodo_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. anio y mes dejan de ser obligatorios
--
-- Las filas nuevas van por periodo y no tienen mes al que imputarse. El unique
-- (anio, mes) de la 0029 se queda tal cual: con las dos columnas en null, y los
-- null distintos entre sí, no le estorba a ninguna fila por periodo.
-- ----------------------------------------------------------------------------
alter table encomienda_ingresos_reales alter column anio drop not null;
alter table encomienda_ingresos_reales alter column mes  drop not null;

-- ----------------------------------------------------------------------------
-- 3. Una fila es un periodo O un mes, nunca las dos ni ninguna
--
-- Sin esto quedaría admitido lo peor de los dos mundos: una fila sin periodo y
-- sin mes, que es plata que entró y no se sabe a qué corte pertenece, o una con
-- los dos, que se contaría dos veces al sumar.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'encomienda_ingresos_reales_imputacion'
      and conrelid = 'public.encomienda_ingresos_reales'::regclass
  ) then
    alter table encomienda_ingresos_reales
      add constraint encomienda_ingresos_reales_imputacion
      check (
        (periodo_id is not null and anio is null and mes is null)
        or (periodo_id is null and anio is not null and mes is not null)
      );
  end if;
end $$;

comment on table encomienda_ingresos_reales is
  'Lo que Starken liquidó de verdad. Las filas nuevas van por periodo de facturación (periodo_id, ver 0035); las anteriores a la 0035 quedaron por (anio, mes) y se conservan como historial. Se contrasta contra el ingreso estimado del mismo rango para calibrar valor_pedido.';

-- ----------------------------------------------------------------------------
-- 4. Verificación
-- ----------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_name = 'encomienda_ingresos_reales' and column_name = 'periodo_id') = 1
    as "periodo_id_ok_si_es_true",
  (select is_nullable from information_schema.columns
    where table_name = 'encomienda_ingresos_reales' and column_name = 'mes') = 'YES'
    as "mes_opcional_ok_si_es_true",
  to_regclass('public.encomienda_periodos_facturacion') is not null
    as "periodos_0034_ok_si_es_true";
