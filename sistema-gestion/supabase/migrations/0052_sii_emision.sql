-- ============================================================================
-- 0052 — Emisión de DTE: los datos que pide el SII y que no estaban
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- La 0051 dejó los folios. Falta lo que el SII exige para que un documento
-- salga: la carátula del envío y la identidad de quien firma. Verificado
-- contra el contrato real de SimpleAPI (colección publicada en
-- documentacion.simpleapi.cl, revisada el 2026-08-18).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. El RUT del titular del certificado NO es el RUT de la empresa
--
-- Este es el error que esta migración corrige antes de que cueste caro.
-- `sii_credenciales.rut` se venía usando como el RUT de la EMPRESA: es contra
-- ese valor que se valida el CAF (el <RE> del archivo). Pero SimpleAPI pide,
-- en `Certificado.Rut`, el RUT de la PERSONA dueña de la firma electrónica —el
-- representante legal o el contador—, que casi nunca coincide con el de la
-- empresa. En el sobre de envío ese dato viaja como <RutEnvia>, separado de
-- <RutEmisor>.
--
-- Meterlos en la misma columna funciona hasta el día en que firma el contador:
-- ahí el SII rechaza el envío porque quien firma no es quien dice ser, y el
-- mensaje no explica nada de esto. Por eso son dos columnas.
-- ----------------------------------------------------------------------------
alter table sii_credenciales
  add column if not exists rut_certificado text;

comment on column sii_credenciales.rut is
  'RUT de la EMPRESA emisora. Es el que tiene que coincidir con el <RE> del CAF.';
comment on column sii_credenciales.rut_certificado is
  'RUT de la PERSONA titular de la firma electrónica (va como Certificado.Rut en SimpleAPI y como <RutEnvia> en el sobre). Suele ser distinto del RUT de la empresa.';

-- ----------------------------------------------------------------------------
-- 2. Resolución que autoriza a emitir — va en la carátula de CADA envío
--
-- El SII entrega estos dos datos cuando autoriza a la empresa como emisor
-- electrónico, y hay que repetirlos en la carátula de todos los envíos:
--   Certificación: https://maullin.sii.cl/cvc_cgi/dte/ad_empresa1
--   Producción:    https://palena.sii.cl/cvc_cgi/dte/ad_empresa1
--
-- En certificación el número es 0. Se deja nullable porque estos datos llegan
-- DESPUÉS del certificado: se cargan cuando el SII responde, no antes.
-- ----------------------------------------------------------------------------
alter table sii_credenciales
  add column if not exists numero_resolucion int,
  add column if not exists fecha_resolucion date;

comment on column sii_credenciales.numero_resolucion is
  'Número de resolución del SII que autoriza a emitir DTE. En certificación es 0.';
comment on column sii_credenciales.fecha_resolucion is
  'Fecha de esa resolución. Va en la carátula de cada envío al SII.';

-- ----------------------------------------------------------------------------
-- 3. Rastro de lo que respondió el SII
--
-- La 0051 dejó sii_ambiente, sii_xml_path y sii_enviado_at. Faltan el track id
-- como número (la columna vieja `sii_track_id` es text y venía de la 0006 sin
-- uso) y la glosa con la que el SII explica un rechazo. Sin guardar la glosa,
-- un rechazo obliga a repetir la consulta para saber por qué.
-- ----------------------------------------------------------------------------
alter table facturas
  add column if not exists sii_glosa text,
  add column if not exists sii_pdf_path text;

comment on column facturas.sii_glosa is
  'Última respuesta del SII sobre este documento (aceptado, reparo, rechazo y su motivo).';
comment on column facturas.sii_pdf_path is
  'Representación impresa generada desde el DTE, en el bucket privado adjuntos.';

-- ----------------------------------------------------------------------------
-- 4. Datos del emisor y del receptor que el SII exige en la cabecera
--
-- Aparecieron al armar el primer documento de verdad: sin ellos la API arma el
-- XML igual, pero el SII lo repara. Ninguno se puede inventar en el momento de
-- emitir, así que van a la base.
--
--   · actividad_economica: los códigos que el SII le asignó a la empresa
--     (<Acteco>). Es una lista porque una empresa puede tener varios.
--   · comuna: el SII distingue comuna de ciudad. En Arica coinciden, pero
--     escribir "Arica" donde va la comuna de un cliente de Santiago no.
--   · giro del cliente: obligatorio en toda factura. Hoy la ficha del cliente
--     no lo pide, y es el dato que más va a faltar al empezar a emitir.
-- ----------------------------------------------------------------------------
alter table empresa
  add column if not exists actividad_economica int[] not null default '{}',
  add column if not exists comuna text;

comment on column empresa.actividad_economica is
  'Códigos de actividad económica del SII (<Acteco> del DTE). Al menos uno para poder emitir.';
comment on column empresa.comuna is
  'Comuna del domicilio. Si está vacía se cae a ciudad, pero el SII quiere la comuna.';

alter table clientes
  add column if not exists giro text,
  add column if not exists comuna text;

comment on column clientes.giro is
  'Giro del cliente. Obligatorio en la factura electrónica.';
comment on column clientes.comuna is
  'Comuna del cliente. Obligatoria en la factura electrónica.';
