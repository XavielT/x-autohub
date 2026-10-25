-- =============================================================================
-- X AutoHub — Vendido y caducidad de las publicaciones de Hub Market
-- =============================================================================
--
-- Hasta aquí una publicación aprobada se quedaba en el sitio (y, desde la 2.15.0, en el HTML
-- prerenderizado y en el sitemap) hasta que alguien la borrara. Ahora tiene ciclo de vida:
--
--   · `sold_at`    — la fecha en que su dueño la marcó como vendida. Nula = a la venta.
--   · `expires_at` — hasta cuándo se muestra. Nace a los 60 días; el dueño la renueva.
--
-- Una publicación vendida o vencida **sale de los listados, del sitemap y del prerenderizado**,
-- pero su ficha sigue respondiendo (con un aviso): quien tenga el enlace guardado o recibido por
-- WhatsApp ve "ya se vendió", no un "no encontrado". Por eso la política de select NO cambia: el
-- filtro vive en las consultas, no en RLS.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Las fechas las pone la base, no el navegador.** `mark_publication_sold()` y
--   `renew_publication()` usan el reloj de Postgres, y `sold_at`/`expires_at` quedan congeladas en
--   cualquier update normal (igual que `status`, ver 0012/0013): si el dueño pudiera escribirlas, una
--   publicación podría vencer en el año 2099. Un insert tampoco las trae: nacen a los 60 días.
-- · **Vencer es derivado, no un estado.** Nadie "vence" una fila: los listados comparan
--   `expires_at` con la hora actual. Lo único que hace falta es que el HTML prerenderizado se
--   entere: `mark_expired_publications()` (pg_cron, una vez al día) pide un despliegue si venció algo
--   en las últimas 24 horas. Si un día el cron falla, el HTML se corrige con el siguiente despliegue
--   por otro motivo; nada se rompe.
-- · **Renovar también "des-vende".** Es la única forma de volver a publicar lo vendido, y deja
--   la publicación otros 60 días.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- Migración → frontend. Con la migración aplicada y el frontend viejo, nada cambia: las columnas
-- nuevas no se leen. Con el frontend nuevo y sin migración, los `select('*')` no traen las columnas
-- (el modelo las lee como ausentes) pero las funciones nuevas no existirían: se migra primero.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas
-- -----------------------------------------------------------------------------
-- Las filas que ya existen reciben 60 días a partir de ahora: nada vence el día del despliegue.
alter table public.hub_market_items
  add column if not exists sold_at    timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '60 days');

comment on column public.hub_market_items.sold_at is
  'Cuándo su dueño la marcó como vendida (0030). Nula = sigue a la venta. Solo la escribe mark_publication_sold().';
comment on column public.hub_market_items.expires_at is
  'Hasta cuándo se muestra en Hub Market (0030). Nace a los 60 días; renew_publication() la extiende.';


-- -----------------------------------------------------------------------------
-- 2. Nadie nace vendido ni con otro plazo
-- -----------------------------------------------------------------------------
-- La misma función de 0012; se repite entera porque `create or replace` no admite parches.
create or replace function public.force_publication_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin sesión (seed, script con service_role): se respeta lo que traiga la fila.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_moderator_or_admin() then
    new.status := coalesce(nullif(new.status, ''), 'aprobado');
    if new.status not in ('pendiente', 'aprobado', 'rechazado') then
      new.status := 'aprobado';
    end if;
  else
    new.status := 'pendiente';
  end if;

  new.rejection_reason := null;
  new.reviewed_by      := null;
  new.reviewed_at      := null;

  -- 0030: una publicación nace a la venta y con el plazo normal, venga lo que venga del navegador.
  new.sold_at    := null;
  new.expires_at := now() + interval '60 days';

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Congelar las fechas en los updates normales
-- -----------------------------------------------------------------------------
-- La de 0013, más las dos columnas nuevas. Las funciones de abajo y `moderate_publication()` abren la
-- puerta con `app.allow_moderation`, como ya hacía 0012.
create or replace function public.freeze_publication_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('app.allow_moderation', true), '') <> 'on' then
    new.status           := old.status;
    new.rejection_reason := old.rejection_reason;
    new.reviewed_by      := old.reviewed_by;
    new.reviewed_at      := old.reviewed_at;
    new.sold_at          := old.sold_at;
    new.expires_at       := old.expires_at;
  end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_moderator_or_admin() then
    new.is_test := old.is_test;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 4. Marcar como vendida y renovar
-- -----------------------------------------------------------------------------
-- Las dos las puede usar el dueño de la publicación o quien modera. Devuelven las fechas nuevas.
create or replace function public.mark_publication_sold(p_id bigint)
returns table (sold_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select i.seller_id into v_owner from public.hub_market_items i where i.id = p_id;

  if not found then
    raise exception 'Esa publicacion no existe.' using errcode = '22023';
  end if;

  if auth.uid() is null or not (v_owner = auth.uid() or public.is_moderator_or_admin()) then
    raise exception 'Solo su dueno puede marcar una publicacion como vendida.' using errcode = '42501';
  end if;

  perform set_config('app.allow_moderation', 'on', true);

  update public.hub_market_items i
     set sold_at = coalesce(i.sold_at, now())
   where i.id = p_id;

  perform set_config('app.allow_moderation', 'off', true);

  return query
    select i.sold_at, i.expires_at from public.hub_market_items i where i.id = p_id;
end;
$$;

create or replace function public.renew_publication(p_id bigint)
returns table (sold_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select i.seller_id into v_owner from public.hub_market_items i where i.id = p_id;

  if not found then
    raise exception 'Esa publicacion no existe.' using errcode = '22023';
  end if;

  if auth.uid() is null or not (v_owner = auth.uid() or public.is_moderator_or_admin()) then
    raise exception 'Solo su dueno puede renovar una publicacion.' using errcode = '42501';
  end if;

  perform set_config('app.allow_moderation', 'on', true);

  update public.hub_market_items i
     set sold_at    = null,
         expires_at = now() + interval '60 days'
   where i.id = p_id;

  perform set_config('app.allow_moderation', 'off', true);

  return query
    select i.sold_at, i.expires_at from public.hub_market_items i where i.id = p_id;
end;
$$;

-- Las tres líneas de siempre: solo quien tiene sesión.
revoke all on function public.mark_publication_sold(bigint) from public;
revoke execute on function public.mark_publication_sold(bigint) from anon;
grant execute on function public.mark_publication_sold(bigint) to authenticated;

revoke all on function public.renew_publication(bigint) from public;
revoke execute on function public.renew_publication(bigint) from anon;
grant execute on function public.renew_publication(bigint) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. Que el HTML se entere de lo que venció
-- -----------------------------------------------------------------------------
-- Nadie escribe la fila cuando una publicación vence, así que ningún trigger se entera. Esta función
-- corre una vez al día y, si algo visible venció en las últimas 24 horas, anota que el sitio cambió
-- (lo mismo que hace `mark_site_dirty()`); `fire_site_rebuild()` ya sabe cuándo desplegar.
-- Devuelve cuántas venció, para poder leerlo en un `select` a mano.
create or replace function public.mark_expired_publications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.hub_market_items i
   where i.is_active
     and i.status = 'aprobado'
     and not i.is_test
     and i.sold_at is null
     and i.expires_at <= now()
     and i.expires_at >  now() - interval '1 day';

  if v_count > 0 then
    update public.site_rebuild
       set dirty_since    = coalesce(dirty_since, now()),
           last_change_at = now()
     where id;
  end if;

  return v_count;
end;
$$;
comment on function public.mark_expired_publications() is
  'Cron diario (0030): pide un despliegue si venció alguna publicación visible en las últimas 24 horas.';

revoke all on function public.mark_expired_publications() from public;
revoke execute on function public.mark_expired_publications() from anon;
revoke execute on function public.mark_expired_publications() from authenticated;

-- 00:15 hora de República Dominicana (UTC-4). `cron.schedule` con nombre reemplaza: se puede repetir.
select cron.schedule('expire-publications', '15 4 * * *', 'select public.mark_expired_publications()');
