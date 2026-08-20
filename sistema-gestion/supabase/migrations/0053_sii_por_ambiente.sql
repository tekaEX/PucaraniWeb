-- ============================================================================
-- 0053 — Credenciales del SII separadas por ambiente
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- ⚠️ NO SE HA EJECUTADO. La escribió el trabajo de la feature
--    002-simpleapi-certificacion y queda a la espera de que el dueño la corra.
--    Ver specs/002-simpleapi-certificacion/decisiones.md (decisión D1).
--
-- Qué resuelve
-- ------------
-- Hasta acá `sii_credenciales` admite UNA credencial por empresa
-- (`unique (empresa_id)`), aunque la columna `ambiente` exista desde la 0051.
-- Eso alcanza para trabajar en certificación, pero hace imposible preparar
-- producción: cargar el certificado de producción obliga a reemplazar el de
-- certificación, y con él la resolución y el RUT del titular. Se pierde la
-- posibilidad de volver a certificación a probar algo, que es justo lo que hay
-- que poder hacer cuando el SII rechaza un documento real.
--
-- Después de esta migración cada empresa puede tener dos filas —una por
-- ambiente— y `sii_caf` ya venía separando folios por ambiente desde la 0051.
--
-- Compatibilidad con la aplicación
-- --------------------------------
-- La app YA está escrita para funcionar con la tabla vieja y con la nueva: la
-- carga de credenciales hace "actualizar la fila de este ambiente y, si no
-- existe, insertarla", sin depender de `onConflict: empresa_id`. Por eso esta
-- migración se puede correr en cualquier momento, sin coordinar un despliegue.
-- (Ver la prueba "la credencial se escribe sin depender de la restricción única
-- vieja" en pruebas/20-emision-guardas.test.mjs.)
--
-- Los archivos ya cargados NO se mueven
-- -------------------------------------
-- `cert_path` guarda la ruta completa, así que un certificado subido antes
-- —`<empresa>/certificado.pfx`— se sigue leyendo donde está. Las cargas nuevas
-- van a `<empresa>/<ambiente>/certificado-<sufijo>.pfx`. No hace falta mover
-- nada en Storage, y moverlo a mano rompería las filas que apuntan al lugar
-- viejo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Una credencial por empresa Y ambiente
--
-- La fila que ya existe conserva su `ambiente` (la 0051 lo dejó en
-- 'certificacion' por defecto), así que nada cambia de lugar: lo único que se
-- abre es la puerta para agregar la de producción cuando llegue.
-- ----------------------------------------------------------------------------
alter table sii_credenciales
  drop constraint if exists sii_credenciales_empresa_id_key;

create unique index if not exists sii_credenciales_empresa_ambiente
  on sii_credenciales (empresa_id, ambiente);

comment on table sii_credenciales is
  'Credenciales de firma del SII, UNA POR EMPRESA Y AMBIENTE. Certificación y producción usan certificados y resoluciones distintos: mezclarlos emite documentos reales creyendo que son de prueba.';

-- ----------------------------------------------------------------------------
-- 2. Estado de validación del certificado
--
-- Hoy la app comprueba que el archivo SEA un PKCS#12 (estructura DER y el OID
-- pkcs7-data) antes de guardarlo, pero no puede comprobar que la CONTRASEÑA lo
-- abra: Node no trae parser de PKCS#12 y el proyecto no incorpora dependencias
-- nuevas sin necesidad. Ver la decisión D2.
--
-- Por eso el estado arranca en 'pendiente' y solo pasa a 'valido' cuando una
-- operación real lo demuestra —el primer `dte/generar` que devuelve un DTE
-- timbrado—. Marcar 'valido' porque el archivo se pudo subir sería exactamente
-- la afirmación falsa que esta feature trata de evitar.
-- ----------------------------------------------------------------------------
do $$ begin
  create type sii_estado_validacion as enum ('pendiente', 'valido', 'invalido');
exception when duplicate_object then null;
end $$;

alter table sii_credenciales
  add column if not exists estado_validacion sii_estado_validacion not null default 'pendiente',
  add column if not exists validacion_glosa text,
  add column if not exists validated_at timestamptz;

comment on column sii_credenciales.estado_validacion is
  'pendiente = el archivo parece un PKCS#12 pero nadie probó la contraseña. valido = una emisión real lo usó con éxito. invalido = SimpleAPI lo rechazó.';
comment on column sii_credenciales.validacion_glosa is
  'Por qué quedó inválido, en castellano. NUNCA material criptográfico ni la contraseña.';

-- ----------------------------------------------------------------------------
-- 3. RLS: sin cambios de criterio, pero se deja explícito
--
-- La policy de la 0050 ya filtra por empresa y exige rol admin, y sigue
-- sirviendo tal cual con dos filas por empresa. Se re-crea para que quede
-- junto a la tabla que gobierna y no haya que ir a buscarla tres migraciones
-- atrás para saber qué protege.
-- ----------------------------------------------------------------------------
alter table sii_credenciales enable row level security;

drop policy if exists sii_cred_admin_only on sii_credenciales;
create policy sii_cred_admin_only on sii_credenciales for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  );

-- ----------------------------------------------------------------------------
-- Verificación 1: ninguna empresa puede tener dos credenciales del mismo
-- ambiente. Debe dar 0 filas.
-- ----------------------------------------------------------------------------
select empresa_id, ambiente, count(*) as "duplicadas_debe_ser_0"
  from sii_credenciales
 group by empresa_id, ambiente
having count(*) > 1;

-- ----------------------------------------------------------------------------
-- Verificación 2: qué quedó cargado y en qué ambiente. Lo esperable antes de
-- la certificación es una sola fila, en 'certificacion'.
-- ----------------------------------------------------------------------------
select e.nombre,
       c.ambiente,
       c.rut,
       c.rut_certificado,
       c.numero_resolucion,
       c.estado_validacion,
       c.cert_path
  from sii_credenciales c
  join empresa e on e.id = c.empresa_id
 order by e.nombre, c.ambiente;

-- ----------------------------------------------------------------------------
-- Verificación 3: folios por ambiente. Un rango de producción antes de haber
-- certificado es una señal de alarma, no un avance.
-- ----------------------------------------------------------------------------
select ambiente,
       tipo_dte,
       count(*) as rangos,
       sum(greatest(folio_hasta - folio_siguiente + 1, 0)) as folios_libres
  from sii_caf
 group by ambiente, tipo_dte
 order by ambiente, tipo_dte;
