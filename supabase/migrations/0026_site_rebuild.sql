-- =============================================================================
-- X AutoHub — Republicar el sitio cuando cambia el catálogo (después del prerender)
-- =============================================================================
--
-- Desde la 2.10.0 las páginas públicas salen como HTML estático en cada build: un
-- buscador o la vista previa de WhatsApp lee ahí el nombre, el precio y la foto sin
-- ejecutar JavaScript. Ese HTML es una foto del último despliegue. Un precio o una foto
-- cambiados en el panel se ven en la ficha en cuanto carga el JavaScript, pero el
-- buscador y WhatsApp siguen leyendo la foto vieja hasta el próximo despliegue.
--
-- Esta migración hace que el propio catálogo pida el despliegue: cuando cambia algo que
-- sale en esas páginas, la base lo anota, y pasados unos minutos sin más cambios le pide a
-- Vercel que construya de nuevo (un *deploy hook*, que reconstruye lo que hay en `main`).
--
--   · `site_rebuild`: una sola fila. Cuándo empezó a haber cambios sin publicar, cuándo
--     fue el último y cuándo se pidió el último despliegue.
--   · `mark_site_dirty()`: el trigger que anota el cambio.
--   · `fire_site_rebuild()`: la que decide si ya toca pedir el despliegue, y lo pide.
--   · Un trabajo de `pg_cron` que la llama cada 5 minutos.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Se espera a que el panel se calle.** Editar un producto son varios guardados
--   seguidos (datos, fotos, opciones). Se despliega 3 minutos después del último cambio, y
--   a más tardar 30 minutos después del primero aunque no se callen. Nunca más de un
--   despliegue cada 10 minutos: cada uno cuesta minutos de build.
-- · **Solo lo que se ve en las páginas.** Una compra descuenta stock y suma ventas en
--   `hub_parts`: eso no publica nada. El stock sí cuenta cuando cruza el cero, porque
--   cambia "Disponible" por "Agotado" en el JSON-LD.
-- · **El enlace del hook es un secreto** (quien lo conozca puede lanzar builds): vive en
--   Supabase Vault con el nombre `vercel_deploy_hook`, no en el repositorio ni en una
--   tabla. Sin él, la función no hace nada y los cambios quedan anotados, así que cargarlo
--   después publica lo pendiente. Se carga una vez:
--
--       select vault.create_secret('https://api.vercel.com/v1/integrations/deploy/…', 'vercel_deploy_hook');
--
-- · **Nadie del navegador toca esto.** La tabla y las dos funciones no son de `anon` ni de
--   `authenticated`: solo los triggers y el cron.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Migración → crear el deploy hook en Vercel → cargarlo en el Vault. No hay cambios de
-- frontend. Hasta que el hook esté en el Vault, no pasa nada.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES: todo lleva `if not exists` /
-- `create or replace` / `drop ... if exists`, y `cron.schedule` con nombre reemplaza.
-- =============================================================================

-- pg_net y pg_cron vienen con Supabase; en un Postgres pelado (verify-migrations.sh) no
-- existen y el script pone en su lugar el esquema mínimo.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    -- En `extensions`, no en `public`: ahi PostgREST lo expondria (advisor extension_in_public).
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- site_rebuild: el estado (una sola fila)
-- -----------------------------------------------------------------------------
create table if not exists public.site_rebuild (
  id             boolean primary key default true check (id),
  -- Nulo = no hay nada sin publicar. Si no, desde cuándo.
  dirty_since    timestamptz,
  last_change_at timestamptz,
  last_fired_at  timestamptz,
  fired_count    integer not null default 0
);

insert into public.site_rebuild (id) values (true) on conflict (id) do nothing;

comment on table public.site_rebuild is
  'Estado de la republicación del sitio: cambios del catálogo sin publicar y último despliegue pedido. Solo lo tocan mark_site_dirty() y fire_site_rebuild().';

alter table public.site_rebuild enable row level security;
revoke all on public.site_rebuild from anon, authenticated;


-- -----------------------------------------------------------------------------
-- mark_site_dirty(): anotar que hay algo sin publicar
-- -----------------------------------------------------------------------------
create or replace function public.mark_site_dirty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Lo que cambia con cada compra o con cada guardado no es contenido: el stock, las
    -- ventas, la marca de tiempo y el índice de búsqueda. Si no cambió nada más, solo
    -- importa que el stock haya cruzado el cero (Disponible <-> Agotado).
    if (to_jsonb(old) - 'stock' - 'sold_count' - 'updated_at' - 'search_vector')
       = (to_jsonb(new) - 'stock' - 'sold_count' - 'updated_at' - 'search_vector') then
      if tg_table_name in ('hub_parts', 'product_variants') then
        if (old.stock > 0) = (new.stock > 0) then
          return null;
        end if;
      else
        return null;
      end if;
    end if;
  end if;

  update public.site_rebuild
     set dirty_since    = coalesce(dirty_since, now()),
         last_change_at = now()
   where id;
  return null;
end;
$$;

comment on function public.mark_site_dirty() is
  'Trigger: anota que el catálogo cambió en algo que sale en las páginas prerenderizadas.';

-- Una función de trigger no se invoca por rpc, pero se cierra igual (las tres líneas).
revoke all on function public.mark_site_dirty() from public;
revoke execute on function public.mark_site_dirty() from anon;
revoke execute on function public.mark_site_dirty() from authenticated;

-- Lo que sale en las páginas prerenderizadas: las piezas, sus opciones (el stock y la foto),
-- las categorías, el taller y los ajustes del sitio.
drop trigger if exists hub_parts_mark_site_dirty on public.hub_parts;
create trigger hub_parts_mark_site_dirty
  after insert or update or delete on public.hub_parts
  for each row execute function public.mark_site_dirty();

drop trigger if exists product_variants_mark_site_dirty on public.product_variants;
create trigger product_variants_mark_site_dirty
  after insert or update or delete on public.product_variants
  for each row execute function public.mark_site_dirty();

drop trigger if exists product_categories_mark_site_dirty on public.product_categories;
create trigger product_categories_mark_site_dirty
  after insert or update or delete on public.product_categories
  for each row execute function public.mark_site_dirty();

drop trigger if exists services_mark_site_dirty on public.services;
create trigger services_mark_site_dirty
  after insert or update or delete on public.services
  for each row execute function public.mark_site_dirty();

drop trigger if exists site_settings_mark_site_dirty on public.site_settings;
create trigger site_settings_mark_site_dirty
  after insert or update or delete on public.site_settings
  for each row execute function public.mark_site_dirty();


-- -----------------------------------------------------------------------------
-- fire_site_rebuild(): decidir si ya toca desplegar, y pedirlo
-- -----------------------------------------------------------------------------
-- Devuelve qué hizo, para poder leerlo en un `select` a mano.
create or replace function public.fire_site_rebuild()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c_quiet    constant interval := interval '3 minutes';
  c_max_wait constant interval := interval '30 minutes';
  c_min_gap  constant interval := interval '10 minutes';
  v_state public.site_rebuild%rowtype;
  v_hook  text;
begin
  select * into v_state from public.site_rebuild where id for update;

  if v_state.dirty_since is null then
    return 'nada que publicar';
  end if;

  -- Esperar a que el panel se calle, pero no para siempre.
  if now() - v_state.last_change_at < c_quiet and now() - v_state.dirty_since < c_max_wait then
    return 'esperando a que terminen los cambios';
  end if;

  if v_state.last_fired_at is not null and now() - v_state.last_fired_at < c_min_gap then
    return 'muy pronto despues del ultimo despliegue';
  end if;

  select decrypted_secret into v_hook
    from vault.decrypted_secrets
   where name = 'vercel_deploy_hook'
   limit 1;

  -- Sin enlace no se pierde nada: los cambios siguen anotados y se publican cuando se cargue.
  if v_hook is null or v_hook = '' then
    return 'sin enlace de despliegue en el Vault';
  end if;

  perform net.http_post(url := v_hook);

  update public.site_rebuild
     set dirty_since   = null,
         last_fired_at = now(),
         fired_count   = fired_count + 1
   where id;

  return 'despliegue pedido';
end;
$$;

comment on function public.fire_site_rebuild() is
  'Cada 5 minutos (pg_cron): si hay cambios sin publicar y el panel se calló, le pide a Vercel un despliegue por el deploy hook guardado en el Vault.';

revoke all on function public.fire_site_rebuild() from public;
revoke execute on function public.fire_site_rebuild() from anon;
revoke execute on function public.fire_site_rebuild() from authenticated;


-- -----------------------------------------------------------------------------
-- El cron: cada 5 minutos
-- -----------------------------------------------------------------------------
-- Con nombre: volver a programarlo lo reemplaza, no lo duplica.
select cron.schedule('site-rebuild', '*/5 * * * *', 'select public.fire_site_rebuild()');
