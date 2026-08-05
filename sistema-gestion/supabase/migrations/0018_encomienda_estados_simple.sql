-- ============================================================================
-- 0018 — Simplifica encomienda_pedidos.estado a solo pendiente/entregado
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Decisión del dueño: empezar con el mínimo de estados posible y agregar más
-- solo cuando realmente se necesiten, en vez de adivinarlos todos de una.
-- "pendiente" ya cubre tanto "nunca se intentó entregar" como "se intentó y
-- no se pudo" — un pedido no entregado simplemente sigue pendiente y entra
-- de nuevo en la próxima ruta que se genere. No hace falta un estado
-- intermedio "programado": generarRuta ya recalcula desde CERO todos los
-- pedidos pendientes cada vez que se corre, tengan o no una parada activa.
-- ============================================================================

-- Ya no hace falta "programado" como paso intermedio (ver arriba).
drop trigger if exists trg_encomienda_parada_programado on encomienda_paradas;
drop function if exists encomienda_parada_marcar_programado();

-- Ya no hace falta "liberar" el pedido al borrar una parada: un pedido
-- "pendiente" no tiene a qué volver, y uno "entregado" no debe des-entregarse
-- solo porque se regeneró la ruta de otro día.
drop trigger if exists trg_encomienda_parada_liberar on encomienda_paradas;
drop function if exists encomienda_parada_liberar_pedido();

-- Antes de estrechar el check, lleva cualquier estado que ya no exista de
-- vuelta a "pendiente" (no debería haber ninguno aún, pero por si acaso).
update encomienda_pedidos
   set estado = 'pendiente'
 where estado not in ('pendiente', 'entregado');

alter table encomienda_pedidos drop constraint if exists encomienda_pedidos_estado_check;
alter table encomienda_pedidos add constraint encomienda_pedidos_estado_check
  check (estado in ('pendiente', 'entregado'));

-- El estado de entrega de la parada sigue sincronizando el del pedido, ahora
-- con el set reducido de estados.
create or replace function encomienda_parada_sincronizar_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado_entrega is distinct from old.estado_entrega then
    if new.estado_entrega = 'entregado' then
      update encomienda_pedidos set estado = 'entregado' where id = new.pedido_id;
      new.hora_entrega := coalesce(new.hora_entrega, now());
    elsif new.estado_entrega = 'omitido' then
      update encomienda_pedidos set estado = 'pendiente' where id = new.pedido_id;
    end if;
  end if;
  return new;
end $$;

revoke execute on function encomienda_parada_sincronizar_pedido() from public, anon, authenticated;
