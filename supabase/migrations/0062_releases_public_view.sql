-- =============================================================================
-- 0062 · El público lee las novedades por una vista, no por la tabla
-- =============================================================================
--
-- `releases` guarda el historial técnico de cada versión (`summary`, `changes`:
-- migraciones, cifras de pruebas, nombres de funciones). La 0007 la dejó con
-- lectura abierta, y el cartel de novedades y /novedades lo mostraban tal cual.
-- A quien usa el sitio eso no le sirve ni lo entiende, y le da a un tercero un
-- mapa de por dónde se tocó el sistema.
--
-- Ahora:
--   · `releases_public` expone solo lo escrito para el público: versión, fecha,
--     título y `user_summary`, y solo de las versiones publicadas que lo tienen.
--   · La tabla `releases` queda solo para admin (la política "solo admin
--     administra las versiones", de la 0007, ya cubre select).
--
-- La vista es del dueño (sin security_invoker) para poder leer la tabla que el
-- público ya no ve; por eso es la que decide qué columnas salen.
--
-- Re-ejecutable.

create or replace view public.releases_public as
  select id, version, released_at, title, user_summary
    from public.releases
   where is_published
     and nullif(btrim(user_summary), '') is not null;

-- Las vistas nuevas de `public` nacen con grants directos a anon y authenticated
-- (default privileges de Supabase); se cierran y se abre solo lo que hace falta.
revoke all on public.releases_public from public;
revoke all on public.releases_public from anon, authenticated;
grant select on public.releases_public to anon, authenticated;

drop policy if exists "las versiones publicadas son visibles para todos" on public.releases;
