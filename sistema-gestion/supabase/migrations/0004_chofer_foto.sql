-- ============================================================================
-- Foto de perfil de choferes
-- Ejecutar en Supabase > SQL Editor DESPUÉS de las migraciones anteriores.
-- Es seguro ejecutarlo más de una vez.
-- ============================================================================

alter table choferes add column if not exists foto_url text;

-- Bucket público para fotos de perfil (choferes)
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
  on conflict (id) do nothing;

drop policy if exists "fotos_auth_rw" on storage.objects;
create policy "fotos_auth_rw" on storage.objects for all to authenticated
  using (bucket_id = 'fotos')
  with check (bucket_id = 'fotos');

drop policy if exists "fotos_public_read" on storage.objects;
create policy "fotos_public_read" on storage.objects for select to anon
  using (bucket_id = 'fotos');
