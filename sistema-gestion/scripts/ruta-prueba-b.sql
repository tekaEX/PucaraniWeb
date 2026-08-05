-- ============================================================================
-- Ruta de prueba B — saca los pedidos de prueba que había y pone otros diez.
-- Correr en Supabase → SQL Editor, de arriba a abajo. Borrar este archivo
-- cuando ya no haga falta.
--
-- ⚠️ BORRA DATOS: los 12 pedidos de prueba (con sus paradas, en cascada) y las
--    4 rutas viejas que quedan en la base. El paso 1 aborta todo si encuentra
--    algún pedido que NO sea de prueba, así que es seguro correrlo tal cual.
--
-- ⚠️ ANTES DE ESTO, BORRÁ LO GUARDADO EN EL TELÉFONO. La ruta que corriste hoy
--    no vive acá, vive en el teléfono del chofer (IndexedDB), y esto no la toca:
--      · en el navegador: DevTools → Application → IndexedDB →
--        "pucarani-encomiendas" → Delete database
--      · en el teléfono: borrar los datos del sitio y volver a entrar
--    Si no lo hacés, el chofer va a terminar con los 12 pedidos viejos MÁS los
--    10 nuevos. Y si te queda algo en la cola de envío sin salir, se va a
--    reenviar después de que borres la actividad en el paso 5.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Si querés guardarte los viejos antes de borrarlos, corré solo esto y copiá
--    el resultado a una planilla. Son todos de prueba, así que no hace falta.
-- ----------------------------------------------------------------------------
-- select destinatario_nombre, destinatario_telefono, destinatario_direccion,
--        destinatario_lat, destinatario_lng, estado, fecha_pedido
--   from encomienda_pedidos order by fecha_pedido, destinatario_nombre;

-- ----------------------------------------------------------------------------
-- 1. Freno de mano: si hay un pedido real, no se borra nada.
-- ----------------------------------------------------------------------------
do $$
declare reales int;
begin
  select count(*) into reales
    from encomienda_pedidos
   where destinatario_nombre not like 'Prueba%';

  if reales > 0 then
    raise exception
      'Hay % pedidos que NO son de prueba. Revisalos antes de borrar nada.', reales;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Fuera los de prueba. encomienda_paradas se va en cascada (la FK
--    pedido_id es "on delete cascade", ver migración 0017).
-- ----------------------------------------------------------------------------
delete from encomienda_pedidos
 where destinatario_nombre like 'Prueba%';

-- ----------------------------------------------------------------------------
-- 3. Las rutas de la base quedaron sin ninguna parada: se van también. Estas
--    tablas ya no las usa la app —la ruta del día vive en el teléfono— y la
--    migración 0027 las retira del todo.
-- ----------------------------------------------------------------------------
delete from encomienda_rutas r
 where not exists (select 1 from encomienda_paradas p where p.ruta_id = r.id);

-- ----------------------------------------------------------------------------
-- 4. La ruta nueva: diez direcciones distintas de las anteriores.
--
--    Cada una fue verificada una por una con el geocodificador de la app y las
--    diez resolvieron a una PUERTA exacta (con número de casa), no a la calle
--    ni a un barrio: por eso van con lat/lng ya puestos y el teléfono no tiene
--    que geocodificar nada al traerlas.
--
--    A propósito recorren el eje norte-sur de Arica (Capitán Ávalos → Vicuña
--    Mackenna) en vez de concentrarse en el centro y la costanera como el juego
--    anterior: así la ruta que sale es visiblemente otra.
-- ----------------------------------------------------------------------------
insert into encomienda_pedidos
  (destinatario_nombre, destinatario_telefono, destinatario_direccion,
   destinatario_lat, destinatario_lng, notas)
values
  ('Prueba — Álvaro Fuentes', '+56912220001', 'Avenida Capitán Ávalos 3500',   -18.44763, -70.28151, 'Ruta de prueba B'),
  ('Prueba — Rosa Mamani',    '+56912220002', 'Avenida Linderos 1800',         -18.45206, -70.28462, 'Ruta de prueba B'),
  ('Prueba — Hugo Tapia',     '+56912220003', 'Avenida Santa María 2500',      -18.46492, -70.29954, 'Ruta de prueba B'),
  ('Prueba — Nadia Choque',   '+56912220004', 'Avenida Loa 1200',              -18.46998, -70.29473, 'Ruta de prueba B'),
  ('Prueba — Iván Cortés',    '+56912220005', 'Avenida General Velásquez 1300',-18.47395, -70.31402, 'Ruta de prueba B'),
  ('Prueba — Sofía Araya',    '+56912220006', 'Patricio Lynch 1100',           -18.47605, -70.31314, 'Ruta de prueba B'),
  ('Prueba — Elena Quispe',   '+56912220007', 'Maipú 600',                     -18.47935, -70.31510, 'Ruta de prueba B'),
  ('Prueba — Mario Bustos',   '+56912220008', 'Pedro Aguirre Cerda 1200',      -18.48208, -70.30481, 'Ruta de prueba B'),
  ('Prueba — Camila Flores',  '+56912220009', 'Yungay 900',                    -18.48261, -70.31823, 'Ruta de prueba B'),
  ('Prueba — Diego Salinas',  '+56912220010', 'Vicuña Mackenna 1000',          -18.48411, -70.31468, 'Ruta de prueba B');

-- ----------------------------------------------------------------------------
-- 5. OPCIONAL — la actividad de las pruebas de ayer y hoy.
--
--    Son 15 eventos (5 entregas, 9 omisiones, 2 llamadas) que NO ocurrieron, y
--    encomienda_actividad es de donde salen los ingresos de encomiendas y la
--    liquidación del chofer. encomienda_pagos está vacía, así que nada de esto
--    se pagó todavía: se puede borrar limpio.
--
--    Quitá los guiones de las tres líneas para ejecutarlo. Hacelo DESPUÉS de
--    borrar lo guardado en el teléfono, o la cola de envío lo vuelve a mandar.
-- ----------------------------------------------------------------------------
-- delete from encomienda_actividad
--  where fecha in ('2026-08-03', '2026-08-04')
--    and chofer_id = (select id from choferes where nombre = 'Etian');

-- ----------------------------------------------------------------------------
-- 6. Comprobación. Tiene que quedar: 10 pedidos, todos "pendiente",
--    0 paradas y 0 rutas.
-- ----------------------------------------------------------------------------
select 'pedidos' as tabla, estado, count(*)
  from encomienda_pedidos group by estado
union all
select 'paradas', '—', count(*) from encomienda_paradas
union all
select 'rutas',   '—', count(*) from encomienda_rutas
union all
select 'actividad', fecha::text, count(*)
  from encomienda_actividad group by fecha
order by 1, 2;
