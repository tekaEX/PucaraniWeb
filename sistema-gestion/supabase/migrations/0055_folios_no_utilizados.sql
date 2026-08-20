-- ============================================================================
-- 0055 — Registro de folios consumidos que nunca llegaron a ser documento
--        Ejecutar en Supabase > SQL Editor. Re-ejecutable.
--
-- Aditiva: crea una tabla nueva y no toca ninguna existente.
--
-- Qué resuelve
-- ------------
-- Un folio tomado no vuelve. Si la emisión falla DESPUÉS de `tomar_folio()` —no
-- se encontró el CAF, falló el timbrado, se cayó el sobre—, ese número quedó
-- gastado y hay que declararlo al SII como **folio no utilizado**.
--
-- Hasta ahora el único rastro era el número escrito DENTRO del texto de
-- `facturas.sii_glosa`: «El folio 466 quedó consumido: hay que declararlo…».
-- Eso alcanza para que la persona lo lea en la pantalla y no alcanza para nada
-- más. No se puede consultar «qué folios debo declarar este mes» sin leer
-- glosas a mano, una por una, y el trámite ante el SII es exactamente esa lista.
--
-- Con esta tabla la pregunta es una consulta.
-- ============================================================================

create table if not exists sii_folios_no_utilizados (
  id uuid primary key default uuid_generate_v7(),
  empresa_id uuid not null references empresa(id) on delete cascade,
  tipo_dte int not null check (tipo_dte in (33, 34, 56, 61)),
  ambiente sii_ambiente not null,
  folio bigint not null check (folio > 0),

  -- Qué factura lo intentaba usar. Se conserva el registro aunque la factura
  -- se borre: el folio se gastó igual y hay que declararlo igual.
  factura_id uuid references facturas(id) on delete set null,

  -- En qué paso murió, en castellano. Es lo que se le explica al SII si
  -- pregunta, y lo que evita repetir el mismo error.
  motivo text not null,

  created_at timestamptz not null default now(),

  -- Cuándo se declaró ante el SII. Null = pendiente. Es la columna que
  -- convierte esta tabla en una lista de tareas y no en un archivo muerto.
  declarado_at timestamptz,

  -- Un folio se gasta UNA vez. Si el mismo número apareciera dos veces sería
  -- un bug de tomar_folio(), y es mejor que la base lo rechace a que quede
  -- registrado como si fuera normal.
  unique (empresa_id, tipo_dte, ambiente, folio)
);

comment on table sii_folios_no_utilizados is
  'Folios consumidos que nunca llegaron a ser un documento válido. Hay que declararlos al SII; `declarado_at` marca los que ya se declararon.';
comment on column sii_folios_no_utilizados.motivo is
  'En qué paso falló la emisión. Nunca material criptográfico ni datos del certificado.';

create index if not exists idx_folios_no_utilizados_pendientes
  on sii_folios_no_utilizados (empresa_id, ambiente, tipo_dte, folio)
  where declarado_at is null;

-- ----------------------------------------------------------------------------
-- RLS: mismo criterio que sii_caf — es información de folios, o sea de
-- administración. Un operador puede facturar; saber qué folios se quemaron y
-- marcarlos como declarados es del que hace el trámite.
-- ----------------------------------------------------------------------------
alter table sii_folios_no_utilizados enable row level security;

drop policy if exists folios_no_utilizados_admin_only on sii_folios_no_utilizados;
create policy folios_no_utilizados_admin_only on sii_folios_no_utilizados for all to authenticated
  using (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  )
  with check (
    empresa_id = (select private.get_empresa())
    and (select private.get_rol()) = 'admin'
  );

-- El trigger de la 0050 rellena empresa_id al insertar: así la app no tiene que
-- mandarlo y no puede equivocarse de empresa.
drop trigger if exists set_empresa_id_folios_no_utilizados on sii_folios_no_utilizados;
create trigger set_empresa_id_folios_no_utilizados
  before insert on sii_folios_no_utilizados
  for each row execute function set_empresa_id();

-- ----------------------------------------------------------------------------
-- Verificación: qué folios hay que declarar. Lo esperable hoy es 0 filas.
-- ----------------------------------------------------------------------------
select e.nombre,
       f.ambiente,
       f.tipo_dte,
       f.folio,
       f.motivo,
       f.created_at::date as fecha
  from sii_folios_no_utilizados f
  join empresa e on e.id = f.empresa_id
 where f.declarado_at is null
 order by f.ambiente, f.tipo_dte, f.folio;
