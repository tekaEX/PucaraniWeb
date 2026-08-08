-- ============================================================================
-- 0032 — La jornada: una ruta que empieza y termina. El día se valora al
--        CERRARLA, no a cada entrega.
--        Ejecutar en Supabase > SQL Editor, DESPUÉS de la 0031. Re-ejecutable.
--
-- ⚠️ REQUIERE pg_cron. Si la sección 5 falla, andá a Database > Extensions en
--    el panel de Supabase, activá `pg_cron` y volvé a correr el archivo.
--
-- ----------------------------------------------------------------------------
-- POR QUÉ
--
-- Hasta acá el día se recalculaba con cada entrega que llegaba, así que
-- mientras el conductor repartía existía un día a medio hacer: el panel
-- mostraba una liquidación de una jornada que todavía estaba pasando, y
-- cualquier cosa que se tocara en el medio caía sobre un número que iba a
-- cambiar igual.
--
-- Una ruta es una unidad: empieza cuando se genera y termina cuando se cierra
-- la última parada. La plata se cuenta una vez, al final, y de ahí no se mueve.
--
-- Los eventos SIGUEN llegando en el momento, como siempre (la cola del teléfono
-- de la 0026 no cambia). Lo que cambia es que no disparan el cálculo mientras la
-- jornada está abierta. Así no se pierde nada si el teléfono muere a mitad de
-- ruta —lo enviado está en el servidor— y el panel igual puede mostrar el avance
-- sin inventar una liquidación.
--
-- ----------------------------------------------------------------------------
-- QUÉ SE VE EN EL HISTORIAL
--
-- Cuándo empezó la ruta y cuándo terminó. La hora exacta de cada entrega deja
-- de mostrarse: con la ruta hecha de corrido no dice nada que no diga ese par, y
-- el indicador de "sin señal" que comparaba la hora del teléfono contra la de
-- llegada al servidor pierde sentido cuando el envío puede ser diferido.
--
-- Los eventos siguen guardándose uno por uno: son el conteo, y son lo que
-- permite que reenviar no duplique (0026). Solo se dejan de dibujar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La tabla
-- ----------------------------------------------------------------------------
-- Una fila por (conductor, día). Es el sobre del día: dice si está en curso o
-- cerrada. Las cifras siguen en encomienda_pagos — acá no va plata.
create table if not exists encomienda_jornadas (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- set null como en el resto del módulo: eliminar a un conductor no puede
  -- borrar el historial del que salieron liquidaciones ya pagadas.
  chofer_id uuid references choferes(id) on delete set null,
  -- Día de trabajo en fecha local de Chile, igual que encomienda_actividad.
  fecha date not null,
  -- Cuándo se generó la ruta. Lo manda el teléfono, que ya lo tenía guardado
  -- (RutaLocal.generadaEn) y hasta ahora no salía de ahí.
  inicio timestamptz,
  -- Cuándo terminó. null = en curso. Es LA columna: mientras sea null el día no
  -- se valora, y en cuanto deja de serlo se congela (sección 3).
  --
  -- Para una jornada que nadie cerró, el cierre automático le pone la hora del
  -- último evento del día y no la hora en que corrió — decir que el conductor
  -- terminó a las 00:30 sería falso.
  cerrada_en timestamptz,
  created_at timestamptz not null default now(),
  -- nulls not distinct para que un conductor eliminado no pueda tener dos
  -- jornadas del mismo día. Mismo criterio que encomienda_pagos (0017).
  unique nulls not distinct (chofer_id, fecha)
);

create index if not exists idx_encomienda_jornadas_fecha
  on encomienda_jornadas (fecha desc);

-- Para el barrido de cierre, que busca exactamente esto.
create index if not exists idx_encomienda_jornadas_abiertas
  on encomienda_jornadas (fecha) where cerrada_en is null;

drop trigger if exists trg_encomienda_jornadas_empresa on encomienda_jornadas;
create trigger trg_encomienda_jornadas_empresa before insert on encomienda_jornadas
  for each row execute function set_empresa_id();

comment on table encomienda_jornadas is
  'Una ruta de reparto: cuándo empezó y cuándo terminó. Mientras cerrada_en sea null el día NO se valora. Al cerrarse se congelan sus cifras en encomienda_pagos. Ver 0032.';

-- ----------------------------------------------------------------------------
-- 2. RLS: mismo patrón que el resto del módulo
-- ----------------------------------------------------------------------------
alter table encomienda_jornadas enable row level security;

drop policy if exists encomienda_jornadas_admin_op_all on encomienda_jornadas;
create policy encomienda_jornadas_admin_op_all on encomienda_jornadas for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_jornadas_contador_read on encomienda_jornadas;
create policy encomienda_jornadas_contador_read on encomienda_jornadas for select to authenticated
  using ((select private.get_rol()) = 'contador');

drop policy if exists encomienda_jornadas_chofer_read on encomienda_jornadas;
create policy encomienda_jornadas_chofer_read on encomienda_jornadas for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- El conductor abre y cierra SU jornada del día: es quien genera la ruta y quien
-- llega a la última parada. No puede tocar la de otro ni la de otro día.
--
-- El límite de fecha es el mismo criterio que el delete de actividad de la 0028:
-- la app trabaja sobre el día de hoy, y sin el límite un token robado podría
-- reabrir y recerrar jornadas viejas —y con eso forzar que se revaloricen.
drop policy if exists encomienda_jornadas_chofer_insert on encomienda_jornadas;
create policy encomienda_jornadas_chofer_insert on encomienda_jornadas for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and fecha >= (now() at time zone 'America/Santiago')::date - 1
  );

drop policy if exists encomienda_jornadas_chofer_update on encomienda_jornadas;
create policy encomienda_jornadas_chofer_update on encomienda_jornadas for update to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and fecha >= (now() at time zone 'America/Santiago')::date - 1
  );

-- ----------------------------------------------------------------------------
-- 3. Congelar al cerrar
-- ----------------------------------------------------------------------------
create or replace function private.encomienda_jornada_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo al cerrarse. Abrir una jornada no calcula nada, y reabrirla tampoco
  -- descongela: las cifras que ya están se quedan hasta que se cierre otra vez.
  if new.cerrada_en is not null then
    perform private.encomienda_congelar_dia(new.chofer_id, new.fecha);
  end if;
  return null;
end;
$$;

revoke all on function private.encomienda_jornada_cambio() from public;

drop trigger if exists trg_encomienda_jornada_congelar on encomienda_jornadas;
create trigger trg_encomienda_jornada_congelar
  after insert or update of cerrada_en on encomienda_jornadas
  for each row execute function private.encomienda_jornada_cambio();

-- ----------------------------------------------------------------------------
-- 4. La actividad ya no congela por sí sola
-- ----------------------------------------------------------------------------
-- Ahora un evento solo recalcula el día si la jornada YA está cerrada. Es el
-- caso de la cola del teléfono vaciándose después del cierre: esas entregas
-- tienen que entrar al conteo igual, y el día se reescribe con su misma tarifa.
--
-- Un día sin jornada, o con la jornada abierta, no se toca: se valora cuando se
-- cierre (por el conductor, por la oficina o por el barrido de la sección 5).
--
-- La condición vive acá y no en encomienda_congelar_dia() a propósito: esa
-- función es la cuenta, y tiene que poder correrse a pedido —"Recalcular con la
-- regla actual"— sin preguntarle a nadie si el día está cerrado.
create or replace function private.encomienda_congelar_si_cerrada(
  p_chofer_id uuid,
  p_fecha date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from encomienda_jornadas
     where chofer_id = p_chofer_id
       and fecha = p_fecha
       and cerrada_en is not null
  ) then
    perform private.encomienda_congelar_dia(p_chofer_id, p_fecha);
  end if;
end;
$$;

revoke all on function private.encomienda_congelar_si_cerrada(uuid, date) from public;

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
    perform private.encomienda_congelar_si_cerrada(d.chofer_id, d.fecha);
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
    perform private.encomienda_congelar_si_cerrada(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

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
    perform private.encomienda_congelar_si_cerrada(d.chofer_id, d.fecha);
  end loop;
  return null;
end;
$$;

-- Lo mismo para el barrido de la 0031 que congelaba los días sin cifras al
-- configurar la primera regla: ahora solo alcanza a los que están cerrados.
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
    select distinct j.chofer_id, j.fecha
      from encomienda_jornadas j
     where j.chofer_id is not null
       and j.cerrada_en is not null
       and not exists (
         select 1 from encomienda_pagos p
          where p.chofer_id = j.chofer_id and p.fecha = j.fecha
       )
     order by j.chofer_id, j.fecha
  loop
    perform private.encomienda_congelar_dia(d.chofer_id, d.fecha);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Cerrar sola la jornada que nadie cerró
-- ----------------------------------------------------------------------------
-- Pasa: la batería se muere, el conductor cierra la app antes de la última
-- parada, o directamente se olvida. Sin esto ese día no se valora nunca y el
-- conductor no cobra.
--
-- Solo toca días YA PASADOS en hora de Chile — nunca el de hoy, que puede estar
-- en curso. cerrada_en se pone en la hora del último evento del día, que es
-- cuando el trabajo terminó de verdad; poner la hora del barrido diría que el
-- conductor estuvo repartiendo hasta la madrugada.
--
-- También levanta los (conductor, día) que tienen actividad pero ninguna
-- jornada: un teléfono que sincronizó entregas y nunca alcanzó a mandar la
-- apertura de la ruta.
create or replace function private.encomienda_cerrar_jornadas_vencidas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy   date := (now() at time zone 'America/Santiago')::date;
  v_total integer := 0;
begin
  -- Las que existen y quedaron abiertas.
  with cerradas as (
    update encomienda_jornadas j
       set cerrada_en = coalesce(
             (select max(a.hora) from encomienda_actividad a
               where a.chofer_id = j.chofer_id and a.fecha = j.fecha),
             -- Jornada abierta sin un solo evento: el conductor generó la ruta
             -- y no marcó nada. No es un día trabajado, pero la jornada tiene
             -- que cerrarse igual o el barrido la mira todos los días. Se cierra
             -- con su propio inicio; encomienda_congelar_dia no le va a escribir
             -- cifras porque no hay eventos que contar.
             j.inicio,
             now()
           )
     where j.fecha < v_hoy
       and j.cerrada_en is null
    returning 1
  )
  select count(*) into v_total from cerradas;

  -- Y las que nunca se abrieron pero tienen actividad.
  --
  -- inicio solo mira los eventos del TELÉFONO: los que cargó la oficina llevan
  -- una hora de relleno (mediodía UTC, ver agregarDiaManual) porque nadie anotó
  -- la real, y usarla acá convertiría ese relleno en "el conductor salió a las
  -- ocho". En un día íntegramente manual queda null, que es lo mismo que escribe
  -- la oficina al cargarlo.
  with faltantes as (
    insert into encomienda_jornadas (chofer_id, fecha, inicio, cerrada_en)
    select a.chofer_id, a.fecha, min(a.hora) filter (where a.origen = 'app'), max(a.hora)
      from encomienda_actividad a
     where a.fecha < v_hoy
       and a.chofer_id is not null
       and not exists (
         select 1 from encomienda_jornadas j
          where j.chofer_id = a.chofer_id and j.fecha = a.fecha
       )
     group by a.chofer_id, a.fecha
    returning 1
  )
  select v_total + count(*) into v_total from faltantes;

  return v_total;
end;
$$;

revoke all on function private.encomienda_cerrar_jornadas_vencidas() from public;

-- Todos los días a las 04:30 UTC = 00:30 en Chile (01:30 en horario de verano).
-- Después del cierre del día chileno y antes de que nadie mire el panel.
create extension if not exists pg_cron;

-- unschedule primero para que volver a correr el archivo no acumule trabajos ni
-- falle por nombre repetido.
do $$
begin
  perform cron.unschedule('encomienda-cerrar-jornadas');
exception
  when others then null;  -- no estaba programado
end $$;

select cron.schedule(
  'encomienda-cerrar-jornadas',
  '30 4 * * *',
  $cron$ select private.encomienda_cerrar_jornadas_vencidas(); $cron$
);

-- Y una pasada ahora, para lo que ya está en la base.
select private.encomienda_cerrar_jornadas_vencidas() as jornadas_cerradas_ahora;

-- ----------------------------------------------------------------------------
-- 6. Verificación: las tres tienen que dar true.
-- ----------------------------------------------------------------------------
select
  to_regclass('public.encomienda_jornadas') is not null
    as "tabla_creada",
  exists (
    select 1 from cron.job where jobname = 'encomienda-cerrar-jornadas'
  ) as "cierre_automatico_programado",
  -- Ningún día pasado quedó abierto.
  not exists (
    select 1 from encomienda_jornadas
     where fecha < (now() at time zone 'America/Santiago')::date
       and cerrada_en is null
  ) as "sin_jornadas_vencidas_abiertas";
