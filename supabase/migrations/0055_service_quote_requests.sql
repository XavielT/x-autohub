-- =============================================================================
-- X AutoHub — Solicitudes de cotización del taller (con fotos de verdad) y triage asistido
-- =============================================================================
--
-- Hasta ahora /servicios/cotizar solo REDACTABA un texto de WhatsApp: no guardaba nada y las fotos no iban a ningún lado. Ahora la solicitud se guarda
-- (con o sin cuenta), las fotos se suben de verdad a un bucket privado y el equipo las ve en /admin/taller/solicitudes con un triage de la IA
-- (resumen para el mecánico, qué falta preguntar, urgencia). La IA NUNCA da precios: si el servicio tiene `price_from`, sale "desde RD$…" de la base.
--
--   · `service_quote_requests`: la solicitud. Código `XAH-C-0001` por secuencia. RLS: el dueño ve las suyas, el admin todas. No hay INSERT directo.
--   · `create_quote_request()`: la ÚNICA forma de crear una, abierta a visitantes: valida el teléfono (dominicano) en SQL, honeypot, tope por
--     teléfono y global, y que las fotos sean las que ese mismo visitante subió.
--   · Bucket privado `quote-photos` (hasta 3 fotos JPEG/WebP de ≤3 MB). Un visitante sin cuenta sube a una carpeta con un uuid que él elige (`<uuid>/<n>.jpg`);
--     solo la lee un admin. Las fotos de solicitudes cerradas hace más de 90 días se borran (cron → edge, que usa la API de Storage: borrar filas de
--     `storage.objects` por SQL deja el archivo huérfano).
--   · El triage lo pide un trigger con pg_net (mismos secretos del Vault que 0052/0053).
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

create sequence if not exists public.quote_request_seq;

create table if not exists public.service_quote_requests (
  id                 uuid        primary key default gen_random_uuid(),
  request_number     integer     not null unique default nextval('public.quote_request_seq'),
  code               text        generated always as ('XAH-C-' || lpad(request_number::text, 4, '0')) stored,
  user_id            uuid        references public.profiles(id) on delete set null,
  contact_name       text        not null check (char_length(btrim(contact_name)) between 2 and 80),
  -- Diez dígitos sin código de país (la forma canónica de phone.ts).
  contact_phone      text        not null check (contact_phone ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$'),
  profile_vehicle_id bigint      references public.profile_vehicles(id) on delete set null,
  vehicle_text       text        check (vehicle_text is null or char_length(vehicle_text) <= 120),
  service_id         bigint      references public.services(id) on delete set null,
  description        text        not null check (char_length(btrim(description)) between 5 and 1000),
  photos             text[]      not null default '{}' check (cardinality(photos) <= 3),
  status             text        not null default 'nueva' check (status in ('nueva', 'vista', 'respondida', 'agendada', 'cerrada', 'spam')),
  ai_triage          jsonb,
  urgency            text        check (urgency in ('normal', 'pronto', 'seguridad')),
  handled_by         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.service_quote_requests is
  'Solicitudes de cotización del taller. Se crean solo con create_quote_request(); el triage lo escribe la edge (service_role).';

create index if not exists service_quote_requests_status_idx on public.service_quote_requests (status, created_at desc);
create index if not exists service_quote_requests_user_idx on public.service_quote_requests (user_id) where user_id is not null;
create index if not exists service_quote_requests_phone_idx on public.service_quote_requests (contact_phone, created_at desc);

alter table public.service_quote_requests enable row level security;
revoke all on public.service_quote_requests from anon, authenticated;
grant select on public.service_quote_requests to authenticated;
-- Un admin cambia el estado y quién la atiende; nada más (el triage y las fotos son de la edge y de la creación).
grant update (status, handled_by) on public.service_quote_requests to authenticated;

drop policy if exists "el dueño ve sus solicitudes y un admin todas" on public.service_quote_requests;
create policy "el dueño ve sus solicitudes y un admin todas"
  on public.service_quote_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "un admin atiende las solicitudes" on public.service_quote_requests;
create policy "un admin atiende las solicitudes"
  on public.service_quote_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.service_quote_requests_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_quote_requests_touch_trg on public.service_quote_requests;
create trigger service_quote_requests_touch_trg
  before update on public.service_quote_requests
  for each row execute function public.service_quote_requests_touch();

-- -----------------------------------------------------------------------------
-- Bucket privado de fotos
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-photos', 'quote-photos', false, 3145728, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Quien sube (con o sin cuenta) lo hace a una carpeta con un uuid y un nombre de la forma `<n>.jpg|webp` (n de 0 a 2). Ni más ni menos.
drop policy if exists "se suben fotos de una cotizacion" on storage.objects;
create policy "se suben fotos de una cotizacion"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'quote-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-2]\.(jpg|webp)$'
  );

drop policy if exists "un admin lee las fotos de cotizacion" on storage.objects;
create policy "un admin lee las fotos de cotizacion"
  on storage.objects for select to authenticated
  using (bucket_id = 'quote-photos' and public.is_admin());

-- -----------------------------------------------------------------------------
-- Crear una solicitud (abierta a visitantes)
-- -----------------------------------------------------------------------------

create or replace function public.create_quote_request(
  p_name               text,
  p_phone              text,
  p_description        text,
  p_vehicle_text       text default null,
  p_profile_vehicle_id bigint default null,
  p_service_id         bigint default null,
  p_token              uuid default null,
  p_photos             text[] default '{}',
  p_website            text default null
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_photo  text;
  v_vehicle bigint;
  v_service bigint;
  v_id     uuid;
  v_code   text;
begin
  -- Honeypot: un campo que una persona no ve y un bot llena. Se responde como si todo saliera bien, sin guardar nada.
  if coalesce(btrim(p_website), '') <> '' then
    return query select gen_random_uuid(), 'XAH-C-0000'::text;
    return;
  end if;

  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(btrim(p_name)) > 80 then
    raise exception 'Escribe tu nombre.' using errcode = '22023';
  end if;
  if v_digits !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'Escribe un teléfono dominicano válido (809, 829 o 849…).' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) < 5 or char_length(btrim(p_description)) > 1000 then
    raise exception 'Cuéntanos qué necesitas (entre 5 y 1000 letras).' using errcode = '22023';
  end if;

  -- Topes: por teléfono y global. Un abuso no llena la bandeja del taller.
  if (select count(*) from public.service_quote_requests q where q.contact_phone = v_digits and q.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya recibimos varias solicitudes de este número. Te contestamos pronto.' using errcode = '22023';
  end if;
  if (select count(*) from public.service_quote_requests q where q.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Estamos recibiendo muchas solicitudes ahora. Escríbenos por WhatsApp.' using errcode = '22023';
  end if;

  -- Las fotos tienen que ser de la carpeta de este mismo visitante (el uuid que eligió) y existir.
  if coalesce(cardinality(p_photos), 0) > 3 then
    raise exception 'Máximo 3 fotos.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_photos), 0) > 0 then
    if p_token is null then
      raise exception 'Faltan los datos de las fotos.' using errcode = '22023';
    end if;
    foreach v_photo in array p_photos loop
      if v_photo not like p_token::text || '/%'
         or not exists (select 1 from storage.objects so where so.bucket_id = 'quote-photos' and so.name = v_photo) then
        raise exception 'No encontramos una de las fotos. Intenta de nuevo.' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- El vehículo del garaje solo vale si es de quien escribe; el servicio, si existe y está activo.
  if p_profile_vehicle_id is not null and auth.uid() is not null then
    select pv.id into v_vehicle from public.profile_vehicles pv where pv.id = p_profile_vehicle_id and pv.user_id = auth.uid();
  end if;
  if p_service_id is not null then
    select s.id into v_service from public.services s where s.id = p_service_id and s.is_active;
  end if;

  insert into public.service_quote_requests as q (user_id, contact_name, contact_phone, profile_vehicle_id, vehicle_text, service_id, description, photos)
  values (auth.uid(), btrim(p_name), v_digits, v_vehicle, nullif(btrim(coalesce(p_vehicle_text, '')), ''), v_service, btrim(p_description), coalesce(p_photos, '{}'))
  returning q.id, q.code into v_id, v_code;

  return query select v_id, v_code;
end;
$$;

revoke all on function public.create_quote_request(text, text, text, text, bigint, bigint, uuid, text[], text) from public;
grant execute on function public.create_quote_request(text, text, text, text, bigint, bigint, uuid, text[], text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Triage (lo escribe la edge)
-- -----------------------------------------------------------------------------

create or replace function public.ai_save_quote_triage(p_id uuid, p_triage jsonb, p_urgency text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.service_quote_requests set ai_triage = p_triage, urgency = p_urgency where id = p_id;
$$;

revoke all on function public.ai_save_quote_triage(uuid, jsonb, text) from public;
revoke execute on function public.ai_save_quote_triage(uuid, jsonb, text) from anon;
revoke execute on function public.ai_save_quote_triage(uuid, jsonb, text) from authenticated;
grant execute on function public.ai_save_quote_triage(uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- El disparo del triage y la purga de fotos
-- -----------------------------------------------------------------------------

create or replace function public.request_quote_triage()
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
      url     := rtrim(v_url, '/') || '/ai-triage-quote',
      body    := jsonb_build_object('action', 'triage', 'id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-ai-secret', v_secret)
    );
  exception when others then
    raise warning 'request_quote_triage: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.request_quote_triage() from public, anon, authenticated;

drop trigger if exists service_quote_requests_triage on public.service_quote_requests;
create trigger service_quote_requests_triage
  after insert on public.service_quote_requests
  for each row execute function public.request_quote_triage();

-- Las fotos de solicitudes cerradas hace más de 90 días: la edge las borra con la API de Storage y después las quita de la fila.
create or replace function public.quote_photos_to_purge()
returns table (id uuid, photos text[])
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.photos
    from public.service_quote_requests q
   where cardinality(q.photos) > 0 and q.status in ('cerrada', 'spam') and q.updated_at < now() - interval '90 days'
   limit 100;
$$;

create or replace function public.quote_photos_cleared(p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.service_quote_requests set photos = '{}' where id = any (p_ids);
$$;

create or replace function public.request_quote_purge()
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
  if not exists (select 1 from public.quote_photos_to_purge()) then
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/ai-triage-quote',
    body    := jsonb_build_object('action', 'purge'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-ai-secret', v_secret)
  );
exception when others then
  raise warning 'request_quote_purge: %', sqlerrm;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['quote_photos_to_purge()', 'quote_photos_cleared(uuid[])', 'request_quote_purge()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
  execute 'grant execute on function public.quote_photos_to_purge() to service_role';
  execute 'grant execute on function public.quote_photos_cleared(uuid[]) to service_role';
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('quote-photos-purge', '50 8 * * *', 'select public.request_quote_purge()');
  end if;
end $$;
