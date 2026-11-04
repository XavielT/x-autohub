-- =============================================================================
-- X AutoHub — Moderación asistida: Hub Market, comunidad y reseñas
-- =============================================================================
--
-- La IA revisa lo que la gente publica y deja una SUGERENCIA (`ai_moderation`); un moderador decide. Hub Market NUNCA se aprueba ni se
-- rechaza solo. La única acción automática de este bloque es ocultar contenido de la comunidad (publicaciones, comentarios, reseñas)
-- que sea claramente dañino, y es reversible: nada se borra.
--
-- LA REGLA DE OCULTAR VIVE EN SQL, NO EN LA IA
-- --------------------------------------------
-- `ai_save_moderation()` solo oculta si TODO esto se cumple: el ajuste `ai_auto_hide` está encendido, el riesgo es 'alto', la confianza es >= 0.9,
-- alguna categoría es de {spam, estafa, insultos_graves, sexual_explicito}, el contenido es de la comunidad (no Hub Market) y un moderador no lo
-- había restaurado antes. Lo que ocultó la IA se marca `hidden_by_ai`: el autor lo sigue viendo ("en revisión"), el público no, y un moderador lo
-- restaura con un toque (`restore_hidden_content()`).
--
-- PRECIO FUERA DE RANGO: se calcula aquí (`ai_hub_price_context()`), la IA solo lo explica.
--
-- DISPARO: triggers + pg_net con los secretos del Vault (`ai_functions_url`, `ai_cron_secret`, `send_push_anon_key`), igual que 0052.
-- Sin ellos no hace nada y no falla publicar.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Contenido oculto
-- -----------------------------------------------------------------------------

alter table public.social_posts         add column if not exists hidden_by_ai boolean not null default false;
alter table public.social_posts         add column if not exists hidden_at timestamptz;
alter table public.social_post_comments add column if not exists hidden_by_ai boolean not null default false;
alter table public.social_post_comments add column if not exists hidden_at timestamptz;
alter table public.reviews              add column if not exists hidden_by_ai boolean not null default false;
alter table public.reviews              add column if not exists hidden_at timestamptz;

-- El público no ve lo oculto; el autor sí (para saber que está "en revisión") y un moderador también.
drop policy if exists "publicaciones del feed visibles para todos" on public.social_posts;
create policy "publicaciones del feed visibles para todos"
  on public.social_posts for select
  using (not hidden_by_ai or author_id = auth.uid() or public.is_moderator_or_admin());

drop policy if exists "los comentarios los ve todo el mundo" on public.social_post_comments;
create policy "los comentarios los ve todo el mundo"
  on public.social_post_comments for select
  using (not hidden_by_ai or author_id = auth.uid() or public.is_moderator_or_admin());

drop policy if exists "las reseñas las lee cualquiera" on public.reviews;
create policy "las reseñas las lee cualquiera"
  on public.reviews for select
  using (not hidden_by_ai or user_id = auth.uid() or public.is_moderator_or_admin());

-- Nadie escribe estas columnas desde el navegador: `social_posts` ya solo deja actualizar un puñado de columnas (0045);
-- comentarios y reseñas no tienen UPDATE. Ocultar y restaurar pasan por las funciones de abajo.

-- Una reseña oculta no cuenta en el promedio ni en el resumen: `review_stats()` y el trigger que mantiene `hub_parts` la ignoran.
create or replace function public.review_stats(p_target_type public.review_target, p_target_id bigint)
returns table (total integer, average numeric, c1 integer, c2 integer, c3 integer, c4 integer, c5 integer)
language sql
stable
set search_path = public
as $$
  select count(*)::int,
         coalesce(round(avg(r.rating)::numeric, 1), 0),
         (count(*) filter (where r.rating = 1))::int,
         (count(*) filter (where r.rating = 2))::int,
         (count(*) filter (where r.rating = 3))::int,
         (count(*) filter (where r.rating = 4))::int,
         (count(*) filter (where r.rating = 5))::int
  from public.reviews r
  where r.target_type = p_target_type and r.target_id = p_target_id and not r.hidden_by_ai;
$$;

create or replace function public.reviews_sync_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.review_target := coalesce(new.target_type, old.target_type);
  v_id   bigint               := coalesce(new.target_id, old.target_id);
  v_n    integer;
  v_avg  numeric;
begin
  if v_type <> 'product' then
    return null;
  end if;

  select count(*), round(avg(r.rating)::numeric, 1)
    into v_n, v_avg
  from public.reviews r
  where r.target_type = 'product' and r.target_id = v_id and not r.hidden_by_ai;

  update public.hub_parts p
     set review_count = v_n,
         stars_rating = case when v_n > 0 then v_avg else p.stars_seed end
   where p.id = v_id;

  return null;
end;
$$;

drop trigger if exists reviews_sync_product on public.reviews;
create trigger reviews_sync_product
  after insert or delete or update of hidden_by_ai on public.reviews
  for each row execute function public.reviews_sync_product();

-- -----------------------------------------------------------------------------
-- 2. Las sugerencias
-- -----------------------------------------------------------------------------

create table if not exists public.ai_moderation (
  id           bigint generated always as identity primary key,
  target_type  text        not null check (target_type in ('hub_market_item', 'social_post', 'social_comment', 'review')),
  target_id    bigint      not null,
  risk         text        not null check (risk in ('bajo', 'medio', 'alto')),
  categories   text[]      not null default '{}',
  reasons      text        not null default '',
  suggested    text        not null check (suggested in ('aprobar', 'revisar', 'rechazar')),
  confidence   numeric(3, 2) not null check (confidence between 0 and 1),
  auto_action  text        not null default 'ninguna' check (auto_action in ('ninguna', 'oculto')),
  -- Para Hub Market: lo que calculó la base sobre el precio (la IA solo lo explica).
  price_context jsonb,
  model        text,
  cost_usd     numeric(10, 6) not null default 0,
  restored_by  uuid references auth.users(id) on delete set null,
  restored_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint ai_moderation_one_per_target unique (target_type, target_id)
);

comment on table public.ai_moderation is
  'Sugerencia de la IA sobre un contenido. La escribe la edge (service_role) con ai_save_moderation(); la leen moderadores y admins.';

create index if not exists ai_moderation_risk_idx on public.ai_moderation (risk, created_at desc);

alter table public.ai_moderation enable row level security;
revoke all on public.ai_moderation from anon, authenticated;
grant select on public.ai_moderation to authenticated;

drop policy if exists "moderadores y admins leen las sugerencias" on public.ai_moderation;
create policy "moderadores y admins leen las sugerencias"
  on public.ai_moderation for select to authenticated using (public.is_moderator_or_admin());

-- -----------------------------------------------------------------------------
-- 3. Guardar una sugerencia (y ocultar, si la regla lo manda) — solo service_role
-- -----------------------------------------------------------------------------

create or replace function public.ai_save_moderation(
  p_target_type  text,
  p_target_id    bigint,
  p_risk         text,
  p_categories   text[],
  p_reasons      text,
  p_suggested    text,
  p_confidence   numeric,
  p_price_context jsonb,
  p_model        text,
  p_cost_usd     numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       bigint;
  v_restored timestamptz;
  v_hide     boolean;
  v_action   text := 'ninguna';
begin
  select m.restored_at into v_restored from public.ai_moderation m where m.target_type = p_target_type and m.target_id = p_target_id;

  v_hide := public.ai_setting_bool('ai_auto_hide', true)
        and p_target_type in ('social_post', 'social_comment', 'review')
        and p_risk = 'alto'
        and p_confidence >= 0.9
        and p_categories && array['spam', 'estafa', 'insultos_graves', 'sexual_explicito']
        and v_restored is null;

  if v_hide then
    if p_target_type = 'social_post' then
      update public.social_posts set hidden_by_ai = true, hidden_at = now() where id = p_target_id and not hidden_by_ai;
    elsif p_target_type = 'social_comment' then
      update public.social_post_comments set hidden_by_ai = true, hidden_at = now() where id = p_target_id and not hidden_by_ai;
    else
      update public.reviews set hidden_by_ai = true, hidden_at = now() where id = p_target_id and not hidden_by_ai;
    end if;
    if found then v_action := 'oculto'; end if;
  end if;

  insert into public.ai_moderation as m (target_type, target_id, risk, categories, reasons, suggested, confidence, auto_action, price_context, model, cost_usd)
  values (p_target_type, p_target_id, p_risk, coalesce(p_categories, '{}'), coalesce(p_reasons, ''), p_suggested, p_confidence, v_action, p_price_context, p_model, coalesce(p_cost_usd, 0))
  on conflict (target_type, target_id) do update
    set risk = excluded.risk, categories = excluded.categories, reasons = excluded.reasons, suggested = excluded.suggested,
        confidence = excluded.confidence, price_context = excluded.price_context, model = excluded.model, cost_usd = excluded.cost_usd,
        -- Lo que ya estaba oculto sigue oculto hasta que un moderador lo restaure.
        auto_action = case when m.auto_action = 'oculto' and m.restored_at is null then 'oculto' else excluded.auto_action end
  returning m.id, m.auto_action into v_id, v_action;

  return jsonb_build_object('id', v_id, 'auto_action', v_action);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Contexto de precio de una publicación de Hub Market (la IA solo lo explica)
-- -----------------------------------------------------------------------------
-- Compara contra las publicaciones aprobadas y activas parecidas: misma categoría y, en vehículos, misma marca y modelo.
-- Fuera de rango = hay al menos 3 parecidas y el precio es menor que la mitad del percentil 10 o mayor que el doble del 90.

create or replace function public.ai_hub_price_context(p_item_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_item public.hub_market_items;
  v_n    integer;
  v_med  numeric;
  v_p10  numeric;
  v_p90  numeric;
begin
  select * into v_item from public.hub_market_items where id = p_item_id;
  if not found then
    return null;
  end if;

  select count(*), percentile_cont(0.5) within group (order by i.price), percentile_cont(0.1) within group (order by i.price), percentile_cont(0.9) within group (order by i.price)
    into v_n, v_med, v_p10, v_p90
    from public.hub_market_items i
   where i.id <> v_item.id and i.is_active and i.status = 'aprobado' and not i.is_test
     and i.category = v_item.category
     and (v_item.category <> 'vehiculos' or (lower(coalesce(i.spec_brand, '')) = lower(coalesce(v_item.spec_brand, '')) and lower(coalesce(i.spec_model, '')) = lower(coalesce(v_item.spec_model, ''))));

  return jsonb_build_object(
    'price', v_item.price,
    'similar_count', v_n,
    'median', round(v_med, 2),
    'p10', round(v_p10, 2),
    'p90', round(v_p90, 2),
    'outlier', v_n >= 3 and (v_item.price < v_p10 * 0.5 or v_item.price > v_p90 * 2),
    'direction', case when v_n >= 3 and v_item.price < v_p10 * 0.5 then 'muy_bajo' when v_n >= 3 and v_item.price > v_p90 * 2 then 'muy_alto' else null end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Restaurar y ver lo oculto (moderador o admin)
-- -----------------------------------------------------------------------------

create or replace function public.restore_hidden_content(p_target_type text, p_target_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator_or_admin() then
    raise exception 'Solo un moderador o un administrador puede restaurar contenido.' using errcode = '42501';
  end if;

  if p_target_type = 'social_post' then
    update public.social_posts set hidden_by_ai = false, hidden_at = null where id = p_target_id;
  elsif p_target_type = 'social_comment' then
    update public.social_post_comments set hidden_by_ai = false, hidden_at = null where id = p_target_id;
  elsif p_target_type = 'review' then
    update public.reviews set hidden_by_ai = false, hidden_at = null where id = p_target_id;
  else
    raise exception 'Ese tipo de contenido no se oculta.' using errcode = '22023';
  end if;

  -- Queda anotado quién lo restauró: la IA no lo vuelve a ocultar.
  update public.ai_moderation
     set auto_action = 'ninguna', restored_by = auth.uid(), restored_at = now()
   where target_type = p_target_type and target_id = p_target_id;
end;
$$;

create or replace function public.ai_hidden_content()
returns table (target_type text, target_id bigint, preview text, categories text[], reasons text, confidence numeric, hidden_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_moderator_or_admin() then
    raise exception 'Solo un moderador o un administrador puede ver esto.' using errcode = '42501';
  end if;

  return query
    select x.t, x.id, left(x.body, 200), coalesce(m.categories, '{}'), coalesce(m.reasons, ''), m.confidence, x.hidden_at
      from (
        select 'social_post'::text as t, p.id, p.text as body, p.hidden_at from public.social_posts p where p.hidden_by_ai
        union all
        select 'social_comment', c.id, c.text, c.hidden_at from public.social_post_comments c where c.hidden_by_ai
        union all
        select 'review', r.id, r.comment, r.hidden_at from public.reviews r where r.hidden_by_ai
      ) x
      left join public.ai_moderation m on m.target_type = x.t and m.target_id = x.id
     order by x.hidden_at desc nulls last
     limit 100;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. El disparo
-- -----------------------------------------------------------------------------

create or replace function public.request_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_anon   text;
begin
  begin
    select max(decrypted_secret) filter (where name = 'ai_functions_url'),
           max(decrypted_secret) filter (where name = 'ai_cron_secret'),
           max(decrypted_secret) filter (where name = 'send_push_anon_key')
      into v_url, v_secret, v_anon
      from vault.decrypted_secrets
     where name in ('ai_functions_url', 'ai_cron_secret', 'send_push_anon_key');

    if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' or coalesce(v_anon, '') = '' then
      return null;
    end if;

    perform net.http_post(
      url     := rtrim(v_url, '/') || '/ai-moderate',
      body    := jsonb_build_object('target_type', tg_argv[0], 'target_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-ai-secret', v_secret)
    );
  exception when others then
    raise warning 'request_moderation: %', sqlerrm;
  end;
  return null;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'ai_save_moderation(text, bigint, text, text[], text, text, numeric, jsonb, text, numeric)',
    'ai_hub_price_context(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('revoke execute on function public.%s from authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

revoke all on function public.request_moderation() from public, anon, authenticated;

revoke all on function public.restore_hidden_content(text, bigint) from public;
revoke execute on function public.restore_hidden_content(text, bigint) from anon;
grant execute on function public.restore_hidden_content(text, bigint) to authenticated;
revoke all on function public.ai_hidden_content() from public;
revoke execute on function public.ai_hidden_content() from anon;
grant execute on function public.ai_hidden_content() to authenticated;

drop trigger if exists social_posts_request_moderation on public.social_posts;
create trigger social_posts_request_moderation after insert on public.social_posts
  for each row execute function public.request_moderation('social_post');

drop trigger if exists social_comments_request_moderation on public.social_post_comments;
create trigger social_comments_request_moderation after insert on public.social_post_comments
  for each row execute function public.request_moderation('social_comment');

drop trigger if exists reviews_request_moderation on public.reviews;
create trigger reviews_request_moderation after insert on public.reviews
  for each row execute function public.request_moderation('review');

drop trigger if exists hub_market_request_moderation on public.hub_market_items;
create trigger hub_market_request_moderation after insert on public.hub_market_items
  for each row when (new.status = 'pendiente' and not new.is_test)
  execute function public.request_moderation('hub_market_item');

drop trigger if exists hub_market_request_moderation_status on public.hub_market_items;
create trigger hub_market_request_moderation_status after update of status on public.hub_market_items
  for each row when (new.status = 'pendiente' and old.status is distinct from new.status and not new.is_test)
  execute function public.request_moderation('hub_market_item');
