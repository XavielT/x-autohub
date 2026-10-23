-- =============================================================================
-- X AutoHub — Servicios del taller: catálogo, agenda de citas y trabajos
-- (pivote, fase 5)
-- =============================================================================
--
-- Hasta aquí `services` eran cuatro tarjetas (icono, título, descripción) y un
-- botón de WhatsApp. Esta migración le da al taller lo que necesita para vender:
--
--   1. `services` gana lo que un servicio real tiene: slug, categoría, "desde RD$
--      X" (o a cotizar), duración, si se puede agendar, imágenes y descripción
--      larga. Y un catálogo inicial de diez servicios.
--   2. `service_availability` y `service_blackouts`: cuándo abre el taller y cuándo
--      no (feriados, cierres).
--   3. `service_appointments`: las citas. **Nadie las escribe desde el navegador**:
--      se crean con `book_appointment()` y se mueven con `set_appointment_status()`
--      o `cancel_appointment()`.
--   4. `available_slots()`: las horas libres de un día, calculadas en Postgres.
--   5. `service_works` y su bucket público: los trabajos realizados, antes y después.
--
--
-- LA HORA ES LA DE REPÚBLICA DOMINICANA
-- --------------------------------------
-- El taller abre "de 8:00 a 17:00" **en su hora**, no en la del servidor (UTC).
-- Todo lo que convierte una fecha y una hora en un instante usa
-- `America/Santo_Domingo`, que no tiene horario de verano (siempre UTC-4). Si esto
-- se calculara en el navegador, quien agenda desde otro huso vería horas
-- equivocadas; calculado aquí, el mismo día da las mismas horas para todos.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **La capacidad es del taller, no del servicio.** `capacity` son las citas
--   simultáneas que el taller atiende en esa franja, sea cual sea el servicio. Y una
--   cita ocupa **solo su hora de inicio**: `duration_minutes` es informativo. Un
--   trabajo de tres horas no bloquea tres franjas; el equipo lo confirma a mano
--   (la cita nace `requested`).
--
-- · **El invitado puede agendar** (`book_appointment()` es invocable por `anon`),
--   igual que puede comprar. Por eso la función valida todo por dentro y limita a
--   **3 citas abiertas por teléfono**: sin ese tope, cualquiera podría llenar la
--   agenda de la semana desde la consola.
--
-- · **Los precios del catálogo inicial son nulos ("a cotizar").** Un "desde RD$ X"
--   en pantalla es una promesa; ponerlo es decisión del taller, desde el panel.
--
-- · **La disponibilidad inicial es de ejemplo** (lunes a viernes 8:00–17:00,
--   sábado 8:00–13:00, franjas de 60 minutos, 2 simultáneas) y va marcada
--   `is_example`: el panel lo dice. A diferencia de las cuentas bancarias, aquí no se
--   esconde: una cita siempre pasa por confirmación, así que el peor caso es que el
--   equipo la mueva.
--
-- · **Los cuatro servicios genéricos de antes se desactivan, no se borran.** El
--   catálogo nuevo los cubre con más detalle; si alguien los quería, se reactivan
--   desde el panel.
--
-- · `cancel_appointment()` solo la llama quien tiene sesión y es dueño de la cita, y
--   solo si faltan **más de 24 horas**. Un invitado no tiene dónde cancelar: escribe
--   por WhatsApp.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

do $$
begin
  create type public.service_category as enum (
    'instalacion', 'mantenimiento', 'mecanica', 'electrico', 'aire_acondicionado', 'diagnostico'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.appointment_status as enum (
    'requested', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show'
  );
exception when duplicate_object then null;
end
$$;


-- -----------------------------------------------------------------------------
-- 2. services: lo que un servicio real tiene
-- -----------------------------------------------------------------------------

alter table public.services
  add column if not exists slug             text,
  add column if not exists category         public.service_category not null default 'mantenimiento',
  add column if not exists price_from       numeric(12,2),
  add column if not exists duration_minutes integer not null default 60,
  add column if not exists is_bookable      boolean not null default true,
  add column if not exists images           text[] not null default '{}',
  add column if not exists long_description text not null default '';

do $$
begin
  alter table public.services
    add constraint services_price_from_check check (price_from is null or price_from >= 0);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.services
    add constraint services_duration_check check (duration_minutes > 0 and duration_minutes <= 1440);
exception when duplicate_object then null;
end
$$;

-- Los cuatro de antes: slug y categoría, y se desactivan (ver la cabecera).
update public.services set slug = public.xah_slugify(title) where slug is null;

update public.services set category = 'mecanica'    where slug = 'reparacion';
update public.services set category = 'diagnostico' where slug in ('chequeo-y-diagnostico', 'busqueda-y-revision');

update public.services set is_active = false
 where slug in ('mantenimiento', 'reparacion', 'chequeo-y-diagnostico', 'busqueda-y-revision')
   and is_active;

alter table public.services alter column slug set not null;
create unique index if not exists services_slug_key on public.services (slug);

-- Slug a partir del título cuando no viene uno (`fill_slug_from_name()` de 0017 lee
-- `name`, y aquí la columna es `title`).
create or replace function public.services_fill_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.xah_slugify(new.title);
  end if;
  return new;
end;
$$;

drop trigger if exists services_slug on public.services;
create trigger services_slug
  before insert or update of slug, title on public.services
  for each row execute function public.services_fill_slug();

-- El catálogo inicial. Sin precio: "a cotizar" hasta que el taller lo ponga.
insert into public.services
  (slug, title, icon, description, category, duration_minutes, is_bookable, long_description, sort_order)
values
  ('instalacion-de-accesorios', 'Instalación de accesorios', 'assets/icons/mechanic-tools-hub-icon.svg',
   'Te instalamos lo que compraste en la tienda.', 'instalacion', 60, true,
   'Instalamos en el taller los accesorios y piezas que compres con nosotros: alfombras, luces, audio, sensores, protecciones y más. Trae tu vehículo con la pieza o compra la pieza en la tienda y marca "Quiero que me la instalen". El precio depende de la pieza y del vehículo: te lo confirmamos antes de empezar.', 10),
  ('cambio-de-aceite-y-filtros', 'Cambio de aceite y filtros', 'assets/icons/maintenance-hub-icon.svg',
   'Aceite y filtros al día, con el producto correcto para tu motor.', 'mantenimiento', 45, true,
   'Cambio de aceite de motor y de los filtros de aceite, aire y combustible según lo que pida tu vehículo. Si traes tu propio aceite, dínoslo al agendar. El precio depende del tipo de aceite y del motor: te lo confirmamos antes de empezar.', 20),
  ('mantenimiento-por-kilometraje', 'Mantenimiento por kilometraje', 'assets/icons/maintenance-hub-icon.svg',
   'El servicio que le toca a tu vehículo según su kilometraje.', 'mantenimiento', 120, true,
   'Revisamos tu vehículo y hacemos el mantenimiento que le toca por kilometraje: fluidos, filtros, correas y revisión general. Dinos el kilometraje y el modelo al agendar y armamos la lista. Te confirmamos el precio antes de empezar.', 30),
  ('frenos', 'Frenos', 'assets/icons/repair-hub-icon.svg',
   'Revisión y cambio de pastillas, discos y líquido.', 'mecanica', 90, true,
   'Revisión del sistema de frenos y cambio de pastillas, discos o líquido cuando hace falta. Si sientes vibración, ruido o el pedal blando, agéndalo cuanto antes. Te decimos qué encontramos y qué cuesta antes de cambiar nada.', 40),
  ('suspension', 'Suspensión', 'assets/icons/repair-hub-icon.svg',
   'Amortiguadores, bujes y rótulas: revisión y cambio.', 'mecanica', 120, true,
   'Revisión de la suspensión y cambio de amortiguadores, bujes, rótulas y terminales. Si el carro rebota, golpea en los huecos o se va hacia un lado, empieza por aquí. Te confirmamos el diagnóstico y el precio antes de empezar.', 50),
  ('bateria-y-alternador', 'Batería y alternador', 'assets/icons/diagnostic-hub-icon.svg',
   'Prueba y cambio de batería, y revisión del alternador.', 'electrico', 45, true,
   'Probamos la batería y el sistema de carga, y la cambiamos si hace falta. Si tu carro no prende o se apaga con las luces puestas, tráelo. Puedes comprar la batería en la tienda y que te la instalemos.', 60),
  ('luces-y-electrico', 'Luces y eléctrico', 'assets/icons/diagnostic-hub-icon.svg',
   'Luces, fusibles, cableado y fallas eléctricas.', 'electrico', 60, true,
   'Cambio de bombillos y kits LED, y diagnóstico de fusibles, relés y cableado. Describe la falla al agendar: un diagnóstico eléctrico lleva tiempo y te confirmamos el precio cuando sepamos qué es.', 70),
  ('carga-y-reparacion-de-aire-acondicionado', 'Carga y reparación de A/C', 'assets/icons/services-hub-icon.svg',
   'Si tu aire no enfría, lo revisamos.', 'aire_acondicionado', 90, true,
   'Revisión del aire acondicionado, búsqueda de fugas y carga de gas. Si enfría poco o hace ruido, agéndalo. El precio depende de si es solo carga o hay una pieza que cambiar: te lo confirmamos antes de empezar.', 80),
  ('diagnostico-computarizado', 'Diagnóstico computarizado', 'assets/icons/medical-scanner-hub-icon.svg',
   'Escáner para leer qué le pasa a tu vehículo.', 'diagnostico', 60, true,
   'Conectamos el escáner, leemos los códigos de falla y te explicamos qué significan y qué conviene hacer. Si se prendió la luz del motor, empieza por aquí. Te damos el resultado por escrito.', 90),
  ('revision-pre-compra', 'Revisión pre-compra', 'assets/icons/search-check-hub-icon.svg',
   'Te acompañamos a revisar el carro antes de que lo compres.', 'diagnostico', 90, true,
   'Antes de pagar un vehículo usado, lo revisamos: motor, transmisión visible, frenos, suspensión, eléctrico y escáner. Te decimos qué encontramos y si vale lo que piden. Dinos marca, modelo y año al agendar.', 100)
on conflict (slug) do nothing;

comment on column public.services.price_from is
  'Precio base ("desde RD$ X"). Nulo = a cotizar. Lo pone el taller desde el panel.';


-- -----------------------------------------------------------------------------
-- 3. Cuándo abre el taller
-- -----------------------------------------------------------------------------

create table if not exists public.service_availability (
  id           bigint generated by default as identity primary key,
  -- 0 = domingo … 6 = sábado, como `extract(dow ...)`.
  weekday      smallint not null check (weekday between 0 and 6),
  opens_at     time not null,
  closes_at    time not null,
  slot_minutes integer not null default 60 check (slot_minutes between 5 and 480),
  -- Citas simultáneas que el taller atiende en esta franja (de cualquier servicio).
  capacity     integer not null default 1 check (capacity > 0),
  is_example   boolean not null default false,
  constraint service_availability_hours check (closes_at > opens_at)
);

create index if not exists service_availability_weekday_idx on public.service_availability (weekday);

create table if not exists public.service_blackouts (
  id        bigint generated by default as identity primary key,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  reason    text not null default '',
  constraint service_blackouts_range check (ends_at > starts_at)
);

create index if not exists service_blackouts_range_idx on public.service_blackouts (starts_at, ends_at);

-- Valores de EJEMPLO, marcados como tales. Solo si todavía no hay ninguno: volver a
-- aplicar la migración no pisa lo que el taller ya cargó.
insert into public.service_availability (weekday, opens_at, closes_at, slot_minutes, capacity, is_example)
select d.weekday, '08:00', d.closes_at, 60, 2, true
  from (values (1, '17:00'::time), (2, '17:00'), (3, '17:00'), (4, '17:00'), (5, '17:00'), (6, '13:00'))
       as d(weekday, closes_at)
 where not exists (select 1 from public.service_availability);

alter table public.service_availability enable row level security;
alter table public.service_blackouts    enable row level security;

drop policy if exists "el horario del taller lo lee cualquiera" on public.service_availability;
create policy "el horario del taller lo lee cualquiera"
  on public.service_availability for select using (true);

drop policy if exists "solo admin cambia el horario" on public.service_availability;
create policy "solo admin cambia el horario"
  on public.service_availability for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "los cierres los lee cualquiera" on public.service_blackouts;
create policy "los cierres los lee cualquiera"
  on public.service_blackouts for select using (true);

drop policy if exists "solo admin cambia los cierres" on public.service_blackouts;
create policy "solo admin cambia los cierres"
  on public.service_blackouts for all
  using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 4. Citas
-- -----------------------------------------------------------------------------

create sequence if not exists public.service_appointments_number_seq start with 2001;

create table if not exists public.service_appointments (
  id                 uuid primary key default gen_random_uuid(),
  -- El número que se le dice al cliente. Empieza en 2001 para no confundirse con
  -- el de un pedido (#1001…).
  appointment_number integer not null default nextval('public.service_appointments_number_seq'),
  -- Nulo para un invitado.
  user_id            uuid references public.profiles(id) on delete set null,
  service_id         bigint not null references public.services(id) on delete restrict,
  -- La instalación de lo que compró: nulo salvo cuando viene de un pedido.
  order_id           uuid references public.orders(id) on delete set null,
  profile_vehicle_id bigint references public.profile_vehicles(id) on delete set null,
  -- Siempre se guarda el texto ("Toyota Corolla 2015"): el vehículo del garaje
  -- puede cambiar o borrarse después, y la cita tiene que seguir diciendo de qué
  -- vehículo era.
  vehicle_text       text,
  contact_name       text not null,
  contact_phone      text not null,
  scheduled_at       timestamptz not null,
  status             public.appointment_status not null default 'requested',
  -- Lo que el cliente quiere que sepamos.
  notes              text,
  -- Lo que escribe el equipo al mover la cita. **La ve el cliente.**
  status_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter sequence public.service_appointments_number_seq owned by public.service_appointments.appointment_number;

create unique index if not exists service_appointments_number_key on public.service_appointments (appointment_number);
create index if not exists service_appointments_when_idx on public.service_appointments (scheduled_at);
create index if not exists service_appointments_user_idx on public.service_appointments (user_id, scheduled_at desc);
create index if not exists service_appointments_phone_idx on public.service_appointments (contact_phone);

create or replace function public.service_appointments_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists service_appointments_touch on public.service_appointments;
create trigger service_appointments_touch
  before update on public.service_appointments
  for each row execute function public.service_appointments_touch();

alter table public.service_appointments enable row level security;

-- Cada quien ve las suyas; el admin, todas. Sin política de insert, update ni
-- delete: **no es un olvido, es el mecanismo**. Las citas entran por
-- `book_appointment()` y cambian por `set_appointment_status()` y
-- `cancel_appointment()`, que son `security definer` y validan por dentro (misma
-- idea que `site_settings`).
drop policy if exists "cada quien ve sus citas, el admin todas" on public.service_appointments;
create policy "cada quien ve sus citas, el admin todas"
  on public.service_appointments for select
  using (user_id = auth.uid() or public.is_admin());


-- -----------------------------------------------------------------------------
-- 5. Las horas libres de un día
-- -----------------------------------------------------------------------------
-- Devuelve cada franja del día con cuántos cupos le quedan. Respeta el horario, los
-- cierres, la capacidad y las citas ya tomadas, y **nunca devuelve una hora que ya
-- pasó**. `security definer` porque tiene que contar las citas de todos (que un
-- invitado no puede leer) y solo devuelve el conteo, nunca de quién.

create or replace function public.available_slots(p_service_id bigint, p_date date)
returns table (slot_at timestamptz, remaining integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_date is null or p_date > (now() at time zone 'America/Santo_Domingo')::date + 90 then
    return;
  end if;

  -- Un servicio que no existe, está apagado o no se agenda no tiene horas.
  if not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.is_active and s.is_bookable
  ) then
    return;
  end if;

  return query
  with candidates as (
    select (g.t at time zone 'America/Santo_Domingo') as at_utc, a.capacity
    from public.service_availability a
    cross join lateral generate_series(
      p_date + a.opens_at,
      p_date + a.closes_at - make_interval(mins => a.slot_minutes),
      make_interval(mins => a.slot_minutes)
    ) as g(t)
    where a.weekday = extract(dow from p_date)::int
  )
  select c.at_utc,
         c.capacity - (
           select count(*)::int from public.service_appointments x
           where x.scheduled_at = c.at_utc
             and x.status in ('requested', 'confirmed', 'in_progress')
         )
  from candidates c
  where c.at_utc > now()
    and not exists (
      select 1 from public.service_blackouts b
      where c.at_utc >= b.starts_at and c.at_utc < b.ends_at
    )
    and c.capacity - (
      select count(*)::int from public.service_appointments x
      where x.scheduled_at = c.at_utc
        and x.status in ('requested', 'confirmed', 'in_progress')
    ) > 0
  order by c.at_utc;
end;
$$;

comment on function public.available_slots(bigint, date) is
  'Franjas libres de un dia (hora de Santo Domingo), con cupos restantes. Nunca devuelve horas pasadas.';

revoke all on function public.available_slots(bigint, date) from public;
grant execute on function public.available_slots(bigint, date) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. Agendar
-- -----------------------------------------------------------------------------
-- Vuelve a validar el slot **dentro de Postgres**: lo que el navegador mostró hace
-- un minuto puede haberse llenado. El bloqueo asesor evita que dos personas tomen
-- el último cupo de la misma franja a la vez.

create or replace function public.book_appointment(
  p_service_id         bigint,
  p_scheduled_at       timestamptz,
  p_contact_name       text,
  p_contact_phone      text,
  p_vehicle_text       text   default null,
  p_profile_vehicle_id bigint default null,
  p_order_id           uuid   default null,
  p_notes              text   default null
)
returns table (
  id                 uuid,
  appointment_number integer,
  service_id         bigint,
  scheduled_at       timestamptz,
  status             text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id     uuid;
  v_number integer;
  v_digits text;
  v_open   integer;
begin
  if coalesce(btrim(p_contact_name), '') = '' then
    raise exception 'Escribe tu nombre.' using errcode = '22023';
  end if;
  if length(btrim(p_contact_name)) > 100 then
    raise exception 'El nombre es demasiado largo.' using errcode = '22023';
  end if;

  -- Los diez dígitos de la derecha: "+1 809 555 0134" y "809-555-0134" son el mismo
  -- teléfono, y el tope de abajo no se puede esquivar con el código de país.
  v_digits := right(regexp_replace(coalesce(p_contact_phone, ''), '\D', '', 'g'), 10);
  if length(v_digits) < 10 then
    raise exception 'Escribe un telefono valido: lo usamos para confirmar tu cita.' using errcode = '22023';
  end if;

  if length(coalesce(p_vehicle_text, '')) > 120 or length(coalesce(p_notes, '')) > 500 then
    raise exception 'El vehiculo o las notas son demasiado largos.' using errcode = '22023';
  end if;

  if p_scheduled_at is null then
    raise exception 'Elige el dia y la hora.' using errcode = '22023';
  end if;

  -- Tiene que ser una de las franjas que `available_slots()` devolvería ahora mismo.
  -- El bloqueo es por franja: dos citas a la misma hora se turnan, las demás no se
  -- esperan.
  perform pg_advisory_xact_lock(hashtext('service-slot'), extract(epoch from p_scheduled_at)::int);

  if not exists (
    select 1
    from public.available_slots(
      p_service_id,
      (p_scheduled_at at time zone 'America/Santo_Domingo')::date
    ) s
    where s.slot_at = p_scheduled_at
  ) then
    raise exception 'Esa hora ya no esta disponible. Elige otra.' using errcode = '22023';
  end if;

  -- Un tope por teléfono: sin él, una consola llena la agenda de la semana.
  select count(*) into v_open
  from public.service_appointments a
  where right(regexp_replace(a.contact_phone, '\D', '', 'g'), 10) = v_digits
    and a.status in ('requested', 'confirmed')
    and a.scheduled_at > now();

  if v_open >= 3 then
    raise exception 'Ya tienes 3 citas abiertas con este telefono. Escribenos por WhatsApp para cambiarlas.'
      using errcode = '22023';
  end if;

  -- El vehículo del garaje tiene que ser de quien agenda.
  if p_profile_vehicle_id is not null and not exists (
    select 1 from public.profile_vehicles v
    where v.id = p_profile_vehicle_id and v.user_id = auth.uid()
  ) then
    raise exception 'Ese vehiculo no es de tu garaje.' using errcode = '22023';
  end if;

  if p_order_id is not null and not exists (select 1 from public.orders o where o.id = p_order_id) then
    raise exception 'Ese pedido no existe.' using errcode = '22023';
  end if;

  insert into public.service_appointments (
    user_id, service_id, order_id, profile_vehicle_id, vehicle_text,
    contact_name, contact_phone, scheduled_at, notes
  ) values (
    auth.uid(), p_service_id, p_order_id, p_profile_vehicle_id, nullif(btrim(coalesce(p_vehicle_text, '')), ''),
    btrim(p_contact_name), btrim(p_contact_phone), p_scheduled_at, nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning service_appointments.id, service_appointments.appointment_number into v_id, v_number;

  return query select v_id, v_number, p_service_id, p_scheduled_at, 'requested'::text;
end;
$$;

comment on function public.book_appointment(bigint, timestamptz, text, text, text, bigint, uuid, text) is
  'Agenda una cita (nace requested). Revalida el slot y el tope por telefono dentro de Postgres.';

-- Se le da a `anon` a propósito: se puede agendar sin cuenta, y la función valida
-- todo por dentro.
revoke all on function public.book_appointment(bigint, timestamptz, text, text, text, bigint, uuid, text) from public;
grant execute on function public.book_appointment(bigint, timestamptz, text, text, text, bigint, uuid, text)
  to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 7. Cambiar el estado de una cita
-- -----------------------------------------------------------------------------
--   requested    → confirmed · cancelled
--   confirmed    → in_progress · done · cancelled · no_show
--   in_progress  → done · cancelled
--   done · cancelled · no_show → (final)
--
-- Un admin cambia el estado con `set_appointment_status()`. El cliente solo puede
-- cancelar la suya con `cancel_appointment()`, y solo con más de 24 horas.

create or replace function public.set_appointment_status(
  p_id   uuid,
  p_to   text,
  p_note text default null
)
returns table (id uuid, appointment_number integer, status text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_from    text;
  v_allowed boolean;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar el estado de las citas.' using errcode = '42501';
  end if;

  select a.status::text into v_from from public.service_appointments a where a.id = p_id for update;
  if v_from is null then
    raise exception 'Esa cita no existe.' using errcode = '22023';
  end if;

  if p_to is null or p_to not in ('requested', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show') then
    raise exception 'Estado no valido: %.', coalesce(p_to, 'vacio') using errcode = '22023';
  end if;

  v_allowed := case v_from
    when 'requested'   then p_to in ('confirmed', 'cancelled')
    when 'confirmed'   then p_to in ('in_progress', 'done', 'cancelled', 'no_show')
    when 'in_progress' then p_to in ('done', 'cancelled')
    else false
  end;

  if not v_allowed then
    raise exception 'Una cita % no puede pasar a %.', v_from, p_to using errcode = '22023';
  end if;

  update public.service_appointments a
     set status = p_to::public.appointment_status,
         status_note = nullif(btrim(coalesce(p_note, '')), '')
   where a.id = p_id;

  return query
    select a.id, a.appointment_number, a.status::text from public.service_appointments a where a.id = p_id;
end;
$$;

revoke all on function public.set_appointment_status(uuid, text, text) from public;
revoke execute on function public.set_appointment_status(uuid, text, text) from anon;
grant execute on function public.set_appointment_status(uuid, text, text) to authenticated;

create or replace function public.cancel_appointment(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
  v_at timestamptz;
begin
  select a.user_id, a.status::text, a.scheduled_at into v_owner, v_status, v_at
  from public.service_appointments a where a.id = p_id for update;

  -- Una cita ajena y una que no existe se responden igual: no se confirma cuáles hay.
  if v_owner is null or v_owner is distinct from auth.uid() then
    raise exception 'Esa cita no existe.' using errcode = '22023';
  end if;

  if v_status not in ('requested', 'confirmed') then
    raise exception 'Esta cita ya no se puede cancelar.' using errcode = '22023';
  end if;

  if v_at - now() <= interval '24 hours' then
    raise exception 'Solo se puede cancelar con mas de 24 horas de anticipacion. Escribenos por WhatsApp.'
      using errcode = '22023';
  end if;

  update public.service_appointments a
     set status = 'cancelled', status_note = 'Cancelada por el cliente'
   where a.id = p_id;
end;
$$;

revoke all on function public.cancel_appointment(uuid) from public;
revoke execute on function public.cancel_appointment(uuid) from anon;
grant execute on function public.cancel_appointment(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Trabajos realizados
-- -----------------------------------------------------------------------------

create table if not exists public.service_works (
  id           bigint generated by default as identity primary key,
  -- Un trabajo puede no estar ligado a un servicio del catálogo.
  service_id   bigint references public.services(id) on delete set null,
  title        text not null,
  description  text not null default '',
  before_image text,
  after_image  text,
  vehicle_text text,
  done_at      date not null default current_date,
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists service_works_published_idx
  on public.service_works (done_at desc) where is_published;
create index if not exists service_works_service_idx on public.service_works (service_id);

alter table public.service_works enable row level security;

drop policy if exists "los trabajos publicados los ve cualquiera" on public.service_works;
create policy "los trabajos publicados los ve cualquiera"
  on public.service_works for select using (is_published or public.is_admin());

drop policy if exists "solo admin escribe los trabajos" on public.service_works;
create policy "solo admin escribe los trabajos"
  on public.service_works for all
  using (public.is_admin()) with check (public.is_admin());

-- El bucket: lectura pública (las fotos tienen que verse sin sesión), escritura
-- solo de un admin. Misma forma que `inventory` (0008).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-works', 'service-works', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "las fotos de trabajos las ve cualquiera" on storage.objects;
create policy "las fotos de trabajos las ve cualquiera"
  on storage.objects for select
  using (bucket_id = 'service-works');

drop policy if exists "solo admin sube fotos de trabajos" on storage.objects;
create policy "solo admin sube fotos de trabajos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'service-works' and public.is_admin());

drop policy if exists "solo admin cambia fotos de trabajos" on storage.objects;
create policy "solo admin cambia fotos de trabajos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'service-works' and public.is_admin())
  with check (bucket_id = 'service-works' and public.is_admin());

drop policy if exists "solo admin borra fotos de trabajos" on storage.objects;
create policy "solo admin borra fotos de trabajos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'service-works' and public.is_admin());


-- -----------------------------------------------------------------------------
-- 9. Mis citas
-- -----------------------------------------------------------------------------
-- `security invoker`: la política de arriba ya dice que cada quien ve las suyas.

create or replace function public.my_appointments()
returns table (
  id                 uuid,
  appointment_number integer,
  service_id         bigint,
  service_title      text,
  service_slug       text,
  scheduled_at       timestamptz,
  status             public.appointment_status,
  vehicle_text       text,
  status_note        text,
  order_id           uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select a.id, a.appointment_number, a.service_id, s.title, s.slug,
         a.scheduled_at, a.status, a.vehicle_text, a.status_note, a.order_id
  from public.service_appointments a
  join public.services s on s.id = a.service_id
  where a.user_id = auth.uid()
  order by a.scheduled_at desc;
$$;

revoke all on function public.my_appointments() from public;
revoke execute on function public.my_appointments() from anon;
grant execute on function public.my_appointments() to authenticated;
