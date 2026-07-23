-- ============================================================================
-- 0011 — Índice para ingresos por fecha de pago
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Los ingresos (Dashboard, desglose por cliente, estado de cuenta) filtran
-- facturas por rango de fecha_pago. Sin índice, cada carga escanea la tabla
-- completa; con miles de facturas se degrada. Parcial: solo pagadas.
-- ============================================================================

create index if not exists idx_facturas_pago
  on facturas (empresa_id, fecha_pago desc)
  where fecha_pago is not null;
