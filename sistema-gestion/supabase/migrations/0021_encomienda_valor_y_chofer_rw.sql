-- ============================================================================
-- 0021 — Elimina "valor" del pedido + el chofer puede cargar/editar pedidos
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Pucarani reparte encomiendas de Starken como subcontratista: el valor real
-- de cada envío lo maneja el sistema interno de Starken, Pucarani nunca lo
-- conoce. En vez de guardar un dato que nunca vamos a tener, se elimina la
-- columna por completo — los ingresos se estiman como
-- (pedidos entregados × valor aproximado fijo), ver VALOR_APROXIMADO_PEDIDO
-- en encomiendas/actions.ts.
--
-- El chofer ahora puede cargar y editar pedidos (no eliminar — eso sigue
-- siendo solo admin/operador, vía la policy "_admin_op_all" ya existente).
-- ============================================================================

alter table encomienda_pedidos drop column if exists valor;

drop policy if exists encomienda_pedidos_chofer_select on encomienda_pedidos;
create policy encomienda_pedidos_chofer_select on encomienda_pedidos for select to authenticated
  using ((select private.get_rol()) = 'chofer');

drop policy if exists encomienda_pedidos_chofer_insert on encomienda_pedidos;
create policy encomienda_pedidos_chofer_insert on encomienda_pedidos for insert to authenticated
  with check ((select private.get_rol()) = 'chofer');

drop policy if exists encomienda_pedidos_chofer_update on encomienda_pedidos;
create policy encomienda_pedidos_chofer_update on encomienda_pedidos for update to authenticated
  using ((select private.get_rol()) = 'chofer')
  with check ((select private.get_rol()) = 'chofer');
