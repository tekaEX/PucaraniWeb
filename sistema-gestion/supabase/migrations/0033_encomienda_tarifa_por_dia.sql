-- ============================================================================
-- 0033 — Valorar un día con una tarifa dictada a mano, y poner al día lo que
--        quedó sin calcular.
--        Ejecutar en Supabase > SQL Editor, DESPUÉS de la 0031 y la 0032.
--        Re-ejecutable.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ
--
-- La regla de pago es una sola y rige hacia adelante (0031): lo que se guarda
-- ahí vale para los días que se registren después. Eso deja sin respuesta el
-- caso de cargar días PASADOS desde la oficina, que es justo lo que se estuvo
-- haciendo: un día de hace tres meses se valoraba con la tarifa de hoy, y la
-- única forma de corregirlo era cambiar la regla global — que además movería
-- lo que viene.
--
-- Acá entra la tercera fuente de tarifa: la que alguien escribe a mano para ESE
-- día. La cuenta ya sabe recibirla (los parámetros p_valor_pedido y siguientes
-- de private.encomienda_congelar_dia, 0031); lo que falta es la puerta por la
-- que la app puede pedirla, y es lo que agrega la sección 1.
--
-- La sección 2 es de una sola vez: deja calculados con la regla actual todos
-- los días que ya están en la base y todavía no tienen cifras, o que las tienen
-- pero sin la tarifa con la que se sacaron.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Valorar un día con una tarifa dada
-- ----------------------------------------------------------------------------
-- Va en `public` porque la llama la app con la sesión del usuario, igual que
-- encomienda_repreciar_dia (0031, sección 3b): comprueba el rol por dentro y es
-- la única forma expuesta de dictar una tarifa.
--
-- Repreciar siempre (p_repreciar => true): pedir esto ES decir "olvidate de la
-- tarifa que tenía este día". Sin eso, la tarifa explícita competiría con la
-- que el día ya lleva congelada y el resultado dependería de si el día existía.
--
-- Las validaciones repiten las de la app a propósito. Esto es un endpoint de
-- PostgREST —cualquiera con sesión puede llamarlo— y escribe sueldos: un
-- porcentaje de 700 o un valor por entrega negativo no pueden depender de que
-- el formulario los haya frenado antes.
create or replace function encomienda_valorar_dia(
  p_chofer_id uuid,
  p_fecha date,
  p_valor_pedido integer,
  p_tipo_pago text,
  p_valor_pago numeric,
  p_monto_dia integer default 0,
  p_meta_entregas_dia integer default null,
  p_bono_monto integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select private.get_rol()) not in ('admin', 'operador') then
    raise exception 'No tienes permiso para valorar días.';
  end if;

  if p_chofer_id is null then
    raise exception 'Falta el conductor.';
  end if;

  if p_valor_pedido is null or p_valor_pedido <= 0 then
    raise exception 'Pon cuánto se estima que entra por cada entrega.';
  end if;

  if p_tipo_pago not in ('porcentaje', 'monto_fijo') then
    raise exception 'Tipo de pago inválido.';
  end if;

  if p_valor_pago is null or p_valor_pago < 0 then
    raise exception 'El valor de pago no puede ser negativo.';
  end if;

  if p_tipo_pago = 'porcentaje' and p_valor_pago > 100 then
    raise exception 'El porcentaje no puede superar 100.';
  end if;

  if coalesce(p_monto_dia, 0) < 0 then
    raise exception 'El monto por día no puede ser negativo.';
  end if;

  -- Meta y bono son un solo dato en dos columnas: una meta sin monto no paga
  -- nada y un monto sin meta no se paga nunca. Cualquiera de las dos sola es
  -- casi siempre un formulario a medio llenar.
  if (p_meta_entregas_dia is null) <> (p_bono_monto is null) then
    raise exception 'Para el bono, completa tanto la meta de entregas como el monto.';
  end if;

  perform private.encomienda_congelar_dia(
    p_chofer_id,
    p_fecha,
    true,
    p_valor_pedido,
    p_tipo_pago,
    p_valor_pago,
    coalesce(p_monto_dia, 0),
    p_meta_entregas_dia,
    p_bono_monto
  );
end;
$$;

revoke all on function encomienda_valorar_dia(
  uuid, date, integer, text, numeric, integer, integer, integer
) from public;
grant execute on function encomienda_valorar_dia(
  uuid, date, integer, text, numeric, integer, integer, integer
) to authenticated;

comment on function encomienda_valorar_dia(
  uuid, date, integer, text, numeric, integer, integer, integer
) is
  'Vuelve a valorar un (conductor, día) con una tarifa dictada a mano, no con la regla. Para cargar días pasados que se pagaban distinto. Ver 0033.';

-- ----------------------------------------------------------------------------
-- 2. Poner al día lo que ya está en la base
-- ----------------------------------------------------------------------------
-- Todo esto es idempotente: vuelve a calcular con la regla actual lo que no
-- tiene cifras, y no toca lo que ya está completo.

-- 2a. Los días pasados sin jornada, o con la jornada abierta. Un día así no se
--     valora nunca (0032), y los que la oficina cargó antes de que existiera la
--     tabla no tienen ninguna. Esto se las crea y las cierra con la hora del
--     último evento.
select private.encomienda_cerrar_jornadas_vencidas() as jornadas_cerradas;

-- 2b. Los (conductor, día) con jornada cerrada y sin fila en encomienda_pagos:
--     días que se registraron cuando no había regla con qué calcularlos.
select private.encomienda_congelar_pendientes();

-- 2c. Las filas que tienen cifras pero no la tarifa con la que se sacaron.
--
-- Son las que escribió la versión de encomienda_congelar_dia anterior a la
-- 0031, cuando la tarifa todavía no se guardaba en el día. Funcionan —el panel
-- muestra sus números— pero no se pueden auditar, y cualquier recálculo futuro
-- las movería a la regla de ese momento sin que nadie lo pida.
--
-- Se vuelven a valorar con la regla de AHORA, que es lo pedido: que lo ya
-- cargado quede calculado y con su tarifa sellada, en vez de perderse.
--
-- Ordenado por (chofer, fecha) como todos los bucles que llaman a la cuenta:
-- así dos transacciones que toquen los mismos días los toman en el mismo orden
-- y no se traban entre sí (ver el advisory lock de la 0031).
do $$
declare
  d record;
  v_total integer := 0;
begin
  for d in
    select chofer_id, fecha
      from encomienda_pagos
     where chofer_id is not null
       and regla_valor_pedido is null
     order by chofer_id, fecha
  loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha, true);
    v_total := v_total + 1;
  end loop;
  raise notice 'Días repreciados con la regla actual: %', v_total;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Verificación: las tres tienen que dar true.
-- ----------------------------------------------------------------------------
select
  to_regprocedure('public.encomienda_valorar_dia(uuid, date, integer, text, numeric, integer, integer, integer)')
    is not null as "funcion_creada",

  -- Ninguna liquidación quedó sin la tarifa con la que se calculó.
  not exists (
    select 1 from encomienda_pagos
     where chofer_id is not null and regla_valor_pedido is null
  ) as "todas_las_cifras_con_tarifa",

  -- Todo día con jornada cerrada y actividad tiene sus cifras. Los de hoy en
  -- curso quedan fuera a propósito: se valoran al cerrar.
  (
    (select count(*) from encomienda_reglas_pago) = 0
    or not exists (
      select 1
        from encomienda_jornadas j
       where j.chofer_id is not null
         and j.cerrada_en is not null
         and exists (
           select 1 from encomienda_actividad a
            where a.chofer_id = j.chofer_id and a.fecha = j.fecha
         )
         and not exists (
           select 1 from encomienda_pagos p
            where p.chofer_id = j.chofer_id and p.fecha = j.fecha
         )
    )
  ) as "ningun_dia_cerrado_sin_cifras";
