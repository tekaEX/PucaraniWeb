-- ============================================================================
-- DATOS DE PRUEBA — empresa DEMO de admin619619@gmail.com
-- Ejecutar en Supabase > SQL Editor (corre como admin, salta RLS).
--
-- ⚠️ REQUIERE la migración 0050 corrida antes. Sin ella `perfiles` no tiene
--    empresa_id y las policies no filtran por empresa: los datos de prueba
--    volverían a verse desde todas las cuentas, que es justo lo que esto evita.
--
-- Qué hace distinto a la versión anterior de este archivo
-- ------------------------------------------------------
-- Antes sembraba sobre la empresa ÚNICA, así que los datos de prueba aparecían
-- también en la cuenta del dueño y se mezclaban con sus clientes, choferes y
-- vehículos reales. Ahora crea una empresa aparte —"Transportes Pucarani
-- (DEMO)", con un id fijo— y mueve el perfil de admin619619 a esa empresa.
-- Resultado: admin619619 ve SOLO esto, y las cuentas reales
-- (administracion@transportespucarani.cl, sonylink14) siguen viendo SOLO lo
-- suyo. Ninguna de las dos ve a la otra.
--
-- · Evergreen: todas las fechas se calculan RELATIVAS al día de ejecución,
--   así el mes en curso siempre tiene movimiento, el anterior sirve de
--   comparación y las alertas de documentos cuentan una historia curada.
-- · RE-EJECUTABLE: borra TODO lo de la empresa DEMO (catálogos incluidos, son
--   de prueba) y lo vuelve a crear. No toca ninguna otra empresa.
--
-- La historia que cuenta (mes 0 = mes en curso)
-- ---------------------------------------------
--   Ingresos = facturas pagadas (por fecha_pago) + servicios de taxi (por
--   fecha), que es como los suma lib/finanzas.ts:
--     mes -5: $510.000 · -4: $618.000 · -3: $564.000
--     mes -2: $715.000 · -1: $824.000 · mes 0: $951.000   (+15% vs. mes anterior)
--
--   Costos = gastos de flota + costos de cada viaje no cancelado:
--     mes -5: $332.000 · -4: $293.000 · -3: $380.000
--     mes -2: $547.000 · -1: $690.000 · mes 0: $627.000   (-9% vs. mes anterior)
--
--   Mes 0 cierra con utilidad $324.000 y margen 34%.
--
--   Además, para que las alertas y los estados derivados no queden vacíos:
--     · 1 factura por cobrar vigente ($70.000) y 1 vencida ($60.000)
--     · 1 viaje realizado sin factura ("por facturar") y 1 programado
--     · 1 factura que agrupa DOS viajes
--     · 1 licencia de chofer por vencer en 12 días
--     · 1 revisión técnica vencida hace 6 días y 1 por vencer en 20
--     · 3 cotizaciones: 1 enviada (la del mes) y 2 aceptadas
--
-- El alcance de los servicios respeta el del negocio real (ver CLAUDE.md): solo
-- ciudad de Arica —con aeropuerto Chacalluta, Puerto de Arica y terminales— y
-- Tacna cruzando la frontera. Nada de altiplano ni de pasajeros de crucero.
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

-- Una fecha "la semana que viene" que NO se escape del mes en curso. El viaje
-- programado tiene que caer dentro del periodo que carga el dashboard
-- (lib/finanzas-server.ts pide hasta el último día del mes elegido): con un
-- `current_date + 5` pelado, correr esto un 28 dejaba el viaje fuera de la
-- consulta y la tarjeta de programados aparecía vacía.
create or replace function pg_temp.pronto() returns date
language sql as $$
  select least(
    current_date + 5,
    (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
  );
$$;

do $$
declare
  -- Id fijo para la empresa de pruebas. Es a propósito: si se buscara por
  -- nombre, renombrarla desde Configuración haría que la próxima corrida
  -- creara una segunda empresa DEMO en vez de reusar esta.
  v_empresa uuid := '00000000-0000-0000-0000-0000000000de';
  v_user    uuid;
  v_epa     uuid;
  v_tpa     uuid;
  v_erispe  uuid;
  v_cho1    uuid;  -- Raúl Mamani    (operación, licencia por vencer)
  v_cho2    uuid;  -- Juan Pérez     (operación)
  v_cho3    uuid;  -- Nelson Choque  (taxis)
  -- La patente ES el identificador del vehículo (PK desde la migración 0008),
  -- y es única en TODA la base, no por empresa: estas tres no existen en la
  -- empresa real (VKPW-81, BCYV-21, BVYV-46, BCYV-46, KDPK-48, JBGR-59,
  -- LHTK-95), así que no chocan.
  v_veh1    text := 'JKLM-12';  -- minibús 19, operación
  v_veh2    text := 'GHPR-34';  -- bus 28, operación
  v_veh3    text := 'RSTV-56';  -- sedán 4, taxis
  v_cot1188 uuid;
  v_cot1181 uuid;
  v_cot1179 uuid;
  v_fac     uuid;
  v_viaje   uuid;
begin
  -- --------------------------------------------------------------------------
  -- 0. Requisito: la 0050 tiene que estar corrida
  -- --------------------------------------------------------------------------
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'perfiles'
       and column_name = 'empresa_id'
  ) then
    raise exception
      'Falta correr la migración 0050_empresa_por_cuenta.sql: sin perfiles.empresa_id los datos de prueba se verían desde todas las cuentas.';
  end if;

  -- --------------------------------------------------------------------------
  -- 1. Empresa DEMO
  -- --------------------------------------------------------------------------
  insert into empresa (
    id, nombre, razon_social, rut, direccion, ciudad, giro, telefono, email,
    representante, proximo_numero_cotizacion
  )
  values (
    v_empresa, 'Transportes Pucarani (DEMO)', 'Empresa de pruebas', '11.111.111-1',
    'Quinsachata 1749', 'Arica', 'Traslado de Personal y Operador Turístico',
    '+56 9 9162 2929', 'pruebas@example.com', 'c.carreño', 1189
  )
  on conflict (id) do update
     set nombre                    = excluded.nombre,
         razon_social              = excluded.razon_social,
         proximo_numero_cotizacion = 1189;

  -- --------------------------------------------------------------------------
  -- 2. admin619619 pasa a la empresa DEMO
  --
  -- Esto lo SACA de la empresa real: desde acá esa cuenta deja de ver los
  -- clientes, choferes y vehículos del dueño, y ve solo lo de abajo. Es el
  -- punto del ejercicio. Para devolverla:
  --   update perfiles set empresa_id = (select id from empresa
  --                                      where id <> '00000000-0000-0000-0000-0000000000de'
  --                                      order by created_at limit 1)
  --    where id = (select id from auth.users where email = 'admin619619@gmail.com');
  -- --------------------------------------------------------------------------
  select id into v_user from auth.users where email = 'admin619619@gmail.com';
  if v_user is null then
    raise exception 'No existe admin619619@gmail.com en auth.users — creá la cuenta primero.';
  end if;

  insert into perfiles (id, nombre, rol, activo, empresa_id)
  values (v_user, 'Administrador (pruebas)', 'admin', true, v_empresa)
  on conflict (id) do update
     set rol        = 'admin',
         activo     = true,
         empresa_id = v_empresa;

  -- --------------------------------------------------------------------------
  -- 3. Limpieza de la empresa DEMO (re-ejecutable)
  --
  -- El orden importa: viaje_asignaciones apunta a choferes y vehículos con
  -- `on delete restrict`, y viajes a clientes igual, así que primero se van las
  -- transaccionales y al final los catálogos.
  -- --------------------------------------------------------------------------
  delete from viajes          where empresa_id = v_empresa;   -- cascade: asignaciones
  delete from facturas        where empresa_id = v_empresa;
  delete from cotizaciones    where empresa_id = v_empresa;   -- cascade: items
  delete from gastos_vehiculo where empresa_id = v_empresa;
  delete from servicios_taxi  where empresa_id = v_empresa;
  delete from vehiculos       where empresa_id = v_empresa;
  delete from choferes        where empresa_id = v_empresa;   -- cascade: chofer_categorias
  delete from clientes        where empresa_id = v_empresa;

  -- --------------------------------------------------------------------------
  -- 4. Clientes
  -- --------------------------------------------------------------------------
  insert into clientes (empresa_id, nombre, codigo, rut, direccion)
  values (v_empresa, 'Empresa Portuaria Arica', 'epa', '61.945.700-5', 'Av. Máximo Lira 389, Arica')
  returning id into v_epa;

  insert into clientes (empresa_id, nombre, codigo, rut, direccion)
  values (v_empresa, 'Terminal Puerto Arica', 'tpa', '99.567.620-6', 'Av. Comandante San Martín 255, Arica')
  returning id into v_tpa;

  insert into clientes (empresa_id, nombre, codigo)
  values (v_empresa, 'Erispe Ltda.', 'erispe')
  returning id into v_erispe;

  -- --------------------------------------------------------------------------
  -- 5. Choferes (licencias: 1 por vencer en 12 días, 2 vigentes)
  -- --------------------------------------------------------------------------
  insert into choferes (empresa_id, nombre, rut, telefono, licencia_numero, licencia_clase, licencia_vencimiento)
  values (v_empresa, 'Raúl Mamani', '10.111.222-3', '+56 9 5555 1111', 'A3-123456', 'A3', current_date + 12)
  returning id into v_cho1;

  insert into choferes (empresa_id, nombre, rut, telefono, licencia_numero, licencia_clase, licencia_vencimiento)
  values (v_empresa, 'Juan Pérez', '12.333.444-5', '+56 9 5555 2222', 'A3-654321', 'A3', current_date + 540)
  returning id into v_cho2;

  insert into choferes (empresa_id, nombre, rut, telefono, licencia_numero, licencia_clase, licencia_vencimiento)
  values (v_empresa, 'Nelson Choque', '14.555.666-7', '+56 9 5555 3333', 'A1-778899', 'A1', current_date + 300)
  returning id into v_cho3;

  insert into chofer_categorias (chofer_id, categoria) values
    (v_cho1, 'operacion'),
    (v_cho2, 'operacion'),
    (v_cho2, 'taxis'),
    (v_cho3, 'taxis');

  -- --------------------------------------------------------------------------
  -- 6. Vehículos (documentos: 1 revisión vencida hace 6 días, 1 por vencer)
  -- --------------------------------------------------------------------------
  insert into vehiculos (empresa_id, patente, marca, modelo, anio, capacidad, categoria, km_actual,
                         revision_tecnica_venc, soap_venc, permiso_circulacion_venc)
  values
    (v_empresa, v_veh1, 'Mercedes-Benz', 'Sprinter', 2021, 19, 'operacion', 145000,
     current_date + 20, current_date + 160, current_date + 260),
    (v_empresa, v_veh2, 'Hyundai', 'County', 2018, 28, 'operacion', 310000,
     current_date - 6, current_date + 45, current_date + 85),
    (v_empresa, v_veh3, 'Hyundai', 'Accent', 2019, 4, 'taxis', 128000,
     current_date + 95, current_date + 210, current_date + 300);

  -- --------------------------------------------------------------------------
  -- 7. Cotizaciones
  -- --------------------------------------------------------------------------
  insert into cotizaciones (empresa_id, numero, fecha, fecha_validez, cliente_id, autor, titulo, nota_pie, exento_iva, estado, subtotal, iva, total)
  values (v_empresa, 1188, pg_temp.dia(0, 3), pg_temp.dia(0, 3) + 30, v_epa, 'c.carreño',
          'Transporte de pasajeros — bus de acercamiento',
          'En caso de sufrir algún desperfecto la máquina en servicio, contamos con máquinas de reemplazo al instante.',
          true, 'enviada', 750000, 0, 750000)
  returning id into v_cot1188;

  insert into cotizacion_items (cotizacion_id, orden, descripcion, fecha, valor_unitario, total) values
    (v_cot1188, 0, 'Día 15 — desde casino el morro al regimiento Rancagua, retorno casino el morro.', pg_temp.dia(0, 15), 80000, 80000),
    (v_cot1188, 1, 'Día 16 — Todo el día, desde 07:30 hasta las 20:00. City tour Arica.', pg_temp.dia(0, 16), 350000, 350000),
    (v_cot1188, 2, 'Día 17 — Todo el día a Tacna, desde las 07:30 hasta las 21:00 aprox. Regreso a Arica.', pg_temp.dia(0, 17), 240000, 240000),
    (v_cot1188, 3, 'Día 18 — Desde las 8:30 hasta las 14:00. Casino morro hacia brigada, Coraceros-morro-restaurant (por indicar).', pg_temp.dia(0, 18), 80000, 80000);

  insert into cotizaciones (empresa_id, numero, fecha, fecha_validez, cliente_id, autor, titulo, exento_iva, estado, subtotal, iva, total)
  values (v_empresa, 1181, pg_temp.dia(-2, 15), pg_temp.dia(-2, 15) + 30, v_epa, 'c.carreño',
          'Interior puerto — traslado de personal', true, 'aceptada', 60000, 0, 60000)
  returning id into v_cot1181;

  insert into cotizacion_items (cotizacion_id, orden, descripcion, fecha, valor_unitario, total)
  values (v_cot1181, 0, 'Recorrido interior puerto, ida y vuelta.', pg_temp.dia(-2, 18), 60000, 60000);

  insert into cotizaciones (empresa_id, numero, fecha, fecha_validez, cliente_id, autor, titulo, exento_iva, estado, subtotal, iva, total)
  values (v_empresa, 1179, pg_temp.dia(-1, 13), pg_temp.dia(-1, 13) + 30, v_tpa, 'c.carreño',
          'CIOP — traslado de autoridades', true, 'aceptada', 180000, 0, 180000)
  returning id into v_cot1179;

  insert into cotizacion_items (cotizacion_id, orden, descripcion, fecha, valor_unitario, total)
  values (v_cot1179, 0, 'Servicio CIOP, jornada completa.', pg_temp.dia(-1, 13), 180000, 180000);

  -- --------------------------------------------------------------------------
  -- 8. Viajes + facturas (todas exentas: tipo_dte 34, iva 0)
  --    Ingresos por mes = estas facturas por fecha_pago + los taxis del punto 10.
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

  -- Por cobrar VENCIDA ($60.000, de la cotización 1181) ------------------------
  -- Emitida en el mes -2 y sin pagar: son 40 a 70 días de atraso según el día
  -- en que se corra esto, siempre bastante más que los 30 que la marcan vencida.
  -- (La versión anterior usaba `current_date - 40`, que cerca de fin de mes caía
  -- dentro del mes en curso y descuadraba los totales mensuales de la cabecera.)
  insert into facturas (empresa_id, cliente_id, tipo_dte, folio, fecha_emision, estado, neto, iva, total)
  values (v_empresa, v_epa, 34, 471, pg_temp.dia(-2, 20), 'emitida', 60000, 0, 60000)
  returning id into v_fac;
  insert into viajes (empresa_id, cliente_id, cotizacion_id, factura_id, descripcion, fecha_inicio, estado, valor, orden_compra, costo_combustible)
  values (v_empresa, v_epa, v_cot1181, v_fac, 'Interior puerto — traslado de personal', pg_temp.dia(-2, 18), 'realizado', 60000, '4800021834', 10000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh1);

  -- Viaje realizado SIN factura (aparece "por facturar") ------------------------
  insert into viajes (empresa_id, cliente_id, descripcion, fecha_inicio, estado, valor, costo_combustible)
  values (v_empresa, v_erispe, 'Visitas delegación Erispe', pg_temp.dia(0, 4), 'realizado', 35000, 8000)
  returning id into v_viaje;
  insert into viaje_asignaciones (viaje_id, chofer_id, vehiculo_id) values (v_viaje, v_cho2, v_veh2);

  -- Viaje PROGRAMADO (esta semana, sin salirse del mes) -------------------------
  insert into viajes (empresa_id, cliente_id, descripcion, fecha_inicio, estado, valor)
  values (v_empresa, v_tpa, 'Traslado de personal — turno especial', pg_temp.pronto(), 'programado', 150000)
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
  values (v_empresa, v_erispe, v_fac, 'City tour Arica — delegación', pg_temp.dia(-3, 12), 'realizado', 470000, 85000, 20000)
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
  --    Totales por mes: 0 $442.000 · -1 $454.000 · -2 $370.000 ·
  --                    -3 $275.000 · -4 $198.000 · -5 $227.000
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

  -- --------------------------------------------------------------------------
  -- 10. Servicios de taxi
  --
  -- El área de taxis se gestiona aislada (no toca viajes ni facturas) pero SÍ
  -- suma a los ingresos, por su fecha: lib/finanzas.ts hace
  -- `ingresos = facturas pagadas + taxis`. Sin estas filas el dashboard mostraba
  -- solo la mitad del negocio y la pantalla de Taxis quedaba vacía.
  --
  -- Tarifas usadas: local $4.000 · aeropuerto (ida o vuelta) $9.000 ·
  -- Tacna $30.000 · compartido $5.000 · exclusivo $12.000.
  -- Totales por mes: 0 $176.000 · -1 $134.000 · -2 $105.000 ·
  --                 -3 $94.000 · -4 $108.000 · -5 $90.000
  --
  -- Se arma con un VALUES de (mes, día, tipo, monto, pasajero, cliente, chofer)
  -- en vez de 40 INSERT sueltos: son muchas filas chicas y así se leen las
  -- tarifas de un vistazo.
  -- --------------------------------------------------------------------------
  insert into servicios_taxi (empresa_id, fecha, tipo, descripcion, monto, pasajero, cliente_id, chofer_id)
  select v_empresa, pg_temp.dia(m, d), tipo, descripcion, monto, pasajero,
         case cli when 'epa' then v_epa when 'tpa' then v_tpa when 'erispe' then v_erispe end,
         case cho when 2 then v_cho2 when 3 then v_cho3 end
    from (values
      -- MES 0 · $176.000
      ( 0,  2, 'aeropuerto_arica',  null::text,                    9000, 'M. Rojas',      null::text, 3),
      ( 0,  3, 'arica_aeropuerto',  null,                          9000, 'M. Rojas',      null,     3),
      ( 0,  4, 'tacna_peru',        null,                         30000, 'Delegación TPA','tpa',    3),
      ( 0,  5, 'local',             null,                          4000, null,            null,     3),
      ( 0,  6, 'local',             null,                          4000, null,            null,     3),
      ( 0,  8, 'aeropuerto_arica',  null,                          9000, 'J. Vargas',     null,     2),
      ( 0,  9, 'taxi_exclusivo',    null,                         12000, 'Gerencia EPA',  'epa',    3),
      ( 0, 10, 'arica_aeropuerto',  null,                          9000, 'J. Vargas',     null,     2),
      ( 0, 11, 'local',             null,                          4000, null,            null,     3),
      ( 0, 12, 'tacna_peru',        null,                         30000, 'P. Nina',       null,     3),
      ( 0, 15, 'aeropuerto_arica',  null,                          9000, 'Visita EPA',    'epa',    3),
      ( 0, 16, 'arica_aeropuerto',  null,                          9000, 'Visita EPA',    'epa',    3),
      ( 0, 18, 'local',             null,                          4000, null,            null,     2),
      ( 0, 20, 'taxi_compartido',   null,                          5000, null,            null,     3),
      ( 0, 22, 'local',             null,                          4000, null,            null,     3),
      ( 0, 24, 'especial',          'City tour privado, 3 horas.', 25000, 'Familia Soto',  null,     3),
      -- MES -1 · $134.000
      (-1,  3, 'tacna_peru',        null,                         30000, 'Delegación TPA','tpa',    3),
      (-1,  6, 'aeropuerto_arica',  null,                          9000, 'R. Flores',     null,     3),
      (-1,  7, 'arica_aeropuerto',  null,                          9000, 'R. Flores',     null,     3),
      (-1, 10, 'local',             null,                          4000, null,            null,     3),
      (-1, 12, 'taxi_exclusivo',    null,                         12000, 'Gerencia EPA',  'epa',    3),
      (-1, 14, 'local',             null,                          4000, null,            null,     2),
      (-1, 17, 'tacna_peru',        null,                         30000, 'C. Mamani',     null,     3),
      (-1, 19, 'aeropuerto_arica',  null,                          9000, 'Visita TPA',    'tpa',    3),
      (-1, 20, 'arica_aeropuerto',  null,                          9000, 'Visita TPA',    'tpa',    3),
      (-1, 23, 'taxi_compartido',   null,                          5000, null,            null,     3),
      (-1, 25, 'taxi_compartido',   null,                          5000, null,            null,     3),
      (-1, 27, 'local',             null,                          4000, null,            null,     3),
      (-1, 28, 'local',             null,                          4000, null,            null,     3),
      -- MES -2 · $105.000
      (-2,  4, 'tacna_peru',        null,                         30000, 'Delegación EPA','epa',    3),
      (-2,  6, 'aeropuerto_arica',  null,                          9000, 'L. Quispe',     null,     3),
      (-2,  8, 'arica_aeropuerto',  null,                          9000, 'L. Quispe',     null,     3),
      (-2, 11, 'local',             null,                          4000, null,            null,     3),
      (-2, 13, 'aeropuerto_arica',  null,                          9000, 'Visita EPA',    'epa',    3),
      (-2, 15, 'local',             null,                          4000, null,            null,     2),
      (-2, 18, 'arica_aeropuerto',  null,                          9000, 'Visita EPA',    'epa',    3),
      (-2, 20, 'local',             null,                          4000, null,            null,     3),
      (-2, 22, 'aeropuerto_arica',  null,                          9000, 'S. Ticona',     null,     3),
      (-2, 24, 'taxi_compartido',   null,                          5000, null,            null,     3),
      (-2, 26, 'taxi_compartido',   null,                          5000, null,            null,     3),
      (-2, 27, 'local',             null,                          4000, null,            null,     3),
      (-2, 28, 'local',             null,                          4000, null,            null,     3),
      -- MES -3 · $94.000
      (-3,  5, 'tacna_peru',        null,                         30000, 'Delegación TPA','tpa',    3),
      (-3,  9, 'aeropuerto_arica',  null,                          9000, 'H. Condori',    null,     3),
      (-3, 10, 'arica_aeropuerto',  null,                          9000, 'H. Condori',    null,     3),
      (-3, 13, 'local',             null,                          4000, null,            null,     3),
      (-3, 16, 'aeropuerto_arica',  null,                          9000, 'Visita EPA',    'epa',    3),
      (-3, 17, 'arica_aeropuerto',  null,                          9000, 'Visita EPA',    'epa',    3),
      (-3, 19, 'local',             null,                          4000, null,            null,     2),
      (-3, 21, 'taxi_exclusivo',    null,                         12000, 'Gerencia TPA',  'tpa',    3),
      (-3, 24, 'local',             null,                          4000, null,            null,     3),
      (-3, 26, 'local',             null,                          4000, null,            null,     3),
      -- MES -4 · $108.000
      (-4,  4, 'tacna_peru',        null,                         30000, 'Delegación EPA','epa',    3),
      (-4,  7, 'aeropuerto_arica',  null,                          9000, 'D. Álvarez',    null,     3),
      (-4,  9, 'local',             null,                          4000, null,            null,     3),
      (-4, 12, 'arica_aeropuerto',  null,                          9000, 'D. Álvarez',    null,     3),
      (-4, 15, 'tacna_peru',        null,                         30000, 'N. Huanca',     null,     3),
      (-4, 18, 'local',             null,                          4000, null,            null,     2),
      (-4, 21, 'aeropuerto_arica',  null,                          9000, 'Visita TPA',    'tpa',    3),
      (-4, 23, 'local',             null,                          4000, null,            null,     3),
      (-4, 25, 'taxi_compartido',   null,                          5000, null,            null,     3),
      (-4, 27, 'local',             null,                          4000, null,            null,     3),
      -- MES -5 · $90.000
      (-5,  6, 'tacna_peru',        null,                         30000, 'Delegación EPA','epa',    3),
      (-5,  9, 'aeropuerto_arica',  null,                          9000, 'V. Choque',     null,     3),
      (-5, 11, 'arica_aeropuerto',  null,                          9000, 'V. Choque',     null,     3),
      (-5, 14, 'aeropuerto_arica',  null,                          9000, 'Visita EPA',    'epa',    3),
      (-5, 15, 'arica_aeropuerto',  null,                          9000, 'Visita EPA',    'epa',    3),
      (-5, 18, 'local',             null,                          4000, null,            null,     3),
      (-5, 21, 'taxi_exclusivo',    null,                         12000, 'Gerencia EPA',  'epa',    3),
      (-5, 23, 'local',             null,                          4000, null,            null,     2),
      (-5, 26, 'local',             null,                          4000, null,            null,     3)
    ) as t(m, d, tipo, descripcion, monto, pasajero, cli, cho);

  raise notice 'Datos de prueba cargados en la empresa DEMO % para la cuenta % (admin619619@gmail.com).', v_empresa, v_user;
end $$;

drop function pg_temp.dia(int, int);
drop function pg_temp.pronto();

-- ============================================================================
-- Verificación: los números que el dashboard tiene que mostrar
--
-- `ingresos` acá se calcula igual que en lib/finanzas.ts (facturas pagadas por
-- fecha_pago + taxis por fecha) y `costos` igual que costosDe (gastos de flota
-- por fecha + costos de los viajes no cancelados por fecha_inicio). Si estas
-- cifras no coinciden con las de la pantalla, el problema está en la app, no en
-- los datos.
-- ============================================================================
with meses as (
  select (date_trunc('month', current_date) + make_interval(months => m))::date as mes
    from generate_series(-5, 0) as g(m)
),
demo as (select '00000000-0000-0000-0000-0000000000de'::uuid as id)
select to_char(m.mes, 'YYYY-MM') as mes,
       coalesce((select sum(f.total) from facturas f, demo
                  where f.empresa_id = demo.id and f.estado = 'emitida'
                    and date_trunc('month', f.fecha_pago)::date = m.mes), 0)
     + coalesce((select sum(s.monto) from servicios_taxi s, demo
                  where s.empresa_id = demo.id
                    and date_trunc('month', s.fecha)::date = m.mes), 0) as ingresos,
       coalesce((select sum(g.monto_total) from gastos_vehiculo g, demo
                  where g.empresa_id = demo.id
                    and date_trunc('month', g.fecha)::date = m.mes), 0)
     + coalesce((select sum(v.costo_combustible + v.costo_peajes + v.costo_viaticos + v.costo_otros)
                   from viajes v, demo
                  where v.empresa_id = demo.id and v.estado <> 'cancelado'
                    and date_trunc('month', v.fecha_inicio)::date = m.mes), 0) as costos
  from meses m
 order by m.mes;
