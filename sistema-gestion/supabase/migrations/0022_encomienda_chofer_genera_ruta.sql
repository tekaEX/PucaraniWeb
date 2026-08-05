-- ============================================================================
-- 0022 — El chofer puede generar/regenerar su propia ruta del día
-- Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Antes solo admin/operador podía crear encomienda_rutas/encomienda_paradas
-- (ver policy "_admin_op_all" en 0017). generarRuta() ahora acepta un
-- chofer_id opcional y, llamada desde /conductor/encomiendas, pasa el propio
-- id del chofer logueado — pero sin estas policies, el insert/update se
-- caía silenciosamente por RLS. Igual que el resto del sistema: el chofer
-- solo puede escribir SU PROPIA fila (chofer_id vinculado a su user_id), no
-- la de otro chofer.
-- ============================================================================

drop policy if exists encomienda_rutas_chofer_write on encomienda_rutas;
create policy encomienda_rutas_chofer_write on encomienda_rutas for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

drop policy if exists encomienda_rutas_chofer_update on encomienda_rutas;
create policy encomienda_rutas_chofer_update on encomienda_rutas for update to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  )
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
  );

-- generarRuta() borra y vuelve a insertar TODAS las paradas de la ruta cada
-- vez que se corre (no hace update de paradas existentes) — de ahí insert +
-- delete, sin update.
drop policy if exists encomienda_paradas_chofer_write on encomienda_paradas;
create policy encomienda_paradas_chofer_write on encomienda_paradas for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and ruta_id in (
      select r.id from encomienda_rutas r
      join choferes c on c.id = r.chofer_id
      where c.user_id = (select auth.uid())
    )
  );

drop policy if exists encomienda_paradas_chofer_delete on encomienda_paradas;
create policy encomienda_paradas_chofer_delete on encomienda_paradas for delete to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and ruta_id in (
      select r.id from encomienda_rutas r
      join choferes c on c.id = r.chofer_id
      where c.user_id = (select auth.uid())
    )
  );
