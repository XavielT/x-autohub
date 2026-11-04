-- =============================================================================
-- X AutoHub — Base común de la IA: registro de uso, tope mensual, límite por IP, caché
-- =============================================================================
--
-- La IA de X AutoHub vive en Edge Functions (Anthropic y Google se llaman SOLO desde ahí; ninguna
-- clave llega al navegador). Esta migración pone lo que todas comparten:
--
--   · `ai_usage`        un renglón por llamada (función, modelo, tokens, costo, si salió bien).
--   · `ai_rate_limits`  contadores por ventana para los endpoints abiertos a visitantes.
--   · `ai_query_cache`  respuestas ya pagadas (clave = hash normalizado de la entrada).
--   · ajustes en `site_settings`: interruptor general, tope mensual y un interruptor por función.
--   · `ai_budget_status()`  → gasto del mes, tope, porcentaje y tier.
--   · `ai_rate_check()`     → "¿esta IP todavía puede?" de forma atómica.
--
-- QUIÉN VE QUÉ
-- ------------
-- Las tres tablas tienen RLS activada y NINGUNA política de escritura. `anon` y `authenticated` no tienen
-- grants (se revocan, porque los default privileges de Supabase los dan por defecto). Solo `service_role`
-- (las edge functions) escribe. `ai_usage` la lee un admin (política `is_admin()`); lo demás, nadie desde el
-- navegador. El panel lee un resumen con `ai_admin_overview()`, que comprueba `is_admin()` por dentro.
--
-- TIERS DEL TOPE (`ai_budget_status().tier`)
-- ------------------------------------------
--   ok           < 80 % del tope
--   aviso        >= 80 %
--   sin_publico  >= 90 %: se apagan las funciones abiertas a visitantes
--   apagado      >= 100 %: todo apagado
-- Además, lo público (features `search`, `address`, `quote_triage`) no puede gastar más del 30 % del tope
-- aunque no se haya llegado al 90 %: `public_ok` sale en falso.
-- Maps tiene su propio tope (`maps_monthly_cap_usd`) y cuenta las features `maps_*`.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table if not exists public.ai_usage (
  id            bigint generated always as identity primary key,
  feature       text        not null,
  model         text        not null default '',
  input_tokens  integer     not null default 0 check (input_tokens >= 0),
  output_tokens integer     not null default 0 check (output_tokens >= 0),
  images        integer     not null default 0 check (images >= 0),
  cost_usd      numeric(10, 6) not null default 0 check (cost_usd >= 0),
  ok            boolean     not null default true,
  error_code    text,
  user_id       uuid references auth.users(id) on delete set null,
  -- Hash de la IP (nunca la IP). Lo calcula la edge.
  ip_hash       text,
  created_at    timestamptz not null default now()
);

comment on table public.ai_usage is
  'Una fila por llamada a Anthropic o Google. La escribe solo la edge (service_role). La lee un admin.';

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_feature_created_idx on public.ai_usage (feature, created_at desc);

create table if not exists public.ai_rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer     not null default 0
);

comment on table public.ai_rate_limits is
  'Contador por ventana para endpoints anonimos. Se toca solo con ai_rate_check().';

create table if not exists public.ai_query_cache (
  key        text primary key,
  value      jsonb       not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.ai_query_cache is
  'Respuestas de IA ya pagadas. Clave = hash normalizado de la entrada. Escribe solo la edge.';

create index if not exists ai_query_cache_expires_idx on public.ai_query_cache (expires_at);

alter table public.ai_usage enable row level security;
alter table public.ai_rate_limits enable row level security;
alter table public.ai_query_cache enable row level security;

-- Los default privileges de Supabase le dan todo a anon y authenticated: se quita.
revoke all on public.ai_usage from anon, authenticated;
revoke all on public.ai_rate_limits from anon, authenticated;
revoke all on public.ai_query_cache from anon, authenticated;

drop policy if exists "un admin lee el uso de IA" on public.ai_usage;
create policy "un admin lee el uso de IA"
  on public.ai_usage for select
  to authenticated
  using (public.is_admin());
grant select on public.ai_usage to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Ajustes (interruptores y topes). `set_site_setting()` solo cambia claves que ya existen.
-- -----------------------------------------------------------------------------

insert into public.site_settings (key, value) values
  ('ai_enabled',                 'true'),
  ('ai_monthly_cap_usd',         '25'),
  ('maps_monthly_cap_usd',       '10'),
  ('ai_auto_hide',               'true'),
  ('ai_feature_catalog_ingest',  'true'),
  ('ai_feature_proof_check',     'true'),
  ('ai_feature_moderation',      'true'),
  ('ai_feature_digest',          'true'),
  ('ai_feature_search',          'true'),
  ('ai_feature_quote_triage',    'true'),
  ('ai_feature_maintenance',     'true'),
  ('ai_feature_review_summary',  'true'),
  ('ai_feature_seo',             'true'),
  ('ai_feature_reply_draft',     'true'),
  ('ai_feature_address',         'true')
on conflict (key) do nothing;

-- Un typo en un interruptor se paga aqui y no en la edge: booleanos para los interruptores, numeros para los topes.
alter table public.site_settings drop constraint if exists site_settings_ai_valid;
alter table public.site_settings
  add constraint site_settings_ai_valid check (
    (key not in ('ai_enabled', 'ai_auto_hide') and key not like 'ai\_feature\_%')
    or jsonb_typeof(value) = 'boolean'
  ) not valid;
alter table public.site_settings validate constraint site_settings_ai_valid;

alter table public.site_settings drop constraint if exists site_settings_ai_caps_valid;
alter table public.site_settings
  add constraint site_settings_ai_caps_valid check (
    key not in ('ai_monthly_cap_usd', 'maps_monthly_cap_usd')
    or (jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric >= 0)
  ) not valid;
alter table public.site_settings validate constraint site_settings_ai_caps_valid;

-- -----------------------------------------------------------------------------
-- 3. Helpers internos (solo service_role)
-- -----------------------------------------------------------------------------

-- Inicio del mes en la hora de RD (el tope es mensual para quien paga, que esta en RD).
create or replace function public.ai_month_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (date_trunc('month', now() at time zone 'America/Santo_Domingo')) at time zone 'America/Santo_Domingo';
$$;

create or replace function public.ai_setting_number(p_key text, p_default numeric)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric end
       from public.site_settings s where s.key = p_key),
    p_default
  );
$$;

create or replace function public.ai_setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'boolean' then (s.value #>> '{}')::boolean end
       from public.site_settings s where s.key = p_key),
    p_default
  );
$$;

-- -----------------------------------------------------------------------------
-- 4. ai_budget_status() — lo que la edge pregunta antes de cada llamada
-- -----------------------------------------------------------------------------
-- `kind`: 'ai' (Anthropic, todo lo que no sea maps_*) o 'maps' (features maps_*).

create or replace function public.ai_budget_status(p_kind text default 'ai')
returns table (spent_usd numeric, cap_usd numeric, pct numeric, tier text, public_spent_usd numeric, public_ok boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_spent  numeric;
  v_public numeric;
  v_cap    numeric;
  v_pct    numeric;
  v_tier   text;
begin
  if p_kind = 'maps' then
    v_cap := public.ai_setting_number('maps_monthly_cap_usd', 10);
    select coalesce(sum(u.cost_usd), 0) into v_spent
      from public.ai_usage u where u.created_at >= public.ai_month_start() and u.feature like 'maps\_%';
    -- Maps tiene su propio tope y todo su gasto es de visitantes: el límite del 30 % es de la IA, no de Google.
    v_public := 0;
  else
    v_cap := public.ai_setting_number('ai_monthly_cap_usd', 25);
    select coalesce(sum(u.cost_usd), 0) into v_spent
      from public.ai_usage u where u.created_at >= public.ai_month_start() and u.feature not like 'maps\_%';
    select coalesce(sum(u.cost_usd), 0) into v_public
      from public.ai_usage u
     where u.created_at >= public.ai_month_start() and u.feature in ('search', 'address', 'quote_triage');
  end if;

  v_pct := case when v_cap > 0 then round(v_spent / v_cap * 100, 2) else 100 end;
  v_tier := case
    when v_pct >= 100 then 'apagado'
    when v_pct >= 90  then 'sin_publico'
    when v_pct >= 80  then 'aviso'
    else 'ok'
  end;

  return query select
    v_spent, v_cap, v_pct, v_tier, v_public,
    -- Lo publico no gasta mas del 30 % del tope, aunque no se haya llegado al 90 %.
    (v_tier in ('ok', 'aviso') and v_public < v_cap * 0.30);
end;
$$;

comment on function public.ai_budget_status(text) is
  'Gasto del mes, tope, porcentaje y tier (ok/aviso/sin_publico/apagado). Solo service_role.';

-- -----------------------------------------------------------------------------
-- 5. ai_rate_check() — límite por ventana, atómico
-- -----------------------------------------------------------------------------
-- Devuelve true si todavia cabe (y cuenta la llamada), false si ya se paso. Una sola sentencia:
-- dos peticiones a la vez no se cuelan.

create or replace function public.ai_rate_check(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  if p_window_seconds < 1 or p_max < 1 or coalesce(p_key, '') = '' then
    raise exception 'Límite mal configurado.' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.ai_rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key) do update
    set count = case when r.window_start = excluded.window_start then r.count + 1 else 1 end,
        window_start = excluded.window_start
  returning r.count into v_count;

  return v_count <= p_max;
end;
$$;

comment on function public.ai_rate_check(text, integer, integer) is
  'Cuenta una llamada en la ventana y dice si todavia cabe. Solo service_role.';

-- -----------------------------------------------------------------------------
-- 6. Resumen para /admin/ajustes (solo admin)
-- -----------------------------------------------------------------------------

create or replace function public.ai_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ai   record;
  v_maps record;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver el uso de la IA.' using errcode = '42501';
  end if;

  select * into v_ai from public.ai_budget_status('ai');
  select * into v_maps from public.ai_budget_status('maps');

  return jsonb_build_object(
    'budget', jsonb_build_object(
      'spent_usd', v_ai.spent_usd, 'cap_usd', v_ai.cap_usd, 'pct', v_ai.pct, 'tier', v_ai.tier,
      'public_spent_usd', v_ai.public_spent_usd, 'public_ok', v_ai.public_ok
    ),
    'maps', jsonb_build_object(
      'spent_usd', v_maps.spent_usd, 'cap_usd', v_maps.cap_usd, 'pct', v_maps.pct, 'tier', v_maps.tier
    ),
    'by_feature', coalesce((
      select jsonb_agg(jsonb_build_object('feature', t.feature, 'calls', t.calls, 'errors', t.errors, 'cost_usd', t.cost) order by t.cost desc)
        from (
          select u.feature, count(*) as calls, count(*) filter (where not u.ok) as errors, sum(u.cost_usd) as cost
            from public.ai_usage u where u.created_at >= public.ai_month_start() group by u.feature
        ) t
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', t.day, 'calls', t.calls, 'cost_usd', t.cost) order by t.day desc)
        from (
          select (u.created_at at time zone 'America/Santo_Domingo')::date as day, count(*) as calls, sum(u.cost_usd) as cost
            from public.ai_usage u where u.created_at >= now() - interval '30 days' group by 1
        ) t
    ), '[]'::jsonb),
    'errors', coalesce((
      select jsonb_agg(jsonb_build_object('feature', e.feature, 'error_code', e.error_code, 'created_at', e.created_at))
        from (
          select u.feature, u.error_code, u.created_at from public.ai_usage u
           where not u.ok order by u.created_at desc limit 10
        ) e
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.ai_admin_overview() is
  'Presupuesto, gasto por funcion y por dia, y ultimos errores. Solo admin.';

-- -----------------------------------------------------------------------------
-- 7. Permisos (las tres líneas del idiom, y solo service_role para lo interno)
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'ai_month_start()', 'ai_setting_number(text, numeric)', 'ai_setting_bool(text, boolean)',
    'ai_budget_status(text)', 'ai_rate_check(text, integer, integer)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('revoke execute on function public.%s from authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

revoke all on function public.ai_admin_overview() from public;
revoke execute on function public.ai_admin_overview() from anon;
grant execute on function public.ai_admin_overview() to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Mantenimiento: el límite y la caché no crecen para siempre
-- -----------------------------------------------------------------------------

create or replace function public.ai_housekeeping()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_rate_limits where window_start < now() - interval '2 days';
  delete from public.ai_query_cache where expires_at < now();
  -- El detalle por llamada se guarda un año; el mes en curso es lo que manda el tope.
  delete from public.ai_usage where created_at < now() - interval '1 year';
$$;

revoke all on function public.ai_housekeeping() from public;
revoke execute on function public.ai_housekeeping() from anon;
revoke execute on function public.ai_housekeeping() from authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('ai-housekeeping', '20 8 * * *', 'select public.ai_housekeeping()');
  end if;
end $$;
