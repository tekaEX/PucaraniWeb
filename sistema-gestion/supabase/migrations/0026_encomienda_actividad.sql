-- ============================================================================
-- 0026 — La operación del día pasa al teléfono del chofer; la base solo guarda
--        el HECHO de cada entrega. Ejecutar en Supabase > SQL Editor.
--        Re-ejecutable.
--
-- ESTA MIGRACIÓN NO BORRA NADA. Crea la tabla nueva y la deja convivir con
-- encomienda_pedidos/rutas/paradas hasta que la app nueva esté probada en
-- terreno. El retiro de las tablas viejas va en la 0027.
--
-- Por qué: Pucarani reparte para Starken (ver 0021). Los destinatarios NO son
-- clientes de Pucarani, son de Starken, que ya administra sus datos en su
-- propio sistema. Guardar acá nombre, teléfono y dirección de esas personas no
-- le sirve a la empresa para nada —el valor del envío ni lo conoce— y en
-- cambio la convierte en responsable de datos personales de terceros, con
-- registro de tratamiento, derechos de acceso/borrado y aviso de filtraciones,
-- justo cuando entra en vigencia la Ley 21.719 (1 de diciembre de 2026).
-- La forma más simple y más barata de cumplir es no tener el dato.
--
-- Lo único que la empresa necesita saber es cuántas entregas hizo cada chofer
-- cada día: de ahí salen el ingreso estimado (entregas × VALOR_APROXIMADO_
-- PEDIDO, ver 0021) y la liquidación del chofer.
--
-- Qué reemplaza: encomienda_pedidos + encomienda_rutas + encomienda_paradas.
-- Los pedidos, el orden de visita y el trazado por calles pasan a vivir en el
-- teléfono. encomienda_reglas_pago y encomienda_pagos NO se tocan: el cálculo
-- del pago (src/lib/encomiendas/pago.ts) ya está escrito como función pura que
-- recibe conteos, así que sigue igual leyendo de esta tabla en vez de contar
-- paradas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La tabla: un evento por acción en terreno, sin un solo dato personal
-- ----------------------------------------------------------------------------
create table if not exists encomienda_actividad (
  -- El id lo genera EL TELÉFONO (UUIDv7, igual que el resto del sistema — ver
  -- 0005), no la base. Es la clave de idempotencia: el chofer marca entregas
  -- sin señal, la app las guarda y las reenvía cuando vuelve el internet, y
  -- ese reenvío puede repetirse (se cortó a mitad, el chofer recargó, el
  -- service worker reintentó). Con el id ya decidido en el origen, el reenvío
  -- choca contra la primary key y la app lo inserta con
  -- "on conflict (id) do nothing": el mismo evento nunca se cuenta dos veces.
  --
  -- Se pide UUIDv7 y no v4 justamente porque lo genera el cliente: v7 lleva la
  -- hora adelante, así que los inserts siguen cayendo al final del índice en
  -- vez de dispersarse (v4 fragmentaría el índice).
  id uuid primary key,
  empresa_id uuid not null references empresa(id) on delete cascade,
  -- set null (no restrict): permite eliminar del todo a un chofer (ver
  -- eliminarChofer / migración 0015) sin perder el historial de actividad, que
  -- es la base de liquidaciones ya pagadas. Mismo criterio que
  -- encomienda_rutas.chofer_id en la 0017.
  chofer_id uuid references choferes(id) on delete set null,
  -- Día de trabajo al que se imputa el evento, en fecha local de Chile — la
  -- manda el teléfono (hoyChile()), no se deduce de la hora del servidor: una
  -- entrega de las 21:30 en Arica ya es del día siguiente en UTC, y ese
  -- corrimiento movería el pago de un día al otro.
  fecha date not null,
  -- 'entrega'  → cuenta como entregada (base del ingreso y del pago por pedido)
  -- 'omision'  → salió a la dirección y no se pudo entregar
  -- 'llamada'  → llamó al destinatario. No suma ni resta al conteo: existe
  --              solo para que un día en que el chofer salió, llamó a todos y
  --              no logró entregar nada igual cuente como DÍA TRABAJADO y se
  --              pague el fijo diario. Reemplaza por completo el mecanismo de
  --              encomienda_rutas.estado = 'en_curso' de la 0025, y de paso el
  --              bug que esa migración vino a tapar: acá no hay nada que
  --              regenerar, así que rehacer la ruta no puede borrar la prueba
  --              de que el chofer trabajó.
  tipo text not null check (tipo in ('entrega', 'omision', 'llamada')),
  -- Cuándo ocurrió DE VERDAD, según el teléfono. Sin default: la manda la app,
  -- porque el evento pudo haber pasado horas antes de poder enviarlo.
  hora timestamptz not null,
  -- Cuándo llegó al servidor. La diferencia con "hora" es el retraso por falta
  -- de señal — sirve para saber si un chofer está trabajando en una zona sin
  -- cobertura sin tener que preguntarle.
  created_at timestamptz not null default now()
);

-- No hay updated_at ni trigger de updated_at a propósito: estas filas son
-- INMUTABLES. Un evento pasó o no pasó; no se edita. Corregir un toque
-- equivocado se hace borrando el evento (ver la policy de delete más abajo),
-- no reescribiéndolo.

comment on table encomienda_actividad is
  'Acciones del chofer en terreno, sin datos personales de destinatarios. Los pedidos, direcciones y el orden de la ruta viven en el teléfono del chofer (ver 0026).';

-- ----------------------------------------------------------------------------
-- 2. Índices
-- ----------------------------------------------------------------------------
-- Conteo por chofer y día (liquidación, y la pantalla del propio chofer).
-- Además cubre el índice que pide la FK chofer_id para que el "on delete set
-- null" no tenga que escanear la tabla entera.
create index if not exists idx_encomienda_actividad_chofer_fecha
  on encomienda_actividad (chofer_id, fecha);

-- Panel del periodo: todos los choferes de la empresa en un rango de fechas.
-- Lleva empresa_id primero porque toda consulta pasa por RLS de empresa.
create index if not exists idx_encomienda_actividad_empresa_fecha
  on encomienda_actividad (empresa_id, fecha);

-- ----------------------------------------------------------------------------
-- 3. empresa_id automático (mismo trigger que el resto del sistema)
-- ----------------------------------------------------------------------------
drop trigger if exists trg_encomienda_actividad_empresa on encomienda_actividad;
create trigger trg_encomienda_actividad_empresa before insert on encomienda_actividad
  for each row execute function set_empresa_id();

-- ----------------------------------------------------------------------------
-- 4. RLS: mismo patrón que el resto del sistema
--    admin/operador: todo · contador: solo lectura · chofer: solo lo suyo
--
-- El chofer inserta DIRECTO (no por función SECURITY DEFINER como en la 0025):
-- acá no hay nada que validar contra otras filas —no hay secuencias, ni
-- paradas ajenas, ni estados que sincronizar— así que la policy alcanza y
-- sobra. Es la simplificación de fondo de este cambio.
-- ----------------------------------------------------------------------------
alter table encomienda_actividad enable row level security;

drop policy if exists encomienda_actividad_admin_op_all on encomienda_actividad;
create policy encomienda_actividad_admin_op_all on encomienda_actividad for all to authenticated
  using ((select private.get_rol()) in ('admin', 'operador'))
  with check ((select private.get_rol()) in ('admin', 'operador'));

drop policy if exists encomienda_actividad_contador_read on encomienda_actividad;
create policy encomienda_actividad_contador_read on encomienda_actividad for select to authenticated
  using ((select private.get_rol()) = 'contador');

drop policy if exists encomienda_actividad_chofer_read on encomienda_actividad;
create policy encomienda_actividad_chofer_read on encomienda_actividad for select to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- Solo puede registrar actividad A SU PROPIO nombre. Sin esto, un chofer con
-- el token de su sesión podría sumarle (o restarle) entregas a otro.
drop policy if exists encomienda_actividad_chofer_insert on encomienda_actividad;
create policy encomienda_actividad_chofer_insert on encomienda_actividad for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- NO hay policy de update para el chofer: los eventos no se editan.
--
-- Sí puede BORRAR los suyos de las últimas 12 horas, y solo esos: es la vuelta
-- atrás de un toque equivocado ("marqué entregado en la parada de al lado"),
-- que hoy resuelve volviendo a marcar la parada. La ventana lo deja arreglar
-- un error de la jornada en curso sin poder tocar días ya liquidados. Se usa
-- "hora > now() - interval" y no la fecha para no depender de la zona horaria
-- del servidor (Postgres en Supabase corre en UTC, la empresa en Arica).
drop policy if exists encomienda_actividad_chofer_delete on encomienda_actividad;
create policy encomienda_actividad_chofer_delete on encomienda_actividad for delete to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and hora > now() - interval '12 hours'
  );
