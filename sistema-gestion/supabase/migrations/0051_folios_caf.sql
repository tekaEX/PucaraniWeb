-- ============================================================================
-- 0051 — Folios CAF: el cimiento para emitir DTE al SII
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Para emitir una factura electrónica no basta con el certificado digital (eso
-- ya lo guarda `sii_credenciales` desde la 0003). Hace falta el CAF: el archivo
-- que el SII te entrega autorizando un RANGO de folios —"podés usar del 465 al
-- 564"— y que trae adentro la llave con la que se timbra cada documento.
--
-- El problema que esta migración resuelve, y que es EL problema de facturar
-- electrónicamente: dos emisiones simultáneas no pueden recibir nunca el mismo
-- folio. Un folio repetido no es un bug que se arregla con un commit — es un
-- documento duplicado ante el SII, con el rechazo y la corrección tributaria
-- que eso implica. Por eso el número no lo elige la aplicación: lo entrega la
-- base, bajo lock de fila, en `tomar_folio()`.
--
-- Lo que NO hace esta migración: no emite nada ni habla con el SII. Es solo el
-- registro de folios y su consumo. La emisión viene después y se apoya acá.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ambiente: certificación o producción
--
-- El SII tiene dos mundos separados, con CERTIFICADOS Y CAF DISTINTOS. Todo
-- desarrollo nuevo se prueba en certificación —el SII además lo exige, con un
-- set de pruebas obligatorio, antes de autorizarte a emitir de verdad—. Que el
-- ambiente sea una columna y no una variable de entorno es a propósito: así una
-- factura de prueba queda marcada como tal EN EL DATO, para siempre, y no hay
-- forma de confundirla más adelante con una real.
-- ----------------------------------------------------------------------------
do $$ begin
  create type sii_ambiente as enum ('certificacion', 'produccion');
exception when duplicate_object then null;
end $$;

alter table sii_credenciales
  add column if not exists ambiente sii_ambiente not null default 'certificacion';

comment on column sii_credenciales.ambiente is
  'Ambiente del SII contra el que opera esta empresa. Arranca en certificación a propósito: pasar a producción es una decisión explícita.';

-- ----------------------------------------------------------------------------
-- 2. sii_caf — los rangos de folios autorizados
--
-- El XML del CAF NO se guarda en esta tabla: va al bucket privado
-- 'certificados', igual que el .pfx. Adentro trae la llave privada con la que
-- se timbran los documentos, así que no tiene por qué estar al alcance de un
-- `select *`; acá queda solo la metadata y la ruta.
--
-- `folio_siguiente` es el próximo folio libre del rango. Empieza en
-- folio_desde y llega hasta folio_hasta + 1, que es la forma de decir "este
-- rango se agotó" sin una columna extra que se pueda desincronizar.
-- ----------------------------------------------------------------------------
create table if not exists sii_caf (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  tipo_dte int not null check (tipo_dte in (33, 34, 56, 61)),
  ambiente sii_ambiente not null,
  folio_desde bigint not null check (folio_desde > 0),
  folio_hasta bigint not null,
  folio_siguiente bigint not null,
  fecha_autorizacion date not null,
  xml_path text not null,              -- ruta del CAF en el bucket privado 'certificados'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (folio_hasta >= folio_desde),
  check (folio_siguiente >= folio_desde and folio_siguiente <= folio_hasta + 1),
  -- Un mismo rango no se puede cargar dos veces: si alguien vuelve a subir el
  -- mismo CAF, el índice lo rebota en vez de reiniciar el contador.
  unique (empresa_id, tipo_dte, ambiente, folio_desde)
);

comment on table sii_caf is
  'Rangos de folios autorizados por el SII (archivo CAF). El consumo se hace SOLO por tomar_folio().';
comment on column sii_caf.folio_siguiente is
  'Próximo folio libre. Igual a folio_hasta + 1 cuando el rango se agotó.';

-- Índice que usa tomar_folio() para encontrar el rango vivo más antiguo.
create index if not exists idx_sii_caf_disponible
  on sii_caf (empresa_id, tipo_dte, ambiente, folio_desde)
  where folio_siguiente <= folio_hasta;

-- ----------------------------------------------------------------------------
-- 3. Marcar en la factura CON QUÉ ambiente se emitió
--
-- Sin esto, una factura emitida contra certificación y una real se ven igual en
-- la tabla. `estado_sii` y `sii_track_id` ya estaban reservados desde la 0006.
-- ----------------------------------------------------------------------------
alter table facturas
  add column if not exists sii_ambiente sii_ambiente,
  add column if not exists sii_xml_path text,
  add column if not exists sii_enviado_at timestamptz;

comment on column facturas.sii_ambiente is
  'Ambiente contra el que se emitió. null = no pasó por el SII (registro manual).';

-- ----------------------------------------------------------------------------
-- 4. tomar_folio() — la única forma de conseguir un número
--
-- Devuelve el próximo folio libre y lo marca como consumido, atómicamente.
--
-- Cómo evita el folio duplicado: el UPDATE toma el lock de la fila del CAF. Si
-- dos emisiones entran a la vez, la segunda espera a que la primera termine y
-- recién ahí lee el contador ya incrementado. La condición
-- `folio_siguiente <= folio_hasta` se vuelve a evaluar DESPUÉS del lock, así
-- que si la primera agotó el rango, la segunda no actualiza nada, sale con
-- v_folio null y el loop pasa al rango siguiente.
--
-- Ojo con lo que esto significa en la vida real: un folio tomado ya no vuelve.
-- Si la emisión falla después de tomarlo, ese número queda con un hueco y hay
-- que declararlo al SII como folio no utilizado. Por eso conviene tomarlo lo
-- más tarde posible, recién cuando se va a enviar el documento.
-- ----------------------------------------------------------------------------
create or replace function public.tomar_folio(p_tipo_dte int, p_ambiente sii_ambiente)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
  v_folio bigint;
begin
  v_empresa := private.get_empresa();
  if v_empresa is null then
    raise exception 'No se pudo determinar la empresa de la cuenta.';
  end if;

  loop
    update sii_caf
       set folio_siguiente = folio_siguiente + 1,
           updated_at = now()
     where id = (
             select id
               from sii_caf
              where empresa_id = v_empresa
                and tipo_dte = p_tipo_dte
                and ambiente = p_ambiente
                and folio_siguiente <= folio_hasta
              order by folio_desde
              limit 1
           )
       and folio_siguiente <= folio_hasta   -- se re-evalúa ya con el lock tomado
    returning folio_siguiente - 1 into v_folio;

    exit when v_folio is not null;

    -- No actualizó nada: o no hay rangos, o el que había se agotó entre medio.
    -- Si de verdad no queda ninguno vivo, cortamos; si quedaba otro, el loop
    -- lo intenta.
    if not exists (
      select 1 from sii_caf
       where empresa_id = v_empresa
         and tipo_dte = p_tipo_dte
         and ambiente = p_ambiente
         and folio_siguiente <= folio_hasta
    ) then
      raise exception 'No quedan folios disponibles para el documento tipo % en %. Solicitá un CAF nuevo en el SII y cargalo en el sistema.',
        p_tipo_dte, p_ambiente;
    end if;
  end loop;

  return v_folio;
end;
$$;

revoke all on function public.tomar_folio(int, sii_ambiente) from public;
grant execute on function public.tomar_folio(int, sii_ambiente) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RLS — el CAF es una credencial de firma: solo admin
--
-- Mismo criterio que sii_credenciales en la 0050. Un operador puede facturar,
-- pero no manipular los rangos de folios ni ver dónde vive la llave.
-- ----------------------------------------------------------------------------
alter table sii_caf enable row level security;

drop policy if exists sii_caf_admin_only on sii_caf;
create policy sii_caf_admin_only on sii_caf for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  );

-- El trigger de empresa_id de la 0050 rellena la columna al insertar; acá se
-- suma sii_caf a esa lista para no tener que mandarla desde la app.
drop trigger if exists set_empresa_id_sii_caf on sii_caf;
create trigger set_empresa_id_sii_caf
  before insert on sii_caf
  for each row execute function set_empresa_id();
