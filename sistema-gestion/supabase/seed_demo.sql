-- ============================================================================
-- DATOS DE PRUEBA — Transportes Pucarani (esquema v2)
-- Ejecutar en Supabase > SQL Editor (corre como admin, salta RLS).
--
-- · Evergreen: todas las fechas se calculan RELATIVAS al día de ejecución,
--   así el mes en curso siempre tiene movimiento, el anterior sirve de
--   comparación ("+12% vs. mes pasado") y las alertas de documentos
--   cuentan una historia curada (1 vencida + 2 por vencer).
-- · Deja al usuario admin619619@gmail.com con rol admin.
-- · RE-EJECUTABLE: borra viajes/facturas/cotizaciones/gastos de la empresa
--   y los vuelve a crear (catálogos se conservan y actualizan). No usar
--   sobre una base con datos reales.
--
-- La historia que cuenta (mes 0 = mes en curso):
--   Ingresos cobrados:  -5: $420k · -4: $510k · -3: $470k · -2: $610k
--                       -1: $690k · mes 0: $775k  (+12% vs. mes anterior)
--   Gastos de flota:    -5: $227k · -4: $198k · -3: $275k · -2: $370k
--                       -1: $454k · mes 0: $442k  (margen 43% este mes)
--   Además: 1 factura por cobrar vigente, 1 vencida (+40 días),
--   1 viaje por facturar, 1 viaje programado, 1 factura con 2 viajes.
-- ============================================================================

-- Día `d` del mes actual desplazado `m` meses; en el mes en curso nunca
-- genera fechas futuras (se limita a hoy).
create or replace function pg_temp.dia(m int, d int) returns date
language plpgsql as $$
declare
  r date := (date_trunc('month', current_date) + make_interval(months => m, days => d - 1))::date;
begin
  if m = 0 and r > current_date then
    r := current_date;
  end if;
  return r;
end $$;

do $$
declare
  v_user    uuid;
  v_empresa uuid;
  v_epa     uuid;
  v_tpa     uuid;
  v_erispe  uuid;
  v_cho1    uuid;  -- Raúl Mamani
  v_cho2    uuid;  -- Juan Pérez
  -- La patente ES el identificador del vehículo (PK desde la migración 0008).
  v_veh1    text := 'JKLM-12';
  v_veh2    text := 'GHPR-34';
  v_cot1188 uuid;
  v_cot1181 uuid;
  v_cot1179 uuid;
  v_fac     uuid;
  v_viaje   uuid;
begin
  -- --------------------------------------------------------------------------
  -- 1. Usuario admin
  -- --------------------------------------------------------------------------
  select id into v_user from auth.users where email = 'admin619619@gmail.com';
  if v_user is null then
    raise exception 'No existe admin619619@gmail.com en auth.users — crea la cuenta primero.';
  end if;

  insert into perfiles (id, nombre, rol, activo)
  values (v_user, 'Administrador', 'admin', true)
  on conflict (id) do update set rol = 'admin', activo = true;

  -- --------------------------------------------------------------------------
  -- 2. Empresa (una sola)
  -- --------------------------------------------------------------------------
  select id into v_empresa from empresa order by created_at limit 1;
  if v_empresa is null then
    insert into empresa (nombre, razon_social, rut, direccion, ciudad, giro, telefono, representante, proximo_numero_cotizacion)
    values ('Transportes Pucarani', 'Cristian Enrique Carreño Rosas', '12.345.678-9',
            'Quinsachata 1749', 'Arica', 'Traslado de Personal y Operador Turístico',
            '+569983417385', 'Cristian Enrique Carreño Rosas', 1189)
    returning id into v_empresa;
  end if;

  -- --------------------------------------------------------------------------
  -- 3. Limpieza de transaccionales (re-ejecutable)
  -- --------------------------------------------------------------------------
  delete from viajes where empresa_id = v_empresa;            -- cascade: asignaciones
  delete from facturas where empresa_id = v_empresa;
  delete from cotizaciones where empresa_id = v_empresa;      -- cascade: items
  delete from gastos_vehiculo where empresa_id = v_empresa;
  update empresa set proximo_numero_cotizacion = 1189 where id = v_empresa;

  -- --------------------------------------------------------------------------
  -- 4. Clientes
  -- --------------------------------------------------------------------------
  select id into v_epa from clientes where empresa_id = v_empresa and codigo = 'epa';
  if v_epa is null then
    insert into clientes (empresa_id, nombre, codigo, rut, direccion)
    values (v_empresa, 'Empresa Portuaria Arica', 'epa', '61.945.700-5', 'Av. Máximo Lira 389, Arica')
    returning id into v_epa;
  else
    update clientes set rut = '61.945.700-5', direccion = 'Av. Máximo Lira 389, Arica' where id = v_epa;
  end if;

  select id into v_tpa from clientes where empresa_id = v_empresa and codigo = 'tpa';
  if v_tpa is null then
    insert into clientes (empresa_id, nombre, codigo, rut, direccion)
    values (v_empresa, 'Terminal Puerto Arica', 'tpa', '99.567.620-6', 'Av. Comandante San Martín 255, Arica')
    returning id into v_tpa;
  else
    update clientes set rut = '99.567.620-6', direccion = 'Av. Comandante San Martín 255, Arica' where id = v_tpa;
  end if;

  select id into v_erispe from clientes where empresa_id = v_empresa and codigo = 'erispe';
  if v_erispe is null then
    insert into clientes (empresa_id, nombre, codigo)
    values (v_empresa, 'Erispe Ltda.', 'erispe')
    returning id into v_erispe;
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Choferes (licencias: 1 por vencer en 12 días, 1 vigente)
  -- --------------------------------------------------------------------------
  select id into v_cho1 from choferes where empresa_id = v_empresa and rut = '10.111.222-3';
  if v_cho1 is null then
    insert into choferes (empresa_id, nombre, rut, telefono, licencia_numero, licencia_clase, licencia_vencimiento)
    values (v_empresa, 'Raúl Mamani', '10.111.222-3', '+56 9 5555 1111', 'A3-123456', 'A3', current_date + 12)
    returning id into v_cho1;
  else
    update choferes set licencia_vencimiento = current_date + 12 where id = v_cho1;
  end if;

  select id into v_cho2 from choferes where empresa_id = v_empresa and rut = '12.333.444-5';
  if v_cho2 is null then
    insert into choferes (empresa_id, nombre, rut, telefono, licencia_numero, licencia_clase, licencia_vencimiento)
    values (v_empresa, 'Juan Pérez', '12.333.444-5', '+56 9 5555 2222', 'A3-654321', 'A3', current_date + 540)
    returning id into v_cho2;
  else
    update choferes set licencia_vencimiento = current_date + 540 where id = v_cho2;
  end if;

  -- --------------------------------------------------------------------------
  -- 6. Vehículos (documentos: 1 revisión vencida hace 6 días, 1 por vencer)
  -- --------------------------------------------------------------------------
  if not exists (select 1 from vehiculos where patente = v_veh1) then
    insert into vehiculos (empresa_id, patente, marca, modelo, anio, capacidad, km_actual,
                           revision_tecnica_venc, soap_venc, permiso_circulacion_venc)
    values (v_empresa, v_veh1, 'Mercedes-Benz', 'Sprinter', 2021, 19, 145000,
            current_date + 20, current_date + 160, current_date + 260);
  else
    update vehiculos set revision_tecnica_venc = current_date + 20,
                         soap_venc = current_date + 160,
                         permiso_circulacion_venc = current_date + 260
    where patente = v_veh1;
  end if;

  if not exists (select 1 from vehiculos where patente = v_veh2) then
    insert into vehiculos (empresa_id, patente, marca, modelo, anio, capacidad, km_actual,
                           revision_tecnica_venc, soap_venc, permiso_circulacion_venc)
    values (v_empresa, v_veh2, 'Hyundai', 'County', 2018, 28, 310000,
            current_date - 6, current_date + 45, current_date + 85);
  else
    update vehiculos set revision_tecnica_venc = current_date - 6,
                         soap_venc = current_date + 45,
                         permiso_circulacion_venc = current_date + 85
    where patente = v_veh2;
  end if;

  -- --------------------------------------------------------------------------
  -- 7. Cotizaciones
  -- --------------------------------------------------------------------------
  insert into cotizaciones (empresa_id, numero, fecha, fecha_validez, cliente_id, autor, titulo, nota_pie, exento_iva, estado, subtotal, iva, total)
  values (v_empresa, 1188, pg_temp.dia(0, 3), pg_temp.dia(0, 3) + 30, v_epa, 'c.carreño',
          'Transporte de pasajeros — bus de acercamiento',
          'En caso de sufrir algún desperfecto la máquina en servicio, contamos con máquinas de reemplazo al instante.',
          true, 'enviada', 750000, 0, 750000)
  returning id into v_cot1188;

  insert into cotizacion_items (cotizacion_id, orden, descripcion, cantidad, valor_unitario, total) values
    (v_cot1188, 0, 'Día 15 — desde casino el morro al regimiento Rancagua, Museo Azapa, retorno casino el morro.', 1, 80000, 80000),
    (v_cot1188, 1, 'Día 16 — Todo el día, desde 07:30 hasta las 20:00. Putre.', 1, 350000, 350000),
    (v_cot1188, 2, 'Día 17 — Todo el día a Tacna, desde las 07:30 hasta las 21:00 aprox. Regreso a Arica.', 1, 240000, 240000),
    (v_cot1188, 3, 'Día 18 — Desde las 8:30 hasta las 14:00. Casino morro hacia brigada, Coraceros-morro-restaurant (por indicar).', 1, 80000, 80000);

  insert into cotizaciones (empresa_id, numero, fecha, fecha_validez, cliente_id, autor, titulo, exento_iva, estado, subtotal, iva, total)
  values (v_empresa, 1181, current_date - 45, current_date - 15, v_epa, 'c.carreño',
          'Interior puerto — traslado de personal', true, 'aceptada', 60000, 0, 60000)
  returning id into v_cot1181;

  insert into cotizacion_items (cotizacion_id, orden, descripcion, cantidad, valor_unitario, total)
  values (v_cot1181, 0, 'Recorrido interior puerto, ida y vuelta.', 1, 60000, 60000);

  insert into cotizaciones (empresa_id, numero, fecha, fecha_validez, cliente_id, autor, titulo, exento_iva, estado, subtotal, iva, total)
  values (v_empresa, 1179, pg_temp.dia(-1, 13), pg_temp.dia(-1, 13) + 30, v_tpa, 'c.carreño',
          'CIOP — traslado de autoridades', true, 'aceptada', 180000, 0, 180000)
  returning id into v_cot1179;

  insert into cotizacion_items (cotizacion_id, orden, descripcion, cantidad, valor_unitario, total)
  values (v_cot1179, 0, 'Servicio CIOP, jornada completa.', 1, 180000, 180000);

  -- --------------------------------------------------------------------------
  -- 8. Viajes + facturas (todas exentas: tipo_dte 34, iva 0)
  --    Ingresos por mes (fecha_pago): ver cabecera.
  -- --------------------------------------------------------------------------

  -- MES 0 · pagadas ($775.000) ------------------------------------------------
  -- CIOP (de la cotización 1179): servicio mes -1, cobrado este mes.
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_tpa, 34, 463, pg_temp.dia(-1, 20), 'emitida', 105000, 0, 105000, pg_temp.dia(0, 2))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, cotizacion_id, factura_id, descripcion, fecha_inicio, estado, valor, orden_compra, costo_combustible, costo_peajes, costo_viaticos)
  values (v_empresa, v_tpa, v_cot1179, v_fac, 'CIOP — traslado de autoridades', pg_temp.dia(-1, 13), 'realizado', 105000, '4800021778', 35000, 8000, 12000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh1);

  -- Conozca su puerto.
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_epa, 34, 468, pg_temp.dia(0, 1), 'emitida', 180000, 0, 180000, pg_temp.dia(0, 3))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible)
  values (v_empresa, v_epa, v_fac, 'Conozca su puerto', pg_temp.dia(0, 1), 'realizado', 180000, 30000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh2);

  -- Día del patrimonio: UNA factura que agrupa DOS viajes.
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_epa, 34, 469, pg_temp.dia(0, 2), 'emitida', 490000, 0, 490000, pg_temp.dia(0, 4))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible, costo_viaticos)
  values (v_empresa, v_epa, v_fac, 'Día del patrimonio — circuito centro', pg_temp.dia(0, 2), 'realizado', 290000, 50000, 30000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh2);
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible, costo_otros)
  values (v_empresa, v_epa, v_fac, 'Día del patrimonio — circuito costero', pg_temp.dia(0, 2), 'realizado', 200000, 40000, 15000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh1);

  -- MES 0 · por cobrar vigente ($70.000) ---------------------------------------
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total)
  values (v_empresa, v_tpa, 34, 473, pg_temp.dia(0, 3), 'emitida', 70000, 0, 70000)
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, orden_compra, costo_combustible)
  values (v_empresa, v_tpa, v_fac, 'Visitas guiadas puerto', pg_temp.dia(0, 3), 'realizado', 70000, '4800021997', 12000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh1);

  -- Por cobrar VENCIDA (emitida hace 40 días, $60.000, de la cotización 1181) --
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total)
  values (v_empresa, v_epa, 34, 471, current_date - 40, 'emitida', 60000, 0, 60000)
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, cotizacion_id, factura_id, descripcion, fecha_inicio, estado, valor, orden_compra, costo_combustible)
  values (v_empresa, v_epa, v_cot1181, v_fac, 'Interior puerto — traslado de personal', current_date - 42, 'realizado', 60000, '4800021834', 10000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh1);

  -- Viaje realizado SIN factura (aparece "por facturar") ------------------------
  insert into viajes (empresa_id, cliente_id, descripcion, fecha_inicio, estado, valor, costo_combustible)
  values (v_empresa, v_erispe, 'Visitas delegación Erispe', pg_temp.dia(0, 4), 'realizado', 35000, 8000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh2);

  -- Viaje PROGRAMADO (próxima semana) -------------------------------------------
  insert into viajes (empresa_id, cliente_id, descripcion, fecha_inicio, estado, valor)
  values (v_empresa, v_tpa, 'Traslado de personal — turno especial', current_date + 5, 'programado', 150000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh1);

  -- MES -1 · pagadas ($690.000) --------------------------------------------------
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_epa, 34, 465, pg_temp.dia(-1, 8), 'emitida', 200000, 0, 200000, pg_temp.dia(-1, 16))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible, costo_peajes)
  values (v_empresa, v_epa, v_fac, 'Regimiento — traslado de tropas', pg_temp.dia(-1, 5), 'realizado', 200000, 45000, 6000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh2);

  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_tpa, 34, 462, pg_temp.dia(-1, 10), 'emitida', 490000, 0, 490000, pg_temp.dia(-1, 21))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, orden_compra, costo_combustible, costo_viaticos)
  values (v_empresa, v_tpa, v_fac, 'Acercamiento de personal — turno noche', pg_temp.dia(-1, 7), 'realizado', 490000, '4800021700', 90000, 40000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh2);

  -- MES -2 · pagadas ($610.000) --------------------------------------------------
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_epa, 34, 458, pg_temp.dia(-2, 12), 'emitida', 60000, 0, 60000, pg_temp.dia(-2, 20))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible)
  values (v_empresa, v_epa, v_fac, 'Conozca su puerto', pg_temp.dia(-2, 10), 'realizado', 60000, 12000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh1);

  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_epa, 34, 459, pg_temp.dia(-2, 12), 'emitida', 550000, 0, 550000, pg_temp.dia(-2, 23))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible, costo_viaticos)
  values (v_empresa, v_epa, v_fac, 'Traslado de faena', pg_temp.dia(-2, 9), 'realizado', 550000, 110000, 45000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh2);

  -- MES -3 · pagada ($470.000) ----------------------------------------------------
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_erispe, 34, 455, pg_temp.dia(-3, 14), 'emitida', 470000, 0, 470000, pg_temp.dia(-3, 26))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible, costo_otros)
  values (v_empresa, v_erispe, v_fac, 'City tour — recalada de crucero', pg_temp.dia(-3, 12), 'realizado', 470000, 85000, 20000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh2);

  -- MES -4 · pagada ($510.000) ----------------------------------------------------
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_tpa, 34, 452, pg_temp.dia(-4, 10), 'emitida', 510000, 0, 510000, pg_temp.dia(-4, 22))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, orden_compra, costo_combustible)
  values (v_empresa, v_tpa, v_fac, 'Acercamiento de personal — faena portuaria', pg_temp.dia(-4, 8), 'realizado', 510000, '4800021520', 95000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh1);

  -- MES -5 · pagada ($420.000) ----------------------------------------------------
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total, fecha_pago)
  values (v_empresa, v_epa, 34, 448, pg_temp.dia(-5, 16), 'emitida', 420000, 0, 420000, pg_temp.dia(-5, 27))
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, factura_id, descripcion, fecha_inicio, estado, valor, costo_combustible, costo_viaticos)
  values (v_empresa, v_epa, v_fac, 'Traslado de delegación', pg_temp.dia(-5, 14), 'realizado', 420000, 80000, 25000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho1, v_veh1);

  -- --------------------------------------------------------------------------
  -- 9. Gastos de flota (manual + SII)
  -- --------------------------------------------------------------------------
  insert into gastos_vehiculo (empresa_id, vehiculo_id, categoria, descripcion, origen, patente_detectada, proveedor_rut, proveedor_razon_social, dte_tipo, folio, fecha, litros, monto_neto, monto_iva, monto_total) values
    -- Mes 0 · $442.000
    (v_empresa, v_veh1, 'combustible', 'Carga de diésel', 'sii', 'JKLM12', '99500000-0', 'Copec S.A.', 33, 880123, pg_temp.dia(0, 2), 120, 110000, 20900, 130900),
    (v_empresa, v_veh1, 'mantencion', 'Cambio de aceite y filtros', 'manual', null, null, 'Taller Don Pedro', null, null, pg_temp.dia(0, 3), null, 0, 0, 85000),
    (v_empresa, v_veh2, 'combustible', 'Carga de diésel', 'sii', 'GHPR34', '99500000-0', 'Copec S.A.', 33, 880140, pg_temp.dia(0, 4), 210, 190000, 36100, 226100),
    -- Mes -1 · $454.000
    (v_empresa, v_veh1, 'combustible', 'Carga de diésel', 'sii', 'JKLM12', '99500000-0', 'Copec S.A.', 33, 879950, pg_temp.dia(-1, 7), 180, 164200, 31200, 195400),
    (v_empresa, v_veh2, 'mantencion', 'Neumáticos delanteros', 'manual', null, null, 'Taller Don Pedro', null, null, pg_temp.dia(-1, 18), null, 0, 0, 120000),
    (v_empresa, v_veh2, 'combustible', 'Carga de diésel', 'sii', 'GHPR34', '99500000-0', 'Copec S.A.', 33, 880021, pg_temp.dia(-1, 25), 130, 116500, 22100, 138600),
    -- Mes -2 · $370.000
    (v_empresa, v_veh1, 'combustible', 'Carga de diésel', 'sii', 'JKLM12', '99500000-0', 'Copec S.A.', 33, 879800, pg_temp.dia(-2, 8), 190, 172300, 32700, 205000),
    (v_empresa, v_veh1, 'mantencion', 'Frenos y suspensión', 'manual', null, null, 'Taller Don Pedro', null, null, pg_temp.dia(-2, 17), null, 0, 0, 165000),
    -- Mes -3 · $275.000
    (v_empresa, v_veh2, 'combustible', 'Carga de diésel', 'sii', 'GHPR34', '99500000-0', 'Copec S.A.', 33, 879650, pg_temp.dia(-3, 7), 225, 201700, 38300, 240000),
    (v_empresa, v_veh2, 'otros', 'Lavado y aseo de flota', 'manual', null, null, null, null, null, pg_temp.dia(-3, 20), null, 0, 0, 35000),
    -- Mes -4 · $198.000
    (v_empresa, v_veh1, 'combustible', 'Carga de diésel', 'sii', 'JKLM12', '99500000-0', 'Copec S.A.', 33, 879400, pg_temp.dia(-4, 11), 185, 166400, 31600, 198000),
    -- Mes -5 · $227.000
    (v_empresa, v_veh2, 'combustible', 'Carga de diésel', 'sii', 'GHPR34', '99500000-0', 'Copec S.A.', 33, 879200, pg_temp.dia(-5, 6), 172, 155500, 29500, 185000),
    (v_empresa, v_veh2, 'seguros', 'SOAP anual', 'manual', null, null, null, null, null, pg_temp.dia(-5, 15), null, 0, 0, 42000);

  raise notice 'Datos de prueba cargados para la empresa % (usuario admin: %).', v_empresa, v_user;
end $$;

drop function pg_temp.dia(int, int);
