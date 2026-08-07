-- ============================================================================
-- 0031 — Una sola regla de pago, y el dinero de cada día congelado al
--        registrarlo. Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ⚠️⚠️ ESTA MIGRACIÓN BORRA DATOS Y NO SE PUEDE DESHACER. ⚠️⚠️
--
-- ----------------------------------------------------------------------------
-- EL PROBLEMA
--
-- Guardar la configuración insertaba una regla NUEVA cada vez —también al
-- corregir un dedazo dos minutos después—, y cada una traía su propia fecha de
-- vigencia. La tabla se llenó de versiones que no usó nadie, y para saber
-- cuánto valía un día había que resolver cuál de todas regía ese día. Encima
-- los días anteriores a la primera regla no tenían ninguna: salían "Sin regla",
-- no sumaban a los ingresos y no se le podían pagar al conductor.
--
-- ----------------------------------------------------------------------------
-- LA FORMA NUEVA
--
-- Hay UNA regla. Se edita encima; no hay historial ni vigencias.
--
-- Lo que se conserva no es la regla: es EL RESULTADO. Cada vez que cambia la
-- actividad de un (conductor, día), un trigger recalcula ese día y escribe sus
-- números en encomienda_pagos — ingresos, pago por pedidos, fijo del día y
-- bono. A partir de ahí ese día ya no depende de la regla: son cifras escritas.
--
-- De ahí sale, gratis, lo que se pidió: cambiar la regla NO mueve ni un peso de
-- lo ya registrado, porque para esos días no se dispara nada. El cambio se ve
-- en los días que se registren después.
--
-- El único caso en que un día viejo se recalcula es que alguien le toque la
-- actividad (cargarlo o corregirlo a mano desde la oficina). Es correcto: ese
-- día se está registrando ahora, así que se valora con la regla de ahora.
--
-- Y un cambio de regla a media jornada revalúa el día ENTERO con la regla
-- nueva, no media mañana con una y la tarde con otra. Es lo que hay que querer:
-- un día partido en dos tarifas no se lo puede explicar nadie.
--
-- ----------------------------------------------------------------------------
-- DÓNDE VIVE LA FÓRMULA
--
-- Acá, en private.encomienda_congelar_dia(). Tiene que estar en la base porque
-- el teléfono del conductor inserta su actividad DIRECTO contra Postgres (ver
-- 0026): no pasa por el servidor de la app, así que no hay código TypeScript
-- que pueda correr en ese momento.
--
-- src/lib/encomiendas/pago.ts conserva la misma cuenta en TS, pero SOLO para la
-- vista previa de "Agregar día" —mostrar cuánto va a quedar el día antes de
-- guardarlo—. Son dos copias de la misma aritmética y hay que tocarlas juntas;
-- está anotado en los dos lados.
--
-- ----------------------------------------------------------------------------
-- QUÉ BORRA
--
--   1. Toda la actividad de encomiendas y sus liquidaciones hasta el 2026-08-07
--      inclusive: los días de prueba con los que se armó el módulo.
--   2. Todas las reglas de pago menos la más nueva.
--   3. Las columnas encomienda_reglas_pago.vigente_desde y .chofer_id, y
--      encomienda_pagos.regla_id — el mecanismo que reemplazan ya no existe.
--
-- ANTES DE CORRER ESTO — comprobá qué se va a perder:
--
--     select fecha, count(*) as registros
--       from encomienda_actividad
--      where fecha < '2026-08-08'
--      group by fecha order by fecha;
--
-- Si ahí aparece algún día de trabajo REAL que haya que conservar, NO corras la
-- sección 1: cambiá la fecha de corte por una anterior a ese día, o saltátela
-- entera y borrá a mano los días que sobran desde el panel.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Los días de prueba
--
-- El corte es una fecha FIJA y no `current_date` a propósito: así volver a
-- correr este archivo el mes que viene no barre con los días reales que se
-- hayan registrado desde entonces. Un `delete ... where fecha < current_date`
-- dentro de una migración re-ejecutable es una bomba de tiempo.
--
-- Los pagos van primero: no hay FK entre las dos tablas —encomienda_pagos
-- guarda (chofer_id, fecha), no un id de actividad—, así que borrar la
-- actividad NO se lleva la liquidación con ella.
-- ----------------------------------------------------------------------------
delete from encomienda_pagos where fecha < '2026-08-08';
delete from encomienda_actividad where fecha < '2026-08-08';

-- ----------------------------------------------------------------------------
-- 2. Una sola regla
-- ----------------------------------------------------------------------------
-- Se conserva la más nueva por empresa. El desempate por id es para que el
-- resultado sea el mismo si dos reglas comparten vigente_desde y created_at
-- (pasaba al apretar Guardar dos veces seguidas): sin él, Postgres podría
-- dejar una distinta en cada corrida.
--
-- El bloque condicional es por la re-ejecutabilidad: en la segunda corrida
-- vigente_desde ya no existe y la consulta no compilaría.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'encomienda_reglas_pago'
       and column_name = 'vigente_desde'
  ) then
    delete from encomienda_reglas_pago
     where id in (
       select id from (
         select id,
                row_number() over (
                  partition by empresa_id
                  order by vigente_desde desc, created_at desc, id desc
                ) as n
           from encomienda_reglas_pago
       ) t
       where t.n > 1
     );
  end if;
end $$;

-- Las columnas del mecanismo viejo. Una columna que ya nadie escribe ni lee es
-- de las que después nadie sabe si se puede tocar (mismo criterio que la 0030).
--
--   vigente_desde  la reemplaza el congelado por día.
--   chofer_id      override de regla por conductor. Nunca se usó, y con una
--                  sola regla no tiene dónde encajar.
--   regla_id       apuntaba a la versión de regla con la que se liquidó. Con
--                  una regla mutable siempre apuntaría a la misma fila y sus
--                  valores ya no serían los de ese día: sería una pista falsa.
--                  Lo que hace falta para auditar ya está en la propia fila
--                  (ingresos_totales, pago_base, pago_dia, pago_bono).
drop index if exists idx_encomienda_reglas_vigencia;
alter table encomienda_reglas_pago drop column if exists vigente_desde;
alter table encomienda_reglas_pago drop column if exists chofer_id;
alter table encomienda_pagos drop column if exists regla_id;

-- Una regla por empresa. Es lo que hace imposible volver a acumularlas, aunque
-- la app tenga un bug o alguien cargue por SQL.
alter table encomienda_reglas_pago
  drop constraint if exists encomienda_reglas_pago_una_por_empresa;
alter table encomienda_reglas_pago
  add constraint encomienda_reglas_pago_una_por_empresa unique (empresa_id);

-- Para poder decir en la pantalla desde cuándo rige lo que se está mirando.
-- created_at pasó a ser "cuándo se configuró por primera vez" y updated_at
-- "desde cuándo rige esto".
alter table encomienda_reglas_pago
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_encomienda_reglas_updated on encomienda_reglas_pago;
create trigger trg_encomienda_reglas_updated before update on encomienda_reglas_pago
  for each row execute function set_updated_at();

comment on table encomienda_reglas_pago is
  'La regla de pago del conductor. UNA fila: se edita encima, sin historial ni vigencias. Cambiarla no mueve los días ya registrados — esos tienen sus cifras congeladas en encomienda_pagos. Ver 0031.';

-- ----------------------------------------------------------------------------
-- 3. La cuenta
-- ----------------------------------------------------------------------------
-- En el schema `private`, que PostgREST no expone: esto escribe plata y no
-- tiene por qué ser invocable desde la API por cualquiera con sesión.
--
-- security definer porque el disparador más frecuente es el TELÉFONO DEL
-- CONDUCTOR insertando una entrega, y el rol 'chofer' no tiene permiso de
-- escritura sobre encomienda_pagos (RLS, 0017) — ni debe tenerlo: no puede
-- poder escribir su propia liquidación. La función corre como dueña de las
-- tablas y hace la escritura por él.
create or replace function private.encomienda_congelar_dia(p_chofer_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_regla      encomienda_reglas_pago%rowtype;
  v_entregados int;
  v_omitidos   int;
  v_eventos    int;
  v_ingresos   int;
  v_base       int;
  v_dia        int;
  v_bono       int;
begin
  -- Día sin conductor: la FK es on delete set null (0026), así que el día se
  -- sigue viendo cuando se elimina a alguien, pero no hay a quién pagarle.
  if p_chofer_id is null then
    return;
  end if;

  select count(*) filter (where tipo = 'entrega'),
         count(*) filter (where tipo = 'omision'),
         count(*)
    into v_entregados, v_omitidos, v_eventos
    from encomienda_actividad
   where chofer_id = p_chofer_id and fecha = p_fecha;

  -- Sin un solo evento el día dejó de existir para el panel, que arma los días
  -- agrupando actividad. Una liquidación sobreviviente sería plata a pagar por
  -- un día que ya nadie puede ver ni auditar.
  if v_eventos = 0 then
    delete from encomienda_pagos where chofer_id = p_chofer_id and fecha = p_fecha;
    return;
  end if;

  select * into v_regla from encomienda_reglas_pago limit 1;

  -- Sin regla configurada no hay con qué calcular. No se escribe un cero: un
  -- cero se lee como "este día no vale nada", que es una afirmación. Se deja el
  -- día sin fila y el panel lo muestra como "Sin regla".
  if not found then
    return;
  end if;

  -- Ingreso ESTIMADO: Starken maneja el valor de cada envío en su sistema y
  -- Pucarani nunca lo conoce (ver 0021). Lo real se anota por mes aparte
  -- (encomienda_ingresos_reales, 0029) y se contrasta contra esto.
  v_ingresos := round(v_entregados::numeric * v_regla.valor_pedido)::int;

  -- Con 'porcentaje' el pago sale del ingreso estimado, o sea que valor_pedido
  -- también es parte del sueldo. Por eso los dos viven en la misma regla.
  v_base := case
              when v_regla.tipo_pago = 'porcentaje'
                then round(v_ingresos::numeric * v_regla.valor_pago / 100)::int
              else round(v_entregados::numeric * v_regla.valor_pago)::int
            end;

  -- El fijo del día se paga sin condición: llegar hasta acá ya significa que
  -- hubo al menos un evento, y eso ES la definición de día trabajado.
  v_dia := coalesce(v_regla.monto_dia, 0);

  -- >= y no >: alcanzar la meta ya paga el bono (la pantalla dice lo mismo).
  v_bono := case
              when v_regla.meta_entregas_dia is not null
                   and v_entregados >= v_regla.meta_entregas_dia
                then coalesce(v_regla.bono_monto, 0)
              else 0
            end;

  -- pago_total no se escribe: es columna generada (0024).
  insert into encomienda_pagos (
    chofer_id, fecha, pedidos_entregados, pedidos_no_entregados,
    ingresos_totales, pago_base, pago_dia, pago_bono, calculado_en
  ) values (
    p_chofer_id, p_fecha, v_entregados, v_omitidos,
    v_ingresos, v_base, v_dia, v_bono, now()
  )
  on conflict (chofer_id, fecha) do update set
    pedidos_entregados    = excluded.pedidos_entregados,
    pedidos_no_entregados = excluded.pedidos_no_entregados,
    ingresos_totales      = excluded.ingresos_totales,
    pago_base             = excluded.pago_base,
    pago_dia              = excluded.pago_dia,
    pago_bono             = excluded.pago_bono,
    calculado_en          = excluded.calculado_en;
end;
$$;

revoke all on function private.encomienda_congelar_dia(uuid, date) from public;

-- ----------------------------------------------------------------------------
-- 4. Cuándo se dispara
-- ----------------------------------------------------------------------------
-- Triggers POR SENTENCIA, no por fila: cargar un día a mano desde la oficina
-- inserta hasta 300 filas de una (0028). Por fila serían 300 recálculos del
-- mismo día; por sentencia es uno solo, sobre la lista de días distintos que
-- tocó la operación.
--
-- Va una función por trigger, aunque las tres se parezcan. Se podría escribir
-- una sola compartida —bastaría con llamar igual a la tabla de transición en
-- todos—, pero una tabla de transición es una relación efímera que se registra
-- por consulta, y una función plpgsql cachea los planes de sus sentencias entre
-- llamadas. Compartir la función mete esas dos cosas en la misma frase. No vale
-- la pena averiguar si funciona: acá se paga sueldos.
create or replace function private.encomienda_congelar_insertados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in select distinct chofer_id, fecha from nuevos loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

create or replace function private.encomienda_congelar_borrados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in select distinct chofer_id, fecha from viejos loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

-- Un update puede mover un evento de un día a otro o de un conductor a otro, y
-- entonces hay DOS días que recalcular: el que perdió el evento y el que lo
-- ganó. Por eso este lleva las dos tablas de transición.
--
-- Hoy nada actualiza esta tabla —se inserta y se borra, nada más—, pero un
-- update que pasara sin recalcular dejaría cifras que no corresponden a la
-- actividad, y eso no se nota mirando la pantalla.
create or replace function private.encomienda_congelar_actualizados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in
    select distinct chofer_id, fecha from (
      select chofer_id, fecha from viejos
      union
      select chofer_id, fecha from nuevos
    ) t
  loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

revoke all on function private.encomienda_congelar_insertados() from public;
revoke all on function private.encomienda_congelar_borrados() from public;
revoke all on function private.encomienda_congelar_actualizados() from public;

drop trigger if exists trg_encomienda_actividad_congelar_ins on encomienda_actividad;
create trigger trg_encomienda_actividad_congelar_ins
  after insert on encomienda_actividad
  referencing new table as nuevos
  for each statement execute function private.encomienda_congelar_insertados();

drop trigger if exists trg_encomienda_actividad_congelar_del on encomienda_actividad;
create trigger trg_encomienda_actividad_congelar_del
  after delete on encomienda_actividad
  referencing old table as viejos
  for each statement execute function private.encomienda_congelar_borrados();

drop trigger if exists trg_encomienda_actividad_congelar_upd on encomienda_actividad;
create trigger trg_encomienda_actividad_congelar_upd
  after update on encomienda_actividad
  referencing old table as viejos new table as nuevos
  for each statement execute function private.encomienda_congelar_actualizados();

-- ----------------------------------------------------------------------------
-- 5. Los días que todavía no tienen sus cifras
-- ----------------------------------------------------------------------------
-- Congela los (conductor, día) con actividad que NO tienen fila en
-- encomienda_pagos. Los que ya la tienen no se tocan: ese es el punto de todo
-- esto.
create or replace function private.encomienda_congelar_pendientes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  for d in
    select distinct a.chofer_id, a.fecha
      from encomienda_actividad a
     where a.chofer_id is not null
       and not exists (
         select 1 from encomienda_pagos p
          where p.chofer_id = a.chofer_id and p.fecha = a.fecha
       )
  loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha);
  end loop;
end;
$$;

revoke all on function private.encomienda_congelar_pendientes() from public;

-- Al CONFIGURAR LA REGLA POR PRIMERA VEZ hay que barrer los días que quedaron
-- sin cifras por no haber tenido con qué calcularse. Es un caso real: la app
-- del conductor registra actividad sin preguntarle a nadie si hay una regla, así
-- que en una instalación nueva puede haber días trabajados antes de que la
-- oficina configure nada.
--
-- Solo on INSERT. En un UPDATE no se hace nada, y ahí está todo el diseño:
-- editar la regla no puede tocar un día ya congelado.
create or replace function private.encomienda_regla_creada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.encomienda_congelar_pendientes();
  return null;
end;
$$;

revoke all on function private.encomienda_regla_creada() from public;

drop trigger if exists trg_encomienda_regla_congelar_pendientes on encomienda_reglas_pago;
create trigger trg_encomienda_regla_congelar_pendientes
  after insert on encomienda_reglas_pago
  for each statement execute function private.encomienda_regla_creada();

-- Y una pasada ahora, para los días que hayan sobrevivido a la sección 1.
select private.encomienda_congelar_pendientes();

-- ----------------------------------------------------------------------------
-- 6. Verificación: las cuatro tienen que dar true.
-- ----------------------------------------------------------------------------
select
  (select count(*) from encomienda_actividad where fecha < '2026-08-08') = 0
    as "dias_de_prueba_borrados",
  (select count(*) from encomienda_reglas_pago) <= 1
    as "una_sola_regla",
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'encomienda_reglas_pago'
       and column_name = 'vigente_desde'
  ) as "vigencias_retiradas",
  -- Todo día con conductor tiene sus cifras, salvo que no haya regla todavía.
  (
    (select count(*) from encomienda_reglas_pago) = 0
    or not exists (
      select 1 from encomienda_actividad a
       where a.chofer_id is not null
         and not exists (
           select 1 from encomienda_pagos p
            where p.chofer_id = a.chofer_id and p.fecha = a.fecha
         )
    )
  ) as "ningun_dia_sin_cifras";
