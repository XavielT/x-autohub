-- =============================================================================
-- X AutoHub — Resumen de reseñas verificadas y SEO de fichas asistido por IA
-- =============================================================================
--
-- DOS COSAS, las dos con la regla "la IA no pisa lo que escribió una persona":
--
--   1. `ai_review_summaries`: un resumen (con pros y contras) por producto o servicio, SOLO con reseñas VERIFICADAS (compra o cita real) que no estén ocultas por la
--      moderación (0053). Se genera de noche (3:00 a. m. de RD) y solo cuando hay ≥ 3 verificadas y suman ≥ 3 nuevas desde el último resumen, con un límite diario de objetivos.
--      La pantalla lo rotula "Resumen generado con IA a partir de N reseñas verificadas". Es público de lectura (sale en la ficha).
--      Al guardar uno se avisa al sitio como mucho una vez al día (`ai_mark_site_dirty_daily()`): sin tormentas de rebuild.
--
--   2. SEO de fichas: `seo_title` (≤ 60), `seo_description` (≤ 155), `seo_source` ('ia' | 'humano'), texto alterno por foto (`image_alts`, paralela a `images`) y hasta 3
--      preguntas frecuentes (`seo_faq`) en `hub_parts`; `seo_title`/`seo_description`/`seo_source` también en `services`. La IA solo escribe en campos VACÍOS
--      (`ai_apply_product_seo()` / `ai_apply_service_seo()`, solo service_role), y cualquier cambio hecho desde el navegador pasa `seo_source` a 'humano'.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Resúmenes de reseñas
-- -----------------------------------------------------------------------------

create table if not exists public.ai_review_summaries (
  id              bigint generated always as identity primary key,
  target_type     text        not null check (target_type in ('product', 'service')),
  target_id       bigint      not null,
  summary         text        not null check (char_length(summary) between 10 and 500),
  pros            text[]      not null default '{}' check (cardinality(pros) <= 4),
  cons            text[]      not null default '{}' check (cardinality(cons) <= 4),
  -- Cuántas reseñas verificadas había cuando se escribió (el resumen se rehace al sumar 3 más).
  review_count_at integer     not null check (review_count_at >= 3),
  generated_at    timestamptz not null default now(),
  constraint ai_review_summaries_one_per_target unique (target_type, target_id)
);

comment on table public.ai_review_summaries is
  'Resumen de las reseñas VERIFICADAS de un producto o servicio. Lo escribe la edge (service_role) con ai_save_review_summary(); es de lectura pública.';

alter table public.ai_review_summaries enable row level security;
revoke all on public.ai_review_summaries from anon, authenticated;
grant select on public.ai_review_summaries to anon, authenticated;

drop policy if exists "los resumenes de resenas los lee cualquiera" on public.ai_review_summaries;
create policy "los resumenes de resenas los lee cualquiera"
  on public.ai_review_summaries for select using (true);

-- Los objetivos que toca resumir hoy: >= 3 reseñas verificadas y visibles, y (sin resumen, o >= 3 nuevas desde el último). Con tope por corrida.
create or replace function public.ai_review_targets_due(p_limit integer default 20)
returns table (target_type text, target_id bigint, verified_count integer)
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select r.target_type::text as target_type, r.target_id, count(*)::integer as verified
      from public.reviews r
     where r.is_verified_purchase and not r.hidden_by_ai
     group by r.target_type, r.target_id
    having count(*) >= 3
  )
  select c.target_type, c.target_id, c.verified
    from counts c
    left join public.ai_review_summaries s on s.target_type = c.target_type and s.target_id = c.target_id
   where s.id is null or c.verified >= s.review_count_at + 3
   order by (s.id is null) desc, c.verified desc
   limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Las reseñas que alimentan un resumen (solo verificadas y visibles; las más nuevas primero).
create or replace function public.ai_reviews_for_summary(p_target_type text, p_target_id bigint)
returns table (rating smallint, comment text)
language sql
stable
security definer
set search_path = public
as $$
  select r.rating, r.comment
    from public.reviews r
   where r.target_type::text = p_target_type and r.target_id = p_target_id and r.is_verified_purchase and not r.hidden_by_ai
   order by r.created_at desc
   limit 40;
$$;

create or replace function public.ai_save_review_summary(p_type text, p_id bigint, p_summary text, p_pros text[], p_cons text[], p_count integer)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_review_summaries (target_type, target_id, summary, pros, cons, review_count_at)
  values (p_type, p_id, p_summary, coalesce(p_pros, '{}'), coalesce(p_cons, '{}'), p_count)
  on conflict (target_type, target_id) do update
    set summary = excluded.summary, pros = excluded.pros, cons = excluded.cons, review_count_at = excluded.review_count_at, generated_at = now();
$$;

-- Avisar al sitio que cambió algo prerenderizado, como MUCHO una vez al día. Usa la caché de IA como candado de 20 horas.
create or replace function public.ai_mark_site_dirty_daily()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.ai_query_cache c where c.key = 'dirty:review_summary' and c.expires_at > now()) then
    return false;
  end if;

  insert into public.ai_query_cache (key, value, expires_at)
  values ('dirty:review_summary', 'true'::jsonb, now() + interval '20 hours')
  on conflict (key) do update set expires_at = excluded.expires_at;

  update public.site_rebuild
     set dirty_since = coalesce(dirty_since, now()), last_change_at = now()
   where id;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. SEO de fichas
-- -----------------------------------------------------------------------------

alter table public.hub_parts add column if not exists seo_title text;
alter table public.hub_parts add column if not exists seo_description text;
alter table public.hub_parts add column if not exists seo_source text;
-- Texto alterno por foto: paralelo a `images` (la posición i describe la foto i). Vacío = sin texto alterno propio.
alter table public.hub_parts add column if not exists image_alts text[] not null default '{}';
-- Hasta 3 preguntas frecuentes: [{ "q": "...", "a": "..." }].
alter table public.hub_parts add column if not exists seo_faq jsonb not null default '[]'::jsonb;

alter table public.services add column if not exists seo_title text;
alter table public.services add column if not exists seo_description text;
alter table public.services add column if not exists seo_source text;

do $$
declare
  t text;
begin
  foreach t in array array['hub_parts', 'services'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_seo_check');
    execute format(
      'alter table public.%I add constraint %I check ((seo_title is null or char_length(seo_title) <= 60) and (seo_description is null or char_length(seo_description) <= 155) and (seo_source is null or seo_source in (''ia'', ''humano'')))',
      t, t || '_seo_check');
  end loop;
end $$;

alter table public.hub_parts drop constraint if exists hub_parts_seo_extras_check;
alter table public.hub_parts
  add constraint hub_parts_seo_extras_check check (
    cardinality(image_alts) <= 8 and jsonb_typeof(seo_faq) = 'array' and jsonb_array_length(seo_faq) <= 3
  );

-- Un cambio hecho desde el navegador pasa la fuente a 'humano'. La IA avisa con un ajuste de transacción (`app.ai_seo_write`) que solo pone
-- `ai_apply_*_seo()` (security definer, solo service_role): un usuario con sesión no puede ponerlo desde PostgREST.
create or replace function public.seo_source_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.ai_seo_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.seo_title, '') <> '' or coalesce(new.seo_description, '') <> '' then
      new.seo_source := 'humano';
    end if;
  elsif new.seo_title is distinct from old.seo_title or new.seo_description is distinct from old.seo_description then
    new.seo_source := case when coalesce(new.seo_title, '') = '' and coalesce(new.seo_description, '') = '' then null else 'humano' end;
  end if;

  return new;
end;
$$;

-- Las piezas, además, tienen texto alterno por foto y preguntas frecuentes. Va en su propia función: plpgsql no deja nombrar un campo que la tabla del
-- trigger no tiene (`services` no trae `image_alts`), ni siquiera detrás de un `tg_table_name = 'hub_parts' and …`.
create or replace function public.hub_parts_seo_source_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.ai_seo_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.seo_title is distinct from old.seo_title or new.seo_description is distinct from old.seo_description then
      new.seo_source := case when coalesce(new.seo_title, '') = '' and coalesce(new.seo_description, '') = '' then null else 'humano' end;
    end if;
    if new.image_alts is distinct from old.image_alts or new.seo_faq is distinct from old.seo_faq then
      new.seo_source := 'humano';
    end if;
  elsif coalesce(new.seo_title, '') <> '' or coalesce(new.seo_description, '') <> '' or cardinality(new.image_alts) > 0 or jsonb_array_length(new.seo_faq) > 0 then
    new.seo_source := 'humano';
  end if;
  return new;
end;
$$;

drop trigger if exists hub_parts_seo_source_trg on public.hub_parts;
create trigger hub_parts_seo_source_trg
  before insert or update of seo_title, seo_description, image_alts, seo_faq on public.hub_parts
  for each row execute function public.hub_parts_seo_source_guard();

drop trigger if exists services_seo_source_trg on public.services;
create trigger services_seo_source_trg
  before insert or update of seo_title, seo_description on public.services
  for each row execute function public.seo_source_guard();

-- La IA aplica SOLO sobre campos vacíos. Devuelve cuáles escribió.
create or replace function public.ai_apply_product_seo(p_id bigint, p_title text, p_description text, p_alts text[], p_faq jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.hub_parts;
  v_title  boolean;
  v_desc   boolean;
  v_alts   boolean;
  v_faq    boolean;
  v_images integer;
begin
  select * into r from public.hub_parts where id = p_id;
  if not found then
    raise exception 'Ese producto no existe.' using errcode = '22023';
  end if;

  v_images := coalesce(cardinality(r.images), 0);
  v_title := coalesce(r.seo_title, '') = '' and coalesce(p_title, '') <> '';
  v_desc  := coalesce(r.seo_description, '') = '' and coalesce(p_description, '') <> '';
  v_alts  := cardinality(r.image_alts) = 0 and v_images > 0 and coalesce(cardinality(p_alts), 0) > 0;
  v_faq   := jsonb_array_length(r.seo_faq) = 0 and jsonb_typeof(p_faq) = 'array' and jsonb_array_length(p_faq) > 0;

  if v_title or v_desc or v_alts or v_faq then
    perform set_config('app.ai_seo_write', 'on', true);
    update public.hub_parts
       set seo_title       = case when v_title then left(p_title, 60) else seo_title end,
           seo_description = case when v_desc then left(p_description, 155) else seo_description end,
           image_alts      = case when v_alts then p_alts[1:least(v_images, 8)] else image_alts end,
           seo_faq         = case when v_faq then p_faq else seo_faq end,
           -- Si una persona ya escribió algo, la fuente se queda en 'humano'.
           seo_source      = coalesce(seo_source, 'ia')
     where id = p_id;
    perform set_config('app.ai_seo_write', 'off', true);
  end if;

  return jsonb_build_object('seo_title', v_title, 'seo_description', v_desc, 'image_alts', v_alts, 'seo_faq', v_faq);
end;
$$;

create or replace function public.ai_apply_service_seo(p_id bigint, p_title text, p_description text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r       public.services;
  v_title boolean;
  v_desc  boolean;
begin
  select * into r from public.services where id = p_id;
  if not found then
    raise exception 'Ese servicio no existe.' using errcode = '22023';
  end if;

  v_title := coalesce(r.seo_title, '') = '' and coalesce(p_title, '') <> '';
  v_desc  := coalesce(r.seo_description, '') = '' and coalesce(p_description, '') <> '';

  if v_title or v_desc then
    perform set_config('app.ai_seo_write', 'on', true);
    update public.services
       set seo_title       = case when v_title then left(p_title, 60) else seo_title end,
           seo_description = case when v_desc then left(p_description, 155) else seo_description end,
           seo_source      = coalesce(seo_source, 'ia')
     where id = p_id;
    perform set_config('app.ai_seo_write', 'off', true);
  end if;

  return jsonb_build_object('seo_title', v_title, 'seo_description', v_desc);
end;
$$;

-- -----------------------------------------------------------------------------
-- El reloj: 3:00 a. m. de RD = 07:00 UTC
-- -----------------------------------------------------------------------------

create or replace function public.request_review_summaries()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_anon   text;
begin
  select max(decrypted_secret) filter (where name = 'ai_functions_url'),
         max(decrypted_secret) filter (where name = 'ai_cron_secret'),
         max(decrypted_secret) filter (where name = 'send_push_anon_key')
    into v_url, v_secret, v_anon
    from vault.decrypted_secrets
   where name in ('ai_functions_url', 'ai_cron_secret', 'send_push_anon_key');

  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' or coalesce(v_anon, '') = '' then
    return;
  end if;
  if not exists (select 1 from public.ai_review_targets_due(1)) then
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/ai-review-summary',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-ai-secret', v_secret)
  );
exception when others then
  raise warning 'request_review_summaries: %', sqlerrm;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'ai_review_targets_due(integer)', 'ai_reviews_for_summary(text, bigint)', 'ai_save_review_summary(text, bigint, text, text[], text[], integer)',
    'ai_mark_site_dirty_daily()', 'ai_apply_product_seo(bigint, text, text, text[], jsonb)', 'ai_apply_service_seo(bigint, text, text)', 'request_review_summaries()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('revoke execute on function public.%s from authenticated', f);
    if f <> 'request_review_summaries()' then
      execute format('grant execute on function public.%s to service_role', f);
    end if;
  end loop;
end $$;

revoke all on function public.seo_source_guard() from public, anon, authenticated;
revoke all on function public.hub_parts_seo_source_guard() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('review-summaries', '0 7 * * *', 'select public.request_review_summaries()');
  end if;
end $$;
