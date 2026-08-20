-- ============================================================================
-- 0054 — Cuál de los dos ambientes del SII está activo
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Aditiva y sin riesgo: agrega una columna con valor por defecto. No borra ni
-- reescribe nada.
--
-- Por qué hace falta
-- ------------------
-- La 0053 permitió DOS credenciales por empresa, una por ambiente. Eso resolvió
-- poder preparar producción sin pisar certificación, pero abrió una pregunta
-- que antes no existía: si están las dos cargadas, ¿con cuál se emite?
--
-- No puede deducirse. "La de producción si existe" convertiría el acto de
-- cargar el certificado de producción en el acto de empezar a emitir documentos
-- tributarios reales, sin que nadie lo decida — exactamente lo que la historia
-- US3 prohíbe: «la aplicación no puede cambiar a producción sin una acción
-- administrativa explícita y una confirmación visible».
--
-- Así que el ambiente activo es un dato propio, de la empresa, y su valor por
-- defecto es certificación. Pasar a producción es un UPDATE deliberado.
--
-- Compatibilidad
-- --------------
-- La app lee esta columna en una consulta aparte y, si no existe todavía, cae a
-- 'certificacion'. Es el mismo criterio que la 0053: la migración se corre
-- cuando el dueño quiera, no cuando lo obligue el código. Y el modo degradado
-- es el seguro — nunca produce una emisión real por accidente.
-- ============================================================================

alter table empresa
  add column if not exists sii_ambiente_activo sii_ambiente not null default 'certificacion';

comment on column empresa.sii_ambiente_activo is
  'Ambiente del SII contra el que emite esta empresa. Arranca y se queda en certificación hasta que alguien lo cambia a mano: pasar a producción es una decisión, no una consecuencia de haber cargado un certificado.';

-- ----------------------------------------------------------------------------
-- Verificación: qué ambiente tiene cada empresa y con qué está equipada.
--
-- Lo esperable antes de certificar: ambiente 'certificacion', y credenciales y
-- folios solo de ese ambiente. Una empresa en 'produccion' sin haber pasado el
-- set de pruebas del SII es una alarma, no un avance.
-- ----------------------------------------------------------------------------
select e.nombre,
       e.sii_ambiente_activo                                      as ambiente_activo,
       e.rut                                                      as rut_empresa,
       coalesce(array_length(e.actividad_economica, 1), 0)        as codigos_actividad,
       (select count(*) from sii_credenciales c
         where c.empresa_id = e.id
           and c.ambiente = e.sii_ambiente_activo)                as credencial_del_ambiente,
       (select count(*) from sii_caf f
         where f.empresa_id = e.id
           and f.ambiente = e.sii_ambiente_activo
           and f.folio_siguiente <= f.folio_hasta)                as rangos_con_folios_libres
  from empresa e
 order by e.nombre;
