-- =============================================================================
-- X AutoHub — Garaje y mantenimiento: guías por vehículo, avance por kilometraje y recordatorios
-- =============================================================================
--
-- En "Mi garaje" cada vehículo tiene una tarjeta de mantenimiento: lo próximo a vencer (aceite, filtros, frenos, batería, bujías, correa, A/C, rotación, alineación, líquido
-- de frenos, refrigerante), "registrar servicio hecho", "ver productos para esto" y "agendar". La guía se arma una sola vez por (marca, modelo, rango de años) con IA y
-- se guarda para todos (`vehicle_maintenance_templates`): solo INTERVALOS y nombres de tareas, nunca torques, capacidades ni datos técnicos finos, con intervalo
-- de servicio severo para el uso en RD (calor, tráfico, polvo). Mientras nadie la revise, se muestra como "guía general generada con IA".
--
--   · `profile_vehicles.odometer_km` / `odometer_updated_at` / `maintenance_reminders` (recordatorios, apagados por defecto).
--   · `vehicle_maintenance_templates`: la guía (items jsonb). `category_slug` y `service_slug` se validan contra las tablas reales al guardarla.
--   · `vehicle_maintenance_items`: lo del vehículo (qué, cada cuánto, última vez, próxima vez, estado). Cada quien ve lo suyo; un admin todo.
--   · Funciones del dueño: `adopt_maintenance_template()`, `set_vehicle_odometer()`, `log_maintenance_done()`. Estado: ok / pronto (30 días o 500 km) / vencido.
--   · Recordatorios: cron diario a las 9:00 a. m. de RD (patrón de 0036) por el push que ya existe. Una cita que pasa a "hecha" y coincide con un renglón lo registra solo
--     (source = 'taller') y avisa: es reversible (el dueño lo corrige). Si no hay vínculo claro, no se hace nada.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter table public.profile_vehicles add column if not exists odometer_km integer;
alter table public.profile_vehicles add column if not exists odometer_updated_at timestamptz;
alter table public.profile_vehicles add column if not exists maintenance_reminders boolean not null default false;

alter table public.profile_vehicles drop constraint if exists profile_vehicles_odometer_check;
alter table public.profile_vehicles
  add constraint profile_vehicles_odometer_check check (odometer_km is null or odometer_km between 0 and 1500000);

-- -----------------------------------------------------------------------------
-- La guía por (marca, modelo, rango de años)
-- -----------------------------------------------------------------------------

create or replace function public.maintenance_items_valid(p_items jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  it jsonb;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    return false;
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object'
       or coalesce(it ->> 'key', '') = '' or coalesce(it ->> 'label', '') = ''
       or char_length(it ->> 'label') > 80
       or (it ->> 'severity') not in ('normal', 'severo')
       or ((it ->> 'every_km') is null and (it ->> 'every_months') is null) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table if not exists public.vehicle_maintenance_templates (
  id          bigint generated always as identity primary key,
  make_id     bigint      not null references public.vehicle_makes(id) on delete cascade,
  model_id    bigint      not null references public.vehicle_models(id) on delete cascade,
  year_from   smallint    not null check (year_from between 1950 and 2100),
  year_to     smallint    not null check (year_to between 1950 and 2100),
  engine_note text        check (engine_note is null or char_length(engine_note) <= 80),
  items       jsonb       not null default '[]'::jsonb check (public.maintenance_items_valid(items)),
  source      text        not null default 'ia' check (source in ('ia', 'admin')),
  reviewed    boolean     not null default false,
  model       text,
  created_at  timestamptz not null default now(),
  constraint vehicle_maintenance_templates_years check (year_to >= year_from and year_to - year_from <= 14),
  constraint vehicle_maintenance_templates_one unique (make_id, model_id, year_from, year_to)
);

comment on table public.vehicle_maintenance_templates is
  'Guía general de mantenimiento (solo intervalos) por marca, modelo y rango de años. Se genera una vez con IA y se cachea para todos; un admin la revisa.';

alter table public.vehicle_maintenance_templates enable row level security;
revoke all on public.vehicle_maintenance_templates from anon, authenticated;
grant select on public.vehicle_maintenance_templates to authenticated;
grant update (engine_note, items, reviewed, source) on public.vehicle_maintenance_templates to authenticated;
grant delete on public.vehicle_maintenance_templates to authenticated;

drop policy if exists "quien tiene sesion lee las guias" on public.vehicle_maintenance_templates;
create policy "quien tiene sesion lee las guias"
  on public.vehicle_maintenance_templates for select to authenticated using (true);

drop policy if exists "un admin revisa las guias" on public.vehicle_maintenance_templates;
create policy "un admin revisa las guias"
  on public.vehicle_maintenance_templates for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "un admin borra las guias" on public.vehicle_maintenance_templates;
create policy "un admin borra las guias"
  on public.vehicle_maintenance_templates for delete to authenticated using (public.is_admin());

-- Editar una guía a mano la marca como de un admin (y revisada): ya no es "generada con IA".
create or replace function public.maintenance_template_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.items is distinct from old.items then
    new.source := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_maintenance_templates_touch on public.vehicle_maintenance_templates;
create trigger vehicle_maintenance_templates_touch
  before update on public.vehicle_maintenance_templates
  for each row execute function public.maintenance_template_touch();

-- La guía que le toca a un vehículo: la de su marca y modelo con el rango de años más estrecho que lo contenga.
create or replace function public.find_maintenance_template(p_make_id bigint, p_model_id bigint, p_year integer)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select t.id from public.vehicle_maintenance_templates t
   where t.make_id = p_make_id and t.model_id = p_model_id and p_year between t.year_from and t.year_to
   order by (t.year_to - t.year_from), t.id
   limit 1;
$$;

-- Guardar una guía (la edge). Valida contra las tablas reales: un category_slug o service_slug que no existe se vuelve nulo (nunca se inventa un enlace).
create or replace function public.ai_save_maintenance_template(
  p_make_id bigint, p_model_id bigint, p_year_from integer, p_year_to integer, p_engine_note text, p_items jsonb, p_model text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean jsonb;
  v_id    bigint;
begin
  if not exists (select 1 from public.vehicle_models m where m.id = p_model_id and m.make_id = p_make_id) then
    raise exception 'Ese modelo no es de esa marca.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(
           it || jsonb_build_object(
             'category_slug', case when exists (select 1 from public.product_categories c where c.slug = it ->> 'category_slug') then it -> 'category_slug' else 'null'::jsonb end,
             'service_slug',  case when exists (select 1 from public.services s where s.slug = it ->> 'service_slug') then it -> 'service_slug' else 'null'::jsonb end
           )), '[]'::jsonb)
    into v_clean
    from jsonb_array_elements(p_items) it;

  insert into public.vehicle_maintenance_templates (make_id, model_id, year_from, year_to, engine_note, items, source, reviewed, model)
  values (p_make_id, p_model_id, p_year_from, p_year_to, nullif(left(coalesce(p_engine_note, ''), 80), ''), v_clean, 'ia', false, p_model)
  on conflict (make_id, model_id, year_from, year_to) do update set engine_note = excluded.engine_note
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lo del vehículo
-- -----------------------------------------------------------------------------

create table if not exists public.vehicle_maintenance_items (
  id                 bigint generated always as identity primary key,
  profile_vehicle_id bigint      not null references public.profile_vehicles(id) on delete cascade,
  template_key       text,
  label              text        not null check (char_length(btrim(label)) between 2 and 80),
  every_km           integer     check (every_km is null or every_km between 500 and 300000),
  every_months       integer     check (every_months is null or every_months between 1 and 120),
  last_done_on       date,
  last_done_km       integer     check (last_done_km is null or last_done_km between 0 and 1500000),
  due_on             date,
  due_km             integer,
  status             text        not null default 'ok' check (status in ('ok', 'pronto', 'vencido')),
  source             text        not null default 'usuario' check (source in ('ia', 'usuario', 'taller')),
  category_slug      text,
  service_slug       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint vehicle_maintenance_items_interval check (every_km is not null or every_months is not null)
);

create index if not exists vehicle_maintenance_items_vehicle_idx on public.vehicle_maintenance_items (profile_vehicle_id);
create index if not exists vehicle_maintenance_items_due_idx on public.vehicle_maintenance_items (status) where status <> 'ok';

alter table public.vehicle_maintenance_items enable row level security;
revoke all on public.vehicle_maintenance_items from anon, authenticated;
grant select, insert, delete on public.vehicle_maintenance_items to authenticated;
-- El dueño edita el nombre y los intervalos; las fechas, los kilómetros y el estado los mueven las funciones de abajo.
grant update (label, every_km, every_months) on public.vehicle_maintenance_items to authenticated;

drop policy if exists "cada quien ve el mantenimiento de su garaje" on public.vehicle_maintenance_items;
create policy "cada quien ve el mantenimiento de su garaje"
  on public.vehicle_maintenance_items for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profile_vehicles v where v.id = profile_vehicle_id and v.user_id = auth.uid()));

drop policy if exists "cada quien agrega a su garaje (mantenimiento)" on public.vehicle_maintenance_items;
create policy "cada quien agrega a su garaje (mantenimiento)"
  on public.vehicle_maintenance_items for insert to authenticated
  with check (source = 'usuario' and exists (select 1 from public.profile_vehicles v where v.id = profile_vehicle_id and v.user_id = auth.uid()));

drop policy if exists "cada quien edita el mantenimiento de su garaje" on public.vehicle_maintenance_items;
create policy "cada quien edita el mantenimiento de su garaje"
  on public.vehicle_maintenance_items for update to authenticated
  using (exists (select 1 from public.profile_vehicles v where v.id = profile_vehicle_id and v.user_id = auth.uid()))
  with check (exists (select 1 from public.profile_vehicles v where v.id = profile_vehicle_id and v.user_id = auth.uid()));

drop policy if exists "cada quien borra del mantenimiento de su garaje" on public.vehicle_maintenance_items;
create policy "cada quien borra del mantenimiento de su garaje"
  on public.vehicle_maintenance_items for delete to authenticated
  using (exists (select 1 from public.profile_vehicles v where v.id = profile_vehicle_id and v.user_id = auth.uid()));

-- Próxima vez y estado, calculados SIEMPRE por la base a partir de lo último que se hizo y del kilometraje.
create or replace function public.maintenance_recompute()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_odometer integer;
begin
  select v.odometer_km into v_odometer from public.profile_vehicles v where v.id = new.profile_vehicle_id;

  new.due_on := case when new.last_done_on is not null and new.every_months is not null then (new.last_done_on + make_interval(months => new.every_months))::date end;
  new.due_km := case when new.last_done_km is not null and new.every_km is not null then new.last_done_km + new.every_km end;

  new.status := case
    when (new.due_on is not null and new.due_on < current_date) or (new.due_km is not null and v_odometer is not null and v_odometer >= new.due_km) then 'vencido'
    when (new.due_on is not null and new.due_on <= current_date + 30) or (new.due_km is not null and v_odometer is not null and v_odometer >= new.due_km - 500) then 'pronto'
    else 'ok'
  end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists vehicle_maintenance_items_recompute on public.vehicle_maintenance_items;
create trigger vehicle_maintenance_items_recompute
  before insert or update on public.vehicle_maintenance_items
  for each row execute function public.maintenance_recompute();

-- El dueño copia la guía a su vehículo (una vez; si ya tiene renglones no hace nada). Devuelve cuántos copió.
create or replace function public.adopt_maintenance_template(p_profile_vehicle_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.profile_vehicles;
  t public.vehicle_maintenance_templates;
  v_id bigint;
  n integer;
begin
  select * into v from public.profile_vehicles pv where pv.id = p_profile_vehicle_id and pv.user_id = auth.uid();
  if not found then
    raise exception 'Ese vehículo no es tuyo.' using errcode = '42501';
  end if;
  if exists (select 1 from public.vehicle_maintenance_items i where i.profile_vehicle_id = v.id) then
    return 0;
  end if;
  if v.model_id is null then
    raise exception 'Para armar la guía hace falta elegir el modelo de la lista.' using errcode = '22023';
  end if;

  v_id := public.find_maintenance_template(v.make_id, v.model_id, v.year);
  if v_id is null then
    raise exception 'Todavía no hay una guía para este vehículo.' using errcode = '22023';
  end if;
  select * into t from public.vehicle_maintenance_templates where id = v_id;

  insert into public.vehicle_maintenance_items (profile_vehicle_id, template_key, label, every_km, every_months, source, category_slug, service_slug)
  select v.id, it ->> 'key', it ->> 'label', nullif(it ->> 'every_km', '')::integer, nullif(it ->> 'every_months', '')::integer, 'ia', it ->> 'category_slug', it ->> 'service_slug'
    from jsonb_array_elements(t.items) it;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Actualizar el kilometraje (solo el dueño) y volver a calcular los estados.
create or replace function public.set_vehicle_odometer(p_profile_vehicle_id bigint, p_km integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_km is null or p_km < 0 or p_km > 1500000 then
    raise exception 'El kilometraje tiene que estar entre 0 y 1,500,000.' using errcode = '22023';
  end if;
  update public.profile_vehicles set odometer_km = p_km, odometer_updated_at = now() where id = p_profile_vehicle_id and user_id = auth.uid();
  if not found then
    raise exception 'Ese vehículo no es tuyo.' using errcode = '42501';
  end if;
  -- Un update "vacío" dispara el trigger que recalcula el estado con el kilometraje nuevo.
  update public.vehicle_maintenance_items set label = label where profile_vehicle_id = p_profile_vehicle_id;
end;
$$;

-- Prender o apagar los recordatorios de un vehículo (solo el dueño). Nacen apagados.
create or replace function public.set_vehicle_reminders(p_profile_vehicle_id bigint, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profile_vehicles set maintenance_reminders = coalesce(p_on, false) where id = p_profile_vehicle_id and user_id = auth.uid();
  if not found then
    raise exception 'Ese vehículo no es tuyo.' using errcode = '42501';
  end if;
end;
$$;

-- "Registrar servicio hecho": hoy (o la fecha dada) y el kilometraje (o el último conocido).
create or replace function public.log_maintenance_done(p_item_id bigint, p_date date default null, p_km integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i public.vehicle_maintenance_items;
  v_km integer;
begin
  select it.* into i from public.vehicle_maintenance_items it join public.profile_vehicles v on v.id = it.profile_vehicle_id where it.id = p_item_id and v.user_id = auth.uid();
  if not found then
    raise exception 'Ese renglón no es tuyo.' using errcode = '42501';
  end if;
  if p_date is not null and p_date > current_date then
    raise exception 'La fecha no puede ser futura.' using errcode = '22023';
  end if;

  select coalesce(p_km, v.odometer_km) into v_km from public.profile_vehicles v where v.id = i.profile_vehicle_id;
  update public.vehicle_maintenance_items
     set last_done_on = coalesce(p_date, current_date), last_done_km = v_km, source = 'usuario'
   where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Recordatorios (opcionales por vehículo) y registro automático desde el taller
-- -----------------------------------------------------------------------------

create table if not exists public.maintenance_reminders_sent (
  item_id bigint      primary key references public.vehicle_maintenance_items(id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.maintenance_reminders_sent enable row level security;
revoke all on public.maintenance_reminders_sent from anon, authenticated;

create or replace function public.send_maintenance_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
  v        record;
  v_n      integer := 0;
begin
  begin
    select max(decrypted_secret) filter (where name = 'send_push_url'),
           max(decrypted_secret) filter (where name = 'send_push_anon_key'),
           max(decrypted_secret) filter (where name = 'send_push_secret')
      into v_url, v_anon, v_secret
      from vault.decrypted_secrets
     where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
    if coalesce(v_url, '') = '' or coalesce(v_anon, '') = '' or coalesce(v_secret, '') = '' then
      return 0;
    end if;

    -- Primero se actualiza el estado (el tiempo pasa aunque nadie toque la app).
    update public.vehicle_maintenance_items set label = label where status <> 'vencido';

    -- Un aviso por vehículo (no uno por renglón), y no más de uno cada 14 días por renglón.
    for v in
      select distinct pv.id
        from public.profile_vehicles pv
        join public.vehicle_maintenance_items i on i.profile_vehicle_id = pv.id
       where pv.maintenance_reminders and i.status in ('pronto', 'vencido')
         and not exists (select 1 from public.maintenance_reminders_sent s where s.item_id = i.id and s.sent_at > now() - interval '14 days')
    loop
      insert into public.maintenance_reminders_sent (item_id)
        select i.id from public.vehicle_maintenance_items i
         where i.profile_vehicle_id = v.id and i.status in ('pronto', 'vencido')
        on conflict (item_id) do update set sent_at = now();

      perform net.http_post(
        url     := v_url,
        body    := jsonb_build_object('kind', 'maintenance_reminder', 'id', v.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-push-secret', v_secret)
      );
      v_n := v_n + 1;
    end loop;
  exception when others then
    raise warning 'send_maintenance_reminders: %', sqlerrm;
  end;
  return v_n;
end;
$$;

-- Una cita que pasa a "hecha", con su vehículo y su servicio, registra el renglón que coincida por service_slug. Solo si el vínculo es claro: si no, nada.
create or replace function public.maintenance_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug  text;
  v_item  public.vehicle_maintenance_items;
  v_url   text;
  v_anon  text;
  v_secret text;
begin
  if new.profile_vehicle_id is null or new.service_id is null then
    return null;
  end if;
  select s.slug into v_slug from public.services s where s.id = new.service_id;
  if v_slug is null then
    return null;
  end if;

  -- Debe haber UN solo renglón con ese servicio en ese vehículo; con dos o ninguno, no se adivina.
  if (select count(*) from public.vehicle_maintenance_items i where i.profile_vehicle_id = new.profile_vehicle_id and i.service_slug = v_slug) <> 1 then
    return null;
  end if;
  select * into v_item from public.vehicle_maintenance_items i where i.profile_vehicle_id = new.profile_vehicle_id and i.service_slug = v_slug;

  update public.vehicle_maintenance_items
     set last_done_on = (new.scheduled_at at time zone 'America/Santo_Domingo')::date,
         last_done_km = (select v.odometer_km from public.profile_vehicles v where v.id = new.profile_vehicle_id),
         source = 'taller'
   where id = v_item.id;

  begin
    select max(decrypted_secret) filter (where name = 'send_push_url'), max(decrypted_secret) filter (where name = 'send_push_anon_key'), max(decrypted_secret) filter (where name = 'send_push_secret')
      into v_url, v_anon, v_secret from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
    if coalesce(v_url, '') <> '' and coalesce(v_anon, '') <> '' and coalesce(v_secret, '') <> '' then
      perform net.http_post(
        url := v_url, body := jsonb_build_object('kind', 'maintenance_logged', 'id', v_item.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'x-push-secret', v_secret));
    end if;
  exception when others then
    raise warning 'maintenance_from_appointment: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists service_appointments_maintenance on public.service_appointments;
create trigger service_appointments_maintenance
  after update of status on public.service_appointments
  for each row
  when (new.status = 'done' and old.status is distinct from new.status)
  execute function public.maintenance_from_appointment();

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['ai_save_maintenance_template(bigint, bigint, integer, integer, text, jsonb, text)', 'find_maintenance_template(bigint, bigint, integer)', 'send_maintenance_reminders()'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
  execute 'grant execute on function public.ai_save_maintenance_template(bigint, bigint, integer, integer, text, jsonb, text) to service_role';
  execute 'grant execute on function public.find_maintenance_template(bigint, bigint, integer) to service_role';

  foreach f in array array['adopt_maintenance_template(bigint)', 'set_vehicle_odometer(bigint, integer)', 'log_maintenance_done(bigint, date, integer)', 'set_vehicle_reminders(bigint, boolean)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('revoke execute on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on function public.maintenance_recompute() from public, anon, authenticated;
revoke all on function public.maintenance_template_touch() from public, anon, authenticated;
revoke all on function public.maintenance_from_appointment() from public, anon, authenticated;

-- Cada día a las 9:00 a. m. de RD (13:00 UTC).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('maintenance-reminders', '0 13 * * *', 'select public.send_maintenance_reminders()');
  end if;
end $$;
