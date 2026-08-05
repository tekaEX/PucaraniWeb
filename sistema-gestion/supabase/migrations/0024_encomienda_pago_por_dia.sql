-- ============================================================================
-- 0024 — Pago por día trabajado + índices por fecha para el panel del periodo
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- El dueño paga al repartidor de dos formas a la vez: un fijo por cada DÍA
-- que salió a repartir, más lo que corresponda por CANTIDAD de pedidos
-- entregados. La 0017 solo modeló lo segundo (porcentaje o monto fijo por
-- pedido, más un bono por meta diaria), así que la mitad de la liquidación no
-- se podía calcular.
--
-- monto_dia entra con default 0: todas las reglas que ya existen siguen
-- pagando exactamente lo mismo que antes de esta migración.
--
-- "Día trabajado" = día con al menos una parada CERRADA (entregada u
-- omitida). No sirve "día con ruta generada": la app del conductor genera la
-- ruta sola al abrirla (autoGenerar), así que abrirla un domingo por
-- curiosidad crearía un día trabajado fantasma. Cerrar una parada, en cambio,
-- exige una acción real en terreno. Y sí incluye los días en que salió y no
-- logró entregar nada: ese día igual se trabajó.
-- ============================================================================

alter table encomienda_reglas_pago
  add column if not exists monto_dia integer not null default 0;

alter table encomienda_reglas_pago drop constraint if exists encomienda_reglas_pago_monto_dia_check;
alter table encomienda_reglas_pago add constraint encomienda_reglas_pago_monto_dia_check
  check (monto_dia >= 0);

-- pago_total es una columna GENERADA (0017): no se puede extender su
-- expresión con un ALTER, hay que borrarla y volver a crearla. No se pierde
-- nada — su valor se recalcula solo a partir de los otros tres componentes.
alter table encomienda_pagos drop column if exists pago_total;

alter table encomienda_pagos
  add column if not exists pago_dia integer not null default 0;

alter table encomienda_pagos drop constraint if exists encomienda_pagos_pago_dia_check;
alter table encomienda_pagos add constraint encomienda_pagos_pago_dia_check
  check (pago_dia >= 0);

alter table encomienda_pagos
  add column if not exists pago_total integer
  generated always as (pago_base + pago_bono + pago_dia) stored;

-- ----------------------------------------------------------------------------
-- Índices para el panel por periodo (barre un mes/año completo por fecha).
-- Los que ya existían llevan chofer_id de columna líder, así que un filtro
-- solo por rango de fecha no los aprovecha. Y acá la columna líder es fecha a
-- secas, no (empresa_id, fecha): las consultas del panel filtran SOLO por
-- rango de fecha — el empresa_id lo pondría RLS, que hoy no filtra por
-- empresa — y Postgres no puede saltarse la primera columna de un índice.
-- ----------------------------------------------------------------------------
create index if not exists idx_encomienda_rutas_fecha
  on encomienda_rutas (fecha desc);

create index if not exists idx_encomienda_pagos_fecha
  on encomienda_pagos (fecha desc);
