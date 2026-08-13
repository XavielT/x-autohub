-- =============================================================================
-- X AutoHub — Storage
-- =============================================================================
-- Dos buckets públicos en lectura (las imágenes de un clasificado tienen que
-- verse sin sesión) pero restringidos en escritura.
--
-- Convención de rutas: <uid>/<timestamp>-<nombre>.jpg
-- La primera carpeta ES el uid del dueño, y las políticas de abajo dependen de
-- eso: `storage.foldername(name)[1]` devuelve esa primera carpeta.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listings', 'listings', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',  'avatars',  true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- listings — fotos de las publicaciones de Hub Market
-- -----------------------------------------------------------------------------
create policy "imagenes de publicaciones visibles para todos"
  on storage.objects for select
  using (bucket_id = 'listings');

create policy "usuarios autenticados suben a su propia carpeta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "cada usuario borra sus propias imagenes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- avatars — foto de perfil
-- -----------------------------------------------------------------------------
create policy "avatares visibles para todos"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "cada usuario administra su avatar"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
