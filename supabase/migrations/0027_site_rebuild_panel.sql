-- =============================================================================
-- X AutoHub — "Publicar ahora" en el panel (después de la republicación automática)
-- =============================================================================
--
-- La 0026 hace que la base pida sola un despliegue unos minutos después de un cambio de
-- catálogo. Aquí el panel gana dos cosas, solo para admins:
--
--   · `site_rebuild_status()`: si hay cambios sin publicar, desde cuándo, cuándo fue el
--     último despliegue pedido y si el enlace del hook está cargado. Es lo que dibuja la
--     barra de `/admin` ("Hay cambios sin publicar" / "Sitio al día").
--   · `request_site_rebuild()`: el botón "Publicar ahora". Pide el despliegue sin esperar
--     a que pasen los 3 minutos de silencio.
--
-- Y una cosa para todos: una **reseña nueva** (o una borrada) también marca el sitio como
-- pendiente, porque el `aggregateRating` del JSON-LD sale del build.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **"Publicar ahora" se salta la espera, no el freno.** Pasa por encima de los 3 minutos
--   de silencio, pero no pide dos despliegues con menos de 1 minuto de por medio: un doble
--   clic no lanza dos builds. (El freno de 10 minutos del cron sigue siendo del cron.)
-- · **Se puede publicar aunque no haya nada pendiente.** Sirve para reintentar después de
--   un build que falló, que no deja nada anotado.
-- · **Solo admins**, comprobado dentro de la función con `is_admin()` (un moderador no
--   publica). Las dos son `security definer` porque `site_rebuild` y el Vault no se leen
--   desde el navegador.
-- · **El enlace del hook nunca sale de la base**: el estado solo dice si existe.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Migración → frontend. El frontend anterior no sabe nada de esto.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: `create or replace` / `drop ... if exists`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Las reseñas también cuentan
-- -----------------------------------------------------------------------------
drop trigger if exists reviews_mark_site_dirty on public.reviews;
create trigger reviews_mark_site_dirty
  after insert or update or delete on public.reviews
  for each row execute function public.mark_site_dirty();


-- -----------------------------------------------------------------------------
-- site_rebuild_status(): lo que dibuja la barra del panel
-- -----------------------------------------------------------------------------
create or replace function public.site_rebuild_status()
returns table (
  dirty_since     timestamptz,
  last_change_at  timestamptz,
  last_fired_at   timestamptz,
  fired_count     integer,
  hook_configured boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver el estado de la publicacion.' using errcode = '42501';
  end if;

  return query
    select s.dirty_since, s.last_change_at, s.last_fired_at, s.fired_count,
           exists (
             select 1 from vault.decrypted_secrets v
             where v.name = 'vercel_deploy_hook' and coalesce(v.decrypted_secret, '') <> ''
           )
    from public.site_rebuild s
    where s.id;
end;
$$;

comment on function public.site_rebuild_status() is
  'Solo admin. Estado de la republicación del sitio para la barra del panel. No devuelve el enlace del hook, solo si existe.';

revoke all on function public.site_rebuild_status() from public;
revoke execute on function public.site_rebuild_status() from anon;
grant execute on function public.site_rebuild_status() to authenticated;


-- -----------------------------------------------------------------------------
-- request_site_rebuild(): el botón "Publicar ahora"
-- -----------------------------------------------------------------------------
-- Devuelve un código, no un texto para mostrar: la interfaz decide qué decir.
--   'requested' | 'too_soon' | 'no_hook'
create or replace function public.request_site_rebuild()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c_min_gap constant interval := interval '1 minute';
  v_state public.site_rebuild%rowtype;
  v_hook  text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede publicar el sitio.' using errcode = '42501';
  end if;

  select * into v_state from public.site_rebuild where id for update;

  if v_state.last_fired_at is not null and now() - v_state.last_fired_at < c_min_gap then
    return 'too_soon';
  end if;

  select decrypted_secret into v_hook
    from vault.decrypted_secrets
   where name = 'vercel_deploy_hook'
   limit 1;

  if v_hook is null or v_hook = '' then
    return 'no_hook';
  end if;

  perform net.http_post(url := v_hook);

  update public.site_rebuild
     set dirty_since   = null,
         last_fired_at = now(),
         fired_count   = fired_count + 1
   where id;

  return 'requested';
end;
$$;

comment on function public.request_site_rebuild() is
  'Solo admin. "Publicar ahora": pide el despliegue sin esperar el silencio del panel. Devuelve requested, too_soon o no_hook.';

revoke all on function public.request_site_rebuild() from public;
revoke execute on function public.request_site_rebuild() from anon;
grant execute on function public.request_site_rebuild() to authenticated;
