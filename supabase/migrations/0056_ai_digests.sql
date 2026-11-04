-- =============================================================================
-- X AutoHub — "Hoy en el negocio": el resumen diario
-- =============================================================================
--
-- Cada mañana (7:30 a. m. de RD) la base le pide a la edge `ai-daily-digest` el resumen del día. Los NÚMEROS son deterministas y salen de aquí
-- (`business_metrics_compute()`); la IA solo REDACTA 5 a 8 líneas y ordena "lo primero que haría hoy" (máximo 3, con enlace a la ruta de /admin). Si la IA falla o
-- el tope está alcanzado, sale una plantilla sin IA con los mismos números. Los lunes se agrega la comparación contra la semana anterior.
--
--   · `business_daily_metrics()`: lo que ve el panel (solo admin). `business_metrics_compute()`: lo mismo para la edge (solo service_role).
--   · `ai_digests`: el historial (fecha, cuerpo en Markdown, métricas, si lo escribió la IA). Solo lo lee un admin; lo escribe la edge con `ai_save_digest()`.
--   · Ajuste `low_stock_threshold` (3 por defecto): "stock bajo" = esa cantidad o menos.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

insert into public.site_settings (key, value) values ('low_stock_threshold', '3') on conflict (key) do nothing;

alter table public.site_settings drop constraint if exists site_settings_low_stock_valid;
alter table public.site_settings
  add constraint site_settings_low_stock_valid check (
    key <> 'low_stock_threshold' or (jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric between 0 and 1000)
  ) not valid;
alter table public.site_settings validate constraint site_settings_low_stock_valid;

create table if not exists public.ai_digests (
  id           bigint generated always as identity primary key,
  digest_date  date        not null,
  kind         text        not null default 'diario' check (kind in ('diario', 'lunes')),
  body_md      text        not null,
  metrics      jsonb       not null default '{}'::jsonb,
  ai_generated boolean     not null default false,
  created_at   timestamptz not null default now(),
  constraint ai_digests_one_per_day unique (digest_date)
);

comment on table public.ai_digests is 'El resumen diario del negocio. Lo escribe la edge ai-daily-digest (service_role); lo lee un admin.';

alter table public.ai_digests enable row level security;
revoke all on public.ai_digests from anon, authenticated;
grant select on public.ai_digests to authenticated;

drop policy if exists "un admin lee los resumenes" on public.ai_digests;
create policy "un admin lee los resumenes"
  on public.ai_digests for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Las métricas (deterministas)
-- -----------------------------------------------------------------------------

create or replace function public.business_metrics_compute()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'America/Santo_Domingo')::date;
  v_day0     timestamptz := (v_today::timestamp) at time zone 'America/Santo_Domingo';
  v_threshold integer := coalesce(public.ai_setting_number('low_stock_threshold', 3), 3)::integer;
  v_budget   record;
begin
  select * into v_budget from public.ai_budget_status('ai');

  return jsonb_build_object(
    'date', v_today,
    'orders_new_24h', (select count(*) from public.orders o where o.created_at > now() - interval '24 hours'),
    'awaiting_payment_with_proof', (select count(*) from public.orders o where o.status = 'awaiting_payment' and o.payment_proof_url is not null),
    'awaiting_payment_no_proof_24h', (select count(*) from public.orders o where o.status = 'awaiting_payment' and o.payment_proof_url is null and o.created_at < now() - interval '24 hours'),
    -- Vendido hoy: solo lo pagado (con la hora en que se confirmó el pago) y no cancelado.
    'sold_today_rd', coalesce((select sum(o.total) from public.orders o where o.payment_confirmed_at >= v_day0 and o.payment_confirmed_at < v_day0 + interval '1 day' and o.status <> 'cancelled'), 0),
    'low_stock_threshold', v_threshold,
    'low_stock', (select count(*) from public.hub_parts p where p.is_active and not p.is_test and p.fulfillment = 'stock' and p.stock > 0 and p.stock <= v_threshold),
    'out_of_stock', (select count(*) from public.hub_parts p where p.is_active and not p.is_test and p.fulfillment = 'stock' and p.stock = 0),
    -- Agotados que la gente sí busca: demanda que hoy no se puede atender.
    'out_of_stock_searched', coalesce((
      select jsonb_agg(jsonb_build_object('name', t.name, 'searches', t.n) order by t.n desc)
        from (
          select p.name, count(*) as n
            from public.hub_parts p
            join public.search_log s on s.created_at > now() - interval '7 days' and char_length(s.query_norm) >= 4
                                    and lower(public.xah_unaccent(p.name)) like '%' || s.query_norm || '%'
           where p.is_active and not p.is_test and p.fulfillment = 'stock' and p.stock = 0
           group by p.name order by count(*) desc limit 5
        ) t
    ), '[]'::jsonb),
    'appointments_today', (select count(*) from public.service_appointments a where a.status not in ('cancelled', 'no_show') and (a.scheduled_at at time zone 'America/Santo_Domingo')::date = v_today),
    'appointments_tomorrow', (select count(*) from public.service_appointments a where a.status not in ('cancelled', 'no_show') and (a.scheduled_at at time zone 'America/Santo_Domingo')::date = v_today + 1),
    'appointments_unconfirmed', (select count(*) from public.service_appointments a where a.status = 'requested' and a.scheduled_at >= now()),
    'quotes_unanswered_24h', (select count(*) from public.service_quote_requests q where q.status = 'nueva' and q.created_at < now() - interval '24 hours'),
    'quotes_new', (select count(*) from public.service_quote_requests q where q.status = 'nueva'),
    'moderation_pending', (select count(*) from public.hub_market_items i where i.status = 'pendiente' and not i.is_test),
    'hidden_by_ai', (select (select count(*) from public.social_posts where hidden_by_ai) + (select count(*) from public.social_post_comments where hidden_by_ai) + (select count(*) from public.reviews where hidden_by_ai)),
    'publications_expiring_7d', (select count(*) from public.hub_market_items i where i.status = 'aprobado' and i.is_active and i.sold_at is null and i.expires_at between now() and now() + interval '7 days'),
    'reviews_new_24h', (select count(*) from public.reviews r where r.created_at > now() - interval '24 hours' and not r.hidden_by_ai),
    'search_gaps', coalesce((select jsonb_agg(jsonb_build_object('query', g.query_norm, 'searches', g.searches)) from public.ai_search_gaps(7, 10) g), '[]'::jsonb),
    'ai_spend', jsonb_build_object('spent_usd', v_budget.spent_usd, 'cap_usd', v_budget.cap_usd, 'pct', v_budget.pct),
    -- Para el comparativo de los lunes: la misma semana, la anterior.
    'week', jsonb_build_object(
      'orders_7d', (select count(*) from public.orders o where o.created_at > now() - interval '7 days'),
      'orders_prev_7d', (select count(*) from public.orders o where o.created_at between now() - interval '14 days' and now() - interval '7 days'),
      'sold_7d', coalesce((select sum(o.total) from public.orders o where o.payment_confirmed_at > now() - interval '7 days' and o.status <> 'cancelled'), 0),
      'sold_prev_7d', coalesce((select sum(o.total) from public.orders o where o.payment_confirmed_at between now() - interval '14 days' and now() - interval '7 days' and o.status <> 'cancelled'), 0),
      'appointments_7d', (select count(*) from public.service_appointments a where a.created_at > now() - interval '7 days'),
      'appointments_prev_7d', (select count(*) from public.service_appointments a where a.created_at between now() - interval '14 days' and now() - interval '7 days'),
      'quotes_7d', (select count(*) from public.service_quote_requests q where q.created_at > now() - interval '7 days'),
      'quotes_prev_7d', (select count(*) from public.service_quote_requests q where q.created_at between now() - interval '14 days' and now() - interval '7 days')
    )
  );
end;
$$;

-- Lo que ve el panel: lo mismo, solo para un admin.
create or replace function public.business_daily_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver las métricas del negocio.' using errcode = '42501';
  end if;
  return public.business_metrics_compute();
end;
$$;

-- Guardar el resumen (la edge; reemplaza el del mismo día).
create or replace function public.ai_save_digest(p_date date, p_kind text, p_body text, p_metrics jsonb, p_ai boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_digests (digest_date, kind, body_md, metrics, ai_generated)
  values (p_date, p_kind, p_body, coalesce(p_metrics, '{}'::jsonb), coalesce(p_ai, false))
  on conflict (digest_date) do update
    set kind = excluded.kind, body_md = excluded.body_md, metrics = excluded.metrics, ai_generated = excluded.ai_generated, created_at = now();
$$;

-- -----------------------------------------------------------------------------
-- El reloj: 7:30 a. m. de RD = 11:30 UTC
-- -----------------------------------------------------------------------------

create or replace function public.request_daily_digest()
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

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/ai-daily-digest',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-ai-secret', v_secret)
  );
exception when others then
  raise warning 'request_daily_digest: %', sqlerrm;
end;
$$;

revoke all on function public.business_metrics_compute() from public;
revoke execute on function public.business_metrics_compute() from anon;
revoke execute on function public.business_metrics_compute() from authenticated;
grant execute on function public.business_metrics_compute() to service_role;

revoke all on function public.business_daily_metrics() from public;
revoke execute on function public.business_daily_metrics() from anon;
grant execute on function public.business_daily_metrics() to authenticated;

revoke all on function public.ai_save_digest(date, text, text, jsonb, boolean) from public;
revoke execute on function public.ai_save_digest(date, text, text, jsonb, boolean) from anon;
revoke execute on function public.ai_save_digest(date, text, text, jsonb, boolean) from authenticated;
grant execute on function public.ai_save_digest(date, text, text, jsonb, boolean) to service_role;

revoke all on function public.request_daily_digest() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('daily-digest', '30 11 * * *', 'select public.request_daily_digest()');
  end if;
end $$;
