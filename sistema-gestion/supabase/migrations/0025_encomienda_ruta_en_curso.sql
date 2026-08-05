-- ============================================================================
-- 0025 — La ruta queda marcada "en_curso" en cuanto el conductor cierra una
--        parada. Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Por qué: "día trabajado" (lo que dispara el fijo diario de la 0024) se
-- deducía SOLO de las paradas cerradas de la ruta. Pero regenerar la ruta
-- borra y reinserta las paradas pendientes/omitidas, así que un conductor que
-- salió, no logró ninguna entrega (marcó todo "no contestó") y después
-- regeneró la ruta para reintentar, dejaba el día con cero paradas cerradas:
-- el panel lo mostraba como "Sin actividad" y perdía el fijo del día.
--
-- encomienda_rutas.estado ya existía con los valores generada/en_curso/
-- finalizada (0017) pero nadie lo escribía nunca. Ahora lo estampan las dos
-- funciones por las que pasa TODA acción del conductor en terreno, y ese
-- estado sobrevive a cualquier regeneración posterior (generarRuta ya no pisa
-- "estado" al actualizar una ruta existente).
-- ============================================================================

create or replace function encomienda_marcar_llamada(p_parada_id uuid, p_resultado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_ruta_id uuid;
begin
  if p_resultado not in ('contesto', 'no_contesto') then
    raise exception 'Resultado de llamada inválido: %', p_resultado;
  end if;

  select
    (select private.get_rol()) in ('admin', 'operador')
    or (c.user_id is not null and c.user_id = auth.uid()),
    p.ruta_id
  into v_permitido, v_ruta_id
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

  -- Llamar a un destinatario ya es trabajo del día: queda registrado aunque
  -- después se regenere la ruta y esta parada desaparezca.
  update encomienda_rutas set estado = 'en_curso'
   where id = v_ruta_id and estado = 'generada';
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
  v_ruta_id uuid;
begin
  if p_estado not in ('entregado', 'omitido') then
    raise exception 'Estado de entrega inválido: %', p_estado;
  end if;

  select
    (select private.get_rol()) in ('admin', 'operador')
    or (c.user_id is not null and c.user_id = auth.uid()),
    p.ruta_id
  into v_permitido, v_ruta_id
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

  update encomienda_rutas set estado = 'en_curso'
   where id = v_ruta_id and estado = 'generada';
end;
$$;

revoke execute on function encomienda_marcar_entrega(uuid, text) from public, anon;
grant execute on function encomienda_marcar_entrega(uuid, text) to authenticated;

-- Backfill: las rutas históricas que ya tienen alguna parada cerrada también
-- fueron días trabajados, aunque nadie estampara el estado en su momento.
update encomienda_rutas r
   set estado = 'en_curso'
 where r.estado = 'generada'
   and exists (
     select 1 from encomienda_paradas p
      where p.ruta_id = r.id and p.estado_entrega <> 'pendiente'
   );
