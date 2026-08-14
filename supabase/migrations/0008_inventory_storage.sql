-- =============================================================================
-- X AutoHub — Bucket para las imágenes del inventario propio
-- =============================================================================
--
-- Los buckets de 0003 no sirven para esto:
--
--   - `listings` es para los clasificados de la comunidad, y su política de
--     escritura obliga a que la primera carpeta de la ruta sea el uid de quien
--     sube. Un vehículo oficial de X AutoHub no pertenece a una persona: si esa
--     cuenta se borra, la ruta queda hablando de un uid que ya no existe.
--   - `avatars` es la foto de perfil.
--
-- Este bucket es al revés: lectura pública (las fotos del catálogo tienen que
-- verse sin sesión) y escritura **solo de admin**, comprobada con la misma
-- función `public.is_admin()` que usan las tablas de inventario. Así la ruta no
-- carga con ningún significado de permisos y se puede organizar por tipo.
--
-- Convención de rutas: <tipo>/<archivo>, donde tipo es piezas | vehiculos | noticias.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('inventory', 'inventory', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "imagenes del inventario visibles para todos"
  on storage.objects for select
  using (bucket_id = 'inventory');

create policy "solo admin sube imagenes del inventario"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'inventory' and public.is_admin());

create policy "solo admin reemplaza imagenes del inventario"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'inventory' and public.is_admin())
  with check (bucket_id = 'inventory' and public.is_admin());

create policy "solo admin borra imagenes del inventario"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'inventory' and public.is_admin());
