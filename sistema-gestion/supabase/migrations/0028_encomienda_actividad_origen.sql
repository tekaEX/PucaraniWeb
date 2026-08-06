-- ============================================================================
-- 0028 — De dónde salió cada evento: del teléfono del chofer o cargado a mano
--        desde la oficina. Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ESTA MIGRACIÓN NO BORRA NADA. Agrega una columna con default, así que las
-- filas que ya existen quedan marcadas como 'app', que es lo que son: hasta
-- hoy la ÚNICA forma de que naciera una fila en encomienda_actividad era que
-- el teléfono de un chofer la enviara.
--
-- Por qué hace falta: un día de trabajo solo existe si el teléfono lo registró
-- (ver la cabecera de la 0026). Si el chofer salió a repartir y su teléfono no
-- alcanzó a sincronizar —se quedó sin batería, se desinstaló la app, el día es
-- anterior a que la app existiera— ese día NO aparece en el panel y NO se
-- puede liquidar, aunque el chofer trabajó y hay que pagarle. La oficina
-- necesita poder cargarlo.
--
-- Pero un día cargado a mano y uno registrado en terreno NO son la misma cosa:
-- el primero es lo que alguien recuerda o anotó en un cuaderno, el segundo es
-- lo que ocurrió con hora y todo. Los dos suman igual al pago —esa es la
-- idea— pero quien mira el panel tiene derecho a saber cuál está viendo, y una
-- auditoría de una liquidación también.
--
-- Por qué una columna y no una tabla aparte de "días manuales": porque el
-- conteo del pago (src/lib/encomiendas/pago.ts) cuenta FILAS de esta tabla. Con
-- una tabla paralela habría dos fuentes de verdad que sumar en todos lados
-- —el panel del periodo, la vista del día, confirmarPagosPeriodo— y basta que
-- una se olvide de sumar la otra para que la proyección y lo confirmado
-- dejen de coincidir sin que nadie se entere. Con la columna, todo lo que ya
-- está escrito sigue funcionando sin tocarse: un día manual se cuenta solo.
--
-- Por qué una fila por entrega y no una sola fila con un número: mismo motivo.
-- "Un evento = una fila" es el modelo de la 0026 y de él dependen contarActividad,
-- agruparPorDia y el cálculo del pago. Una fila con cantidad=32 obligaría a
-- cambiar la forma de contar en todas partes a cambio de ahorrar 31 filas en
-- una tabla que crece ~1.500 filas al mes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. La columna
-- ----------------------------------------------------------------------------
-- 'app'    → lo envió el teléfono del chofer (lo de siempre; es el default,
--            así que enviar.ts no tiene que mandar nada nuevo).
-- 'manual' → lo cargó admin/operador desde /encomiendas. La "hora" de estas
--            filas es de relleno (mediodía UTC del día cargado): nadie sabe a
--            qué hora fue cada entrega, y ninguna pantalla debe mostrarla como
--            si lo supiera.
alter table encomienda_actividad
  add column if not exists origen text not null default 'app';

-- El check va aparte del add column para que re-ejecutar el archivo lo repare
-- si la columna quedó creada sin la restricción en un intento a medias.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'encomienda_actividad_origen_check'
  ) then
    alter table encomienda_actividad
      add constraint encomienda_actividad_origen_check
      check (origen in ('app', 'manual'));
  end if;
end $$;

comment on column encomienda_actividad.origen is
  'app = enviado por el teléfono del chofer · manual = cargado por la oficina en /encomiendas (la hora es de relleno). Ver 0028.';

-- ----------------------------------------------------------------------------
-- 2. El chofer no puede marcar nada como 'manual'
--
-- Las dos policies del chofer se recrean idénticas a la 0026 salvo por la
-- condición nueva. Sin esto, un chofer con el token de su sesión podría
-- insertar actividad haciéndola pasar por carga de oficina, o —peor— BORRAR lo
-- que la oficina cargó a su nombre usando su policy de delete de 12 horas.
-- El default es 'app', así que la app del chofer sigue funcionando sin cambios.
-- ----------------------------------------------------------------------------
drop policy if exists encomienda_actividad_chofer_insert on encomienda_actividad;
create policy encomienda_actividad_chofer_insert on encomienda_actividad for insert to authenticated
  with check (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and origen = 'app'
  );

drop policy if exists encomienda_actividad_chofer_delete on encomienda_actividad;
create policy encomienda_actividad_chofer_delete on encomienda_actividad for delete to authenticated
  using (
    (select private.get_rol()) = 'chofer'
    and chofer_id in (select id from choferes where user_id = (select auth.uid()))
    and hora > now() - interval '12 hours'
    and origen = 'app'
  );

-- admin/operador conservan el "for all" de la 0026: son los únicos que pueden
-- escribir 'manual', y los únicos que pueden borrar una carga manual.
