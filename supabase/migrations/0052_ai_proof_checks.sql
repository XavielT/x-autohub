-- =============================================================================
-- X AutoHub — Verificación asistida de comprobantes de transferencia
-- =============================================================================
--
-- Cuando un cliente adjunta su comprobante (`attach_payment_proof()` deja la RUTA en `orders.payment_proof_url`), un trigger le pide
-- a la Edge Function `ai-verify-proof` que lo lea. La IA SOLO ANOTA: lee monto, banco, últimos 4 de la cuenta de destino, referencia
-- y fecha, y la base los compara con lo esperado (`ai_proof_compare()`, en SQL: la IA no decide si coincide). Nunca llama a
-- `set_order_status()` ni toca el pedido: el cambio de estado lo hace una persona.
--
-- QUÉ SE GUARDA Y QUÉ NO
-- ----------------------
-- `reference_hash` (hash de la referencia normalizada) y `reference_last4`: sirven para detectar una referencia REPETIDA en otro pedido.
-- Nunca se guarda la referencia completa, ni números de cuenta completos, ni el nombre del titular: `extracted` solo lleva monto,
-- moneda, bancos, últimos 4 de la cuenta de destino, fecha y hora.
--
-- DISPARO
-- -------
-- pg_net + secretos del Vault, como `notify_status_change()` (0028): `ai_functions_url` (https://<ref>.supabase.co/functions/v1),
-- `ai_cron_secret` (el mismo valor que el secreto `AI_CRON_SECRET` de las edges) y `send_push_anon_key` (ya existe). Sin ellos el
-- trigger no hace nada y TAMPOCO falla el adjuntar el comprobante. El botón "Releer" de admin-pedidos llama a la edge con la sesión del admin.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

create table if not exists public.order_proof_checks (
  id              bigint generated always as identity primary key,
  order_id        uuid        not null references public.orders(id) on delete cascade,
  proof_path      text        not null,
  extracted       jsonb       not null default '{}'::jsonb,
  verdict         text        not null check (verdict in ('coincide', 'revisar', 'ilegible', 'no_es_comprobante')),
  flags           text[]      not null default '{}',
  reason          text,
  reference_hash  text,
  reference_last4 text,
  model           text,
  cost_usd        numeric(10, 6) not null default 0,
  created_at      timestamptz not null default now()
);

comment on table public.order_proof_checks is
  'Lectura de un comprobante por IA. Solo anota: nunca cambia el pedido. La escribe la edge (service_role); la lee un admin.';

create index if not exists order_proof_checks_order_idx on public.order_proof_checks (order_id, created_at desc);
create index if not exists order_proof_checks_ref_idx on public.order_proof_checks (reference_hash) where reference_hash is not null;

alter table public.order_proof_checks enable row level security;
revoke all on public.order_proof_checks from anon, authenticated;
grant select on public.order_proof_checks to authenticated;

drop policy if exists "un admin lee las verificaciones de comprobantes" on public.order_proof_checks;
create policy "un admin lee las verificaciones de comprobantes"
  on public.order_proof_checks for select to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- Lo esperado y la comparación (solo service_role)
-- -----------------------------------------------------------------------------
-- p_kind: lo que la IA dice que es la imagen ('comprobante' | 'no_es_comprobante' | 'ilegible').
-- Devuelve { verdict, flags, expected: { total, accounts: [{ bank, last4 }] } }.

create or replace function public.ai_proof_compare(
  p_order_id  uuid,
  p_kind      text,
  p_edited    boolean,
  p_amount    numeric,
  p_currency  text,
  p_dest_last4 text,
  p_date      date,
  p_ref_hash  text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total    numeric;
  v_created  date;
  v_today    date := (now() at time zone 'America/Santo_Domingo')::date;
  v_accounts jsonb;
  v_flags    text[] := '{}';
  v_verdict  text;
begin
  select o.total, (o.created_at at time zone 'America/Santo_Domingo')::date into v_total, v_created
    from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'Ese pedido no existe.' using errcode = '22023';
  end if;

  -- Las cuentas reales de X AutoHub (las de ejemplo no cuentan), solo con los últimos 4 dígitos.
  select coalesce(jsonb_agg(jsonb_build_object('bank', a ->> 'bank', 'last4', right(regexp_replace(coalesce(a ->> 'number', ''), '\D', '', 'g'), 4))), '[]'::jsonb)
    into v_accounts
    from public.site_settings s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) a
   where s.key = 'bank_accounts' and coalesce((a ->> 'is_example')::boolean, false) = false;

  if p_kind = 'ilegible' then
    return jsonb_build_object('verdict', 'ilegible', 'flags', '{}'::text[], 'expected', jsonb_build_object('total', v_total, 'accounts', v_accounts));
  elsif p_kind = 'no_es_comprobante' then
    return jsonb_build_object('verdict', 'no_es_comprobante', 'flags', '{}'::text[], 'expected', jsonb_build_object('total', v_total, 'accounts', v_accounts));
  end if;

  if p_amount is null then v_flags := array_append(v_flags, 'monto_ilegible');
  elsif abs(p_amount - v_total) > 0.01 then v_flags := array_append(v_flags, 'monto_distinto');
  end if;

  if p_currency is not null and upper(p_currency) not in ('DOP', 'RD', 'RD$', 'PESOS') then v_flags := array_append(v_flags, 'moneda_distinta'); end if;

  if p_dest_last4 is null then v_flags := array_append(v_flags, 'destino_ilegible');
  elsif not exists (select 1 from jsonb_array_elements(v_accounts) a where a ->> 'last4' = p_dest_last4) then
    v_flags := array_append(v_flags, 'destino_distinto');
  end if;

  if p_date is null then v_flags := array_append(v_flags, 'fecha_ilegible');
  elsif p_date < v_created then v_flags := array_append(v_flags, 'fecha_anterior_al_pedido');
  elsif p_date > v_today then v_flags := array_append(v_flags, 'fecha_futura');
  end if;

  if p_ref_hash is null then v_flags := array_append(v_flags, 'referencia_ausente');
  elsif exists (select 1 from public.order_proof_checks c where c.reference_hash = p_ref_hash and c.order_id <> p_order_id) then
    v_flags := array_append(v_flags, 'referencia_repetida');
  end if;

  if coalesce(p_edited, false) then v_flags := array_append(v_flags, 'parece_editada'); end if;

  -- "Coincide" exige que no haya ninguna bandera. Cualquier duda es "revisar": una persona decide.
  v_verdict := case when cardinality(v_flags) = 0 then 'coincide' else 'revisar' end;

  return jsonb_build_object('verdict', v_verdict, 'flags', v_flags, 'expected', jsonb_build_object('total', v_total, 'accounts', v_accounts));
end;
$$;

revoke all on function public.ai_proof_compare(uuid, text, boolean, numeric, text, text, date, text) from public;
revoke execute on function public.ai_proof_compare(uuid, text, boolean, numeric, text, text, date, text) from anon;
revoke execute on function public.ai_proof_compare(uuid, text, boolean, numeric, text, text, date, text) from authenticated;
grant execute on function public.ai_proof_compare(uuid, text, boolean, numeric, text, text, date, text) to service_role;

-- Lo esperado de un pedido para el panel "Lo que leí vs. lo que esperaba" (solo admin).
create or replace function public.admin_order_expected(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver esto.' using errcode = '42501';
  end if;
  select o.total into v_total from public.orders o where o.id = p_order_id;
  return jsonb_build_object(
    'total', v_total,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('bank', a ->> 'bank', 'last4', right(regexp_replace(coalesce(a ->> 'number', ''), '\D', '', 'g'), 4)))
        from public.site_settings s, jsonb_array_elements(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) a
       where s.key = 'bank_accounts' and coalesce((a ->> 'is_example')::boolean, false) = false
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_order_expected(uuid) from public;
revoke execute on function public.admin_order_expected(uuid) from anon;
grant execute on function public.admin_order_expected(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- El disparo
-- -----------------------------------------------------------------------------

create or replace function public.request_proof_check()
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
      url     := rtrim(v_url, '/') || '/ai-verify-proof',
      body    := jsonb_build_object('order_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-ai-secret', v_secret)
    );
  exception when others then
    -- Una lectura que no sale no es motivo para que adjuntar el comprobante falle.
    raise warning 'request_proof_check: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.request_proof_check() from public;
revoke execute on function public.request_proof_check() from anon;
revoke execute on function public.request_proof_check() from authenticated;

drop trigger if exists orders_request_proof_check on public.orders;
create trigger orders_request_proof_check
  after update of payment_proof_url on public.orders
  for each row
  when (new.payment_proof_url is not null and old.payment_proof_url is distinct from new.payment_proof_url)
  execute function public.request_proof_check();
