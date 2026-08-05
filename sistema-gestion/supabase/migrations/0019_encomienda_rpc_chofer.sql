-- ============================================================================
-- 0019 — RPCs para que el chofer marque llamada/entrega de SU propia parada
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- El chofer NO tiene policy de UPDATE directa sobre encomienda_paradas (ver
-- 0017): así no puede tocar secuencia/pedido_id de una parada ajena. Estas
-- funciones SECURITY DEFINER son el único camino de escritura para el rol
-- chofer, y validan por dentro que la parada pertenece a su propia ruta.
-- Mismo patrón que next_cotizacion_numero (0012).
-- ============================================================================

create or replace function encomienda_marcar_llamada(p_parada_id uuid, p_resultado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
begin
  if p_resultado not in ('contesto', 'no_contesto') then
    raise exception 'Resultado de llamada inválido: %', p_resultado;
  end if;

  select
    (select private.get_rol()) in ('admin', 'operador')
    or (c.user_id is not null and c.user_id = auth.uid())
  into v_permitido
  from encomienda_paradas p
  join encomienda_rutas r on r.id = p.ruta_id
  left join choferes c on c.id = r.chofer_id
  where p.id = p_parada_id;

  if v_permitido is not true then
    raise exception 'Parada no encontrada o sin permiso.';
  end if;

  update encomienda_paradas
     set estado_llamada = p_resultado, hora_llamada = now()
   where id = p_parada_id;
end;
$$;

revoke execute on function encomienda_marcar_llamada(uuid, text) from public, anon;
grant execute on function encomienda_marcar_llamada(uuid, text) to authenticated;

create or replace function encomienda_marcar_entrega(p_parada_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
begin
  if p_estado not in ('entregado', 'omitido') then
    raise exception 'Estado de entrega inválido: %', p_estado;
  end if;

  select
    (select private.get_rol()) in ('admin', 'operador')
    or (c.user_id is not null and c.user_id = auth.uid())
  into v_permitido
  from encomienda_paradas p
  join encomienda_rutas r on r.id = p.ruta_id
  left join choferes c on c.id = r.chofer_id
  where p.id = p_parada_id;

  if v_permitido is not true then
    raise exception 'Parada no encontrada o sin permiso.';
  end if;

  -- El trigger trg_encomienda_parada_sincronizar (0017/0018) sincroniza
  -- encomienda_pedidos.estado al aplicar este update.
  update encomienda_paradas
     set estado_entrega = p_estado
   where id = p_parada_id;
end;
$$;

revoke execute on function encomienda_marcar_entrega(uuid, text) from public, anon;
grant execute on function encomienda_marcar_entrega(uuid, text) to authenticated;
