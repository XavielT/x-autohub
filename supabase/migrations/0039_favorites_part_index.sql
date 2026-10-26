-- =============================================================================
-- X AutoHub — Índice de favorites.part_id (0039)
-- =============================================================================
--
-- El linter de rendimiento de Supabase marcó `favorites_part_id_fkey` sin índice: borrar
-- un producto obliga a buscar sus favoritos (`on delete cascade`) y, sin índice, recorre
-- toda la tabla. La clave primaria (user_id, part_id) no sirve para eso: `part_id` es la
-- segunda columna. Solo aditiva.

create index if not exists favorites_part_idx on public.favorites (part_id);
