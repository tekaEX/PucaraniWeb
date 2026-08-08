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
-- bono— JUNTO CON LA TARIFA que usó para calcularlos (sección 2b).
--
-- Un día que ya existe se recalcula siempre con SU tarifa, no con la regla de
-- ahora. De ahí sale lo que se pidió, y sin depender de cuándo pase nada:
-- cambiar la regla rige para los días que todavía no existen.
--
-- Eso cubre el caso incómodo, que es el conductor repartiendo mientras se
-- cambia la regla: el día en curso YA existe —tiene entregas desde la mañana—
-- así que termina completo con la tarifa con la que empezó, y la regla nueva
-- empieza a valer mañana. Sin la tarifa por día, el resultado dependía de si el
-- conductor alcanzaba a marcar una entrega más después del cambio.
--
-- Para mover un día ya congelado hay que pedirlo explícitamente, de a un día,
-- con el botón "Recalcular" (sección 3b). Es la salida para cuando la regla
-- estaba mal escrita, no algo que pase solo.
--
-- Y como la regla rige hacia adelante, un día PASADO que se carga hoy —cosa que
-- la oficina hace seguido— también puede llevar una tarifa dictada a mano, que
-- es el tercer origen posible y el único que no sale de ninguna tabla: son los
-- números que alguien escribe en el formulario. Ver el parámetro p_valor_pedido
-- de la sección 3 y encomienda_valorar_dia en la 0033.
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
-- QUÉ BORRA — SOLO LA PRIMERA VEZ
--
--   1. Toda la actividad de encomiendas y sus liquidaciones hasta el 2026-08-07
--      inclusive: los días de prueba con los que se armó el módulo. Esto pasa
--      ÚNICAMENTE en una base que todavía no vio esta migración (ver sección 1).
--   2. Todas las reglas de pago menos la más nueva.
--   3. Las columnas encomienda_reglas_pago.vigente_desde y .chofer_id, y
--      encomienda_pagos.regla_id — el mecanismo que reemplazan ya no existe.
--
-- ⚠️ NO LA CORRAS CON UN CONDUCTOR REPARTIENDO.
--
-- El corte (fecha < '2026-08-08') incluye HOY, así que se lleva también el día
-- que esté en curso. Y hay una segunda razón, peor: el teléfono guarda las
-- entregas que marca sin señal y las reenvía cuando vuelve el internet (0026),
-- así que eventos marcados antes de la migración pueden llegar después y
-- resucitar un día que acabás de borrar — a medias, con solo la parte que
-- todavía estaba en la cola.
--
-- Corrila con la jornada terminada y el teléfono del conductor sincronizado.
--
-- ANTES DE CORRER ESTO EN UNA BASE NUEVA — comprobá qué se va a perder:
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
-- 1. Los días de prueba — SOLO EN UNA BASE QUE NUNCA CORRIÓ ESTA MIGRACIÓN
--
-- El corte es una fecha FIJA y no `current_date` a propósito: así volver a
-- correr este archivo el mes que viene no barre con los días reales que se
-- hayan registrado desde entonces. Un `delete ... where fecha < current_date`
-- dentro de una migración re-ejecutable es una bomba de tiempo.
--
-- Pero una fecha fija tampoco alcanzaba, y casi cuesta caro: después de la
-- primera corrida se cargaron desde la oficina DÍAS PASADOS de trabajo real
-- —anteriores al corte—, así que volver a correr el archivo (obligatorio, para
-- que la base se quede con la versión de la función que congela la tarifa) los
-- habría borrado sin decir nada.
--
-- Por eso el borrado va detrás del mismo guard que usa la sección 2:
-- vigente_desde solo existe mientras esta migración no haya corrido nunca acá.
-- Es la marca exacta de "base pre-0031", y con ella la sección se vuelve un
-- no-op a partir de la segunda corrida.
--
-- Los pagos van primero: no hay FK entre las dos tablas —encomienda_pagos
-- guarda (chofer_id, fecha), no un id de actividad—, así que borrar la
-- actividad NO se lleva la liquidación con ella.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'encomienda_reglas_pago'
       and column_name = 'vigente_desde'
  ) then
    delete from encomienda_pagos where fecha < '2026-08-08';
    delete from encomienda_actividad where fecha < '2026-08-08';
  end if;
end $$;

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
  'La regla de pago del conductor. UNA fila: se edita encima, sin historial ni vigencias. Cambiarla no mueve los días ya registrados — esos tienen su propia tarifa congelada en encomienda_pagos. Ver 0031.';

-- ----------------------------------------------------------------------------
-- 2b. La tarifa con la que se calculó cada día, guardada EN EL DÍA
-- ----------------------------------------------------------------------------
-- Sin esto, un día seguía dependiendo de la regla mientras estuviera vivo, y el
-- caso que lo destapa es el conductor repartiendo AHORA:
--
--   09:00  el conductor lleva 20 entregas, el día vale X
--   14:00  se cambia la regla
--   14:05  el conductor marca la entrega 21 → el trigger recalcula el día
--          ENTERO con la regla nueva
--
-- Y si esa entrega 21 no llegaba, el día se quedaba con la regla vieja. O sea
-- que el efecto de cambiar la regla dependía de si el conductor marcaba una
-- entrega más — la misma acción, dos resultados, sin forma de saber cuál tocó.
--
-- Guardando la tarifa en el día, un día existente se recalcula SIEMPRE con la
-- suya. La regla nueva rige para los días que todavía no existen, que es lo que
-- significa "los cambios se ven hacia los días siguientes".
--
-- De paso devuelve la auditoría que se perdió al sacar regla_id, y mejor: son
-- los valores, no un puntero a una fila que después cambia.
alter table encomienda_pagos
  add column if not exists regla_valor_pedido integer,
  add column if not exists regla_tipo_pago text,
  add column if not exists regla_valor_pago numeric(10,2),
  add column if not exists regla_monto_dia integer,
  add column if not exists regla_meta_entregas_dia integer,
  add column if not exists regla_bono_monto integer;

comment on column encomienda_pagos.regla_valor_pedido is
  'La tarifa con la que se calculó ESTE día. Se copia de la regla la primera vez que el día se congela y no cambia después, aunque la regla sí. Para moverla hay que pedirlo explícitamente: encomienda_repreciar_dia (con la regla de ahora) o encomienda_valorar_dia (con una tarifa escrita a mano, 0033). Ver 0031.';

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
-- Las versiones de menos argumentos de corridas anteriores tienen que irse: con
-- los nuevos teniendo default, convivir haría ambigua toda llamada corta.
drop function if exists private.encomienda_congelar_dia(uuid, date);
drop function if exists private.encomienda_congelar_dia(uuid, date, boolean);

create or replace function private.encomienda_congelar_dia(
  p_chofer_id uuid,
  p_fecha date,
  -- true = volver a valorar el día descartando la tarifa que tenía. Es la única
  -- forma de mover un día ya congelado, y se pide a mano desde la pantalla del
  -- día (encomienda_repreciar_dia).
  p_repreciar boolean default false,
  -- Tarifa EXPLÍCITA para este día. Cuando viene, manda sobre la del día y
  -- sobre la regla, y queda congelada en la fila como cualquier otra.
  --
  -- Es la tercera fuente posible de tarifa y existe porque cargar días PASADOS
  -- desde la oficina es un caso real: la regla es una sola y rige hacia
  -- adelante, así que sin esto un día de hace tres meses solo se podía valorar
  -- con la tarifa de hoy. La pide la app por encomienda_valorar_dia (0033), que
  -- comprueba rol y validez antes de llegar acá.
  p_valor_pedido      integer default null,
  p_tipo_pago         text    default null,
  p_valor_pago        numeric default null,
  p_monto_dia         integer default null,
  p_meta_entregas_dia integer default null,
  p_bono_monto        integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entregados   int;
  v_omitidos     int;
  v_eventos      int;
  v_valor_pedido int;
  v_tipo_pago    text;
  v_valor_pago   numeric;
  v_monto_dia    int;
  v_meta         int;
  v_bono_monto   int;
  v_tiene_tarifa boolean := false;
  v_ingresos     int;
  v_base         int;
  v_dia          int;
  v_bono         int;
begin
  -- Día sin conductor: la FK es on delete set null (0026), así que el día se
  -- sigue viendo cuando se elimina a alguien, pero no hay a quién pagarle.
  if p_chofer_id is null then
    return;
  end if;

  -- ANTES de contar, no después. Dos sincronizaciones del teléfono cayendo a la
  -- vez sobre el mismo día se pisaban: cada transacción contaba sin ver la fila
  -- que la otra estaba insertando, las dos escribían el mismo total y una
  -- entrega quedaba sin pagar. Con el candado, la segunda espera y cuenta
  -- cuando la primera ya está confirmada.
  --
  -- Es por (conductor, día) y dura hasta el fin de la transacción, así que no
  -- frena la actividad de otro conductor ni la de otro día. Los bucles que
  -- llaman acá recorren los días ORDENADOS, para que dos transacciones que
  -- tocan los mismos días los tomen siempre en el mismo orden y no se traben
  -- entre sí.
  perform pg_advisory_xact_lock(
    hashtextextended(p_chofer_id::text || '|' || p_fecha::text, 0)
  );

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

  -- Una tarifa dictada desde afuera gana sobre todo lo demás: es alguien
  -- diciendo explícitamente con cuánto se pagaba ESTE día. Se piden los dos
  -- campos que no tienen default en la regla —sin valor por entrega no hay
  -- ingreso, y sin tipo de pago no hay fórmula—; los otros cuatro pueden venir
  -- nulos y significan lo mismo que en la regla (sin fijo, sin bono).
  if p_valor_pedido is not null and p_tipo_pago is not null then
    v_valor_pedido := p_valor_pedido;
    v_tipo_pago    := p_tipo_pago;
    v_valor_pago   := coalesce(p_valor_pago, 0);
    v_monto_dia    := coalesce(p_monto_dia, 0);
    v_meta         := p_meta_entregas_dia;
    v_bono_monto   := p_bono_monto;
    v_tiene_tarifa := true;
  end if;

  -- La tarifa del día es la que YA TIENE. Esto es lo que hace que sumar una
  -- entrega a las 14:05 no arrastre el día entero a una regla que cambió a las
  -- 14:00 (ver la sección 2b).
  if not p_repreciar and not v_tiene_tarifa then
    select regla_valor_pedido, regla_tipo_pago, regla_valor_pago,
           regla_monto_dia, regla_meta_entregas_dia, regla_bono_monto
      into v_valor_pedido, v_tipo_pago, v_valor_pago, v_monto_dia, v_meta, v_bono_monto
      from encomienda_pagos
     where chofer_id = p_chofer_id
       and fecha = p_fecha
       and regla_valor_pedido is not null;
    v_tiene_tarifa := found;
  end if;

  -- Día nuevo (o repreciado a mano): toma la regla de ahora.
  if not v_tiene_tarifa then
    select valor_pedido, tipo_pago, valor_pago, monto_dia, meta_entregas_dia, bono_monto
      into v_valor_pedido, v_tipo_pago, v_valor_pago, v_monto_dia, v_meta, v_bono_monto
      from encomienda_reglas_pago
     limit 1;

    -- Sin regla configurada no hay con qué calcular. No se escribe un cero: un
    -- cero se lee como "este día no vale nada", que es una afirmación. Se deja
    -- el día sin fila y el panel lo muestra como "Sin regla".
    if not found then
      return;
    end if;
  end if;

  -- Ingreso ESTIMADO: Starken maneja el valor de cada envío en su sistema y
  -- Pucarani nunca lo conoce (ver 0021). Lo real se anota por mes aparte
  -- (encomienda_ingresos_reales, 0029) y se contrasta contra esto.
  v_ingresos := round(v_entregados::numeric * v_valor_pedido)::int;

  -- Con 'porcentaje' el pago sale del ingreso estimado, o sea que valor_pedido
  -- también es parte del sueldo. Por eso los dos viven en la misma regla.
  v_base := case
              when v_tipo_pago = 'porcentaje'
                then round(v_ingresos::numeric * v_valor_pago / 100)::int
              else round(v_entregados::numeric * v_valor_pago)::int
            end;

  -- El fijo del día se paga sin condición: llegar hasta acá ya significa que
  -- hubo al menos un evento, y eso ES la definición de día trabajado.
  v_dia := coalesce(v_monto_dia, 0);

  -- >= y no >: alcanzar la meta ya paga el bono (la pantalla dice lo mismo).
  v_bono := case
              when v_meta is not null and v_entregados >= v_meta
                then coalesce(v_bono_monto, 0)
              else 0
            end;

  -- pago_total no se escribe: es columna generada (0024).
  insert into encomienda_pagos (
    chofer_id, fecha, pedidos_entregados, pedidos_no_entregados,
    ingresos_totales, pago_base, pago_dia, pago_bono, calculado_en,
    regla_valor_pedido, regla_tipo_pago, regla_valor_pago,
    regla_monto_dia, regla_meta_entregas_dia, regla_bono_monto
  ) values (
    p_chofer_id, p_fecha, v_entregados, v_omitidos,
    v_ingresos, v_base, v_dia, v_bono, now(),
    v_valor_pedido, v_tipo_pago, v_valor_pago, v_monto_dia, v_meta, v_bono_monto
  )
  on conflict (chofer_id, fecha) do update set
    pedidos_entregados      = excluded.pedidos_entregados,
    pedidos_no_entregados   = excluded.pedidos_no_entregados,
    ingresos_totales        = excluded.ingresos_totales,
    pago_base               = excluded.pago_base,
    pago_dia                = excluded.pago_dia,
    pago_bono               = excluded.pago_bono,
    calculado_en            = excluded.calculado_en,
    regla_valor_pedido      = excluded.regla_valor_pedido,
    regla_tipo_pago         = excluded.regla_tipo_pago,
    regla_valor_pago        = excluded.regla_valor_pago,
    regla_monto_dia         = excluded.regla_monto_dia,
    regla_meta_entregas_dia = excluded.regla_meta_entregas_dia,
    regla_bono_monto        = excluded.regla_bono_monto;
end;
$$;

revoke all on function private.encomienda_congelar_dia(
  uuid, date, boolean, integer, text, numeric, integer, integer, integer
) from public;

-- ----------------------------------------------------------------------------
-- 3b. Volver a valorar un día a mano
-- ----------------------------------------------------------------------------
-- La contracara de que un día conserve su tarifa: si la regla estaba MAL cuando
-- ese día se registró —un 70 % donde iba 7 %—, corregir la regla no lo arregla.
-- Esto es la salida, y es a propósito un acto explícito y de a un día: volver a
-- valorar algo que ya se contó como pagado no puede ser un efecto secundario.
--
-- Va en `public` porque la llama la app con la sesión del usuario, así que
-- comprueba el rol por dentro. Es la única de estas funciones expuesta.
create or replace function encomienda_repreciar_dia(p_chofer_id uuid, p_fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select private.get_rol()) not in ('admin', 'operador') then
    raise exception 'No tienes permiso para recalcular pagos.';
  end if;
  perform private.encomienda_congelar_dia(p_chofer_id, p_fecha, true);
end;
$$;

revoke all on function encomienda_repreciar_dia(uuid, date) from public;
grant execute on function encomienda_repreciar_dia(uuid, date) to authenticated;

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
  for d in select distinct chofer_id, fecha from nuevos order by chofer_id, fecha loop
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
  for d in select distinct chofer_id, fecha from viejos order by chofer_id, fecha loop
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
    order by chofer_id, fecha
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
     order by a.chofer_id, a.fecha
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
-- 6. Verificación: las tres tienen que dar true.
--
-- Ya no se comprueba que no quede actividad anterior al corte: desde que la
-- sección 1 solo borra en una base pre-0031, los días pasados que la oficina
-- cargue después SOBREVIVEN a propósito, y esa comprobación los denunciaría
-- como un problema.
-- ----------------------------------------------------------------------------
select
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
