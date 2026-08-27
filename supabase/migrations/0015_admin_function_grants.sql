-- =============================================================================
-- X AutoHub — Quitarle a `anon` el permiso de invocar las funciones de admin
-- =============================================================================
--
-- POR QUÉ
-- -------
-- Las migraciones 0009, 0011 y 0012 cierran sus funciones así:
--
--     revoke all on function public.admin_list_users() from public;
--     grant execute on function public.admin_list_users() to authenticated;
--
-- Eso **no** deja fuera a `anon`, y es fácil de creer que sí. En el proyecto de
-- Supabase las funciones nuevas del esquema `public` nacen con un grant
-- **directo** a `anon` y a `authenticated` por los default privileges de la
-- plataforma; quitarle el permiso al pseudo-rol PUBLIC no toca esos grants.
--
-- Comprobado leyendo `pg_proc.proacl` de la base en vivo: `anon=X/postgres` en
-- las seis funciones de abajo. Con la clave anon —que es pública, va en el
-- bundle del sitio— se podía invocar `set_user_role()`.
--
-- **No era explotable**: las seis vuelven a comprobar el rol dentro de Postgres
-- y responden `42501`. Eso es exactamente lo que se quería del diseño ("la
-- seguridad real está en RLS y en las funciones", CLAUDE.md) y es lo que
-- aguantó. Pero el permiso no debería estar: obliga a que la única defensa sea
-- el `if not is_admin()` de la primera línea, y el día que a alguien se le
-- olvide poner ese `if` en una función nueva, el agujero es total.
--
--
-- QUÉ **NO** SE TOCA, Y POR QUÉ IMPORTA
-- -------------------------------------
-- 1. `is_admin()`, `is_moderator_or_admin()`, `can_see_test_items()`.
--    Las llaman las ~30 políticas RLS, y una política se evalúa con los
--    permisos del rol que hace la consulta, no del dueño de la tabla. Si `anon`
--    perdiera el execute, **cada select anónimo del sitio fallaría**: el
--    catálogo, Hub Market, Auto Hub, las noticias. Todo.
--
-- 2. `create_order(...)`. El checkout de invitado existe a propósito (0002:
--    "cualquiera puede crear un pedido"), y es la única puerta por la que el
--    navegador puede crear uno. Sin sesión también.
--
-- 3. `get_site_stats()` (0014). La lee el home sin sesión.
--
-- 4. Las funciones de trigger (`handle_new_user`, `freeze_*`,
--    `force_publication_status`, `sync_profile_is_admin`,
--    `guard_site_settings_write`, `rls_auto_enable`). Postgres no comprueba
--    EXECUTE para ejecutar un trigger —el permiso se valida al crearlo—, y por
--    PostgREST no se pueden llamar (una función que devuelve `trigger` responde
--    "trigger functions can only be called as triggers"). Revocarlas no
--    aportaría nada y sí podría romper un trigger si ese razonamiento falla en
--    algún borde. Se dejan como están.
--
-- O sea: se revoca solo lo que un navegador **nunca** debe invocar sin sesión.
-- =============================================================================

revoke execute on function public.admin_list_users() from anon;
revoke execute on function public.get_my_profile() from anon;
revoke execute on function public.moderate_publication(bigint, text, text) from anon;
revoke execute on function public.set_user_admin(uuid, boolean, boolean) from anon;
revoke execute on function public.set_user_role(uuid, text, boolean) from anon;
revoke execute on function public.set_user_test(uuid, boolean) from anon;

-- El grant a `authenticated` se reafirma: es el rol que sí las usa, y así esta
-- migración deja el estado completo escrito en un solo sitio en vez de depender
-- de que el de las migraciones anteriores siga ahí.
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.moderate_publication(bigint, text, text) to authenticated;
grant execute on function public.set_user_admin(uuid, boolean, boolean) to authenticated;
grant execute on function public.set_user_role(uuid, text, boolean) to authenticated;
grant execute on function public.set_user_test(uuid, boolean) to authenticated;

-- Nota para la próxima función `security definer` que se escriba: el idiom
-- completo son **tres** líneas, no dos.
--
--     revoke all     on function f() from public;
--     revoke execute on function f() from anon;          -- esta es la que faltaba
--     grant  execute on function f() to authenticated;
--
-- Y sigue haciendo falta el `if not public.is_admin() then raise` de dentro: el
-- grant decide quién puede llamar, la comprobación decide quién puede hacer.
