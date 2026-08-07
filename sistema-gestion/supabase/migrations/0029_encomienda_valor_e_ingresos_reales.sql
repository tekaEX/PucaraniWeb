-- ============================================================================
-- 0029 — El valor aproximado por entrega deja de estar quemado en el código, y
--        aparece dónde anotar lo que Starken pagó DE VERDAD.
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ESTA MIGRACIÓN NO BORRA NADA. Agrega una columna con default y una tabla
-- nueva; todo lo que ya está sigue calculando exactamente igual que antes.
--
-- Dos cosas distintas que conviene no confundir:
--
--   valor_pedido        lo que se ESTIMA que entra por cada entrega. Es una
--                       suposición: Pucarani reparte para Starken y no conoce
--                       el valor de cada envío (ver 0021). Hasta ahora eran
--                       $950 escritos en src/lib/encomiendas/config.ts, o sea
--                       que cambiarlo pedía tocar el código y volver a
--                       desplegar.
--   ingresos reales     lo que Starken liquidó de verdad en el mes. Es un dato
--                       duro que llega una vez al mes y que hasta ahora no
--                       tenía dónde anotarse, así que no había forma de saber
--                       si la estimación se parecía a la realidad.
--
-- Con los dos, el panel puede decir "estimamos $X, entraron $Y" y el dueño
-- ajusta valor_pedido hasta que la estimación sirva.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. valor_pedido va en la REGLA DE PAGO, no en una tabla de ajustes
-- ----------------------------------------------------------------------------
-- Podría parecer que corresponde a una configuración general, pero tiene que
-- ir acá por dos motivos, y los dos son de plata:
--
--   · Con tipo_pago = 'porcentaje', al conductor se le paga un % del ingreso
--     ESTIMADO. O sea que valor_pedido ya es parte de la fórmula del sueldo.
--     Si viviera aparte y alguien lo cambiara, todas las liquidaciones pasadas
--     dejarían de poder reproducirse.
--   · Las reglas ya tienen vigencia (vigente_desde) y quedan congeladas en
--     encomienda_pagos.regla_id. Poniéndolo acá, el valor hereda gratis ese
--     mecanismo: cambiarlo crea una regla nueva y no toca ni un pago anterior.
--
-- El default 950 es exactamente el valor que tenía la constante, así que las
-- reglas que ya existen siguen calculando lo mismo.
alter table encomienda_reglas_pago
  add column if not exists valor_pedido integer not null default 950;

alter table encomienda_reglas_pago drop constraint if exists encomienda_reglas_pago_valor_pedido_check;
alter table encomienda_reglas_pago add constraint encomienda_reglas_pago_valor_pedido_check
  check (valor_pedido >= 0);

comment on column encomienda_reglas_pago.valor_pedido is
  'CLP que se estima que entra por cada entrega. Base del ingreso estimado y, con tipo_pago = porcentaje, también del pago al conductor. Ver 0029.';

-- ----------------------------------------------------------------------------
-- 2. Lo que Starken pagó de verdad
-- ----------------------------------------------------------------------------
-- Por MES y no por día: la liquidación de Starken llega mensual, y nadie sabe
-- cuánto entró un martes puntual. El panel ya trabaja por periodo (mes/año),
-- así que la comparación cae en la misma unidad en que se mira todo lo demás.
--
-- No se guarda "por conductor": lo que Starken paga es por el servicio, no por
-- persona. Repartirlo entre choferes sería inventar.
create table if not exists encomienda_ingresos_reales (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  anio int not null check (anio between 2000 and 2100),
  mes int not null check (mes between 1 and 12),
  -- CLP sin decimales, como el resto del sistema.
  monto integer not null check (monto >= 0),
  -- Para dejar dicho de dónde salió el número (nº de liquidación, si es
  -- parcial, si incluye un mes anterior). Sin esto, dentro de seis meses nadie
  -- se acuerda por qué ese mes no cuadra.
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Sin empresa_id en la restricción, igual que encomienda_pagos (0017): el
  -- cliente no lo conoce —lo pone un trigger— y necesita nombrar las columnas
  -- del conflicto para poder corregir un mes ya cargado.
  unique (anio, mes)
);

create index if not exists idx_encomienda_ingresos_reales_periodo
  on encomienda_ingresos_reales (anio desc, mes desc);

drop trigger if exists trg_encomienda_ingresos_reales_empresa on encomienda_ingresos_reales;
create trigger trg_encomienda_ingresos_reales_empresa before insert on encomienda_ingresos_reales
  for each row execute function set_empresa_id();

drop trigger if exists trg_encomienda_ingresos_reales_updated on encomienda_ingresos_reales;
create trigger trg_encomienda_ingresos_reales_updated before update on encomienda_ingresos_reales
  for each row execute function set_updated_at();

comment on table encomienda_ingresos_reales is
  'Lo que Starken liquidó de verdad, por mes. Se contrasta contra el ingreso estimado (entregas x valor_pedido) para saber si la estimación sirve. Ver 0029.';

-- ----------------------------------------------------------------------------
-- 3. RLS: mismo patrón que el resto del sistema
--    admin/operador: todo · contador: solo lectura · chofer: nada
--
-- El conductor NO ve esto, ni siquiera lo suyo: es la facturación de la empresa
-- a su cliente, no tiene nada que ver con su liquidación.
-- ----------------------------------------------------------------------------
alter table encomienda_ingresos_reales enable row level security;

drop policy if exists encomienda_ingresos_reales_admin_op_all on encomienda_ingresos_reales;
create policy encomienda_ingresos_reales_admin_op_all on encomienda_ingresos_reales for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_ingresos_reales_contador_read on encomienda_ingresos_reales;
create policy encomienda_ingresos_reales_contador_read on encomienda_ingresos_reales for select to authenticated
  using ((select private.get_rol()) = 'contador');

-- ----------------------------------------------------------------------------
-- 4. Verificación
-- ----------------------------------------------------------------------------
select
  (select count(*) from information_schema.columns
    where table_name = 'encomienda_reglas_pago' and column_name = 'valor_pedido') = 1
    as "valor_pedido_ok_si_es_true",
  to_regclass('public.encomienda_ingresos_reales') is not null
    as "ingresos_reales_ok_si_es_true";
