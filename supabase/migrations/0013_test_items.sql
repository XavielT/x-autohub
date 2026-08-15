-- =============================================================================
-- X AutoHub — Artículos de prueba y usuarios de prueba
-- =============================================================================
--
-- Hace falta poder meter contenido falso en el sitio **en vivo** —una pieza, un
-- vehículo, una publicación, una noticia— para probar el flujo completo sin
-- montar un entorno aparte y sin que ningún visitante se tropiece con él.
--
--   `is_test`       en las cuatro tablas de contenido: marca la fila.
--   `is_test_user`  en `profiles`: marca a quien tiene permiso de verlas.
--
-- Quien ve lo marcado: **admin, moderador y usuario de prueba**. Nadie más, ni
-- siquiera anónimo, ni siquiera el dueño de la publicación si es un usuario
-- normal (ver más abajo).
--
--
-- POR QUÉ SE COMPONE CON `and` EN LA MISMA POLÍTICA
-- ------------------------------------------------
-- La tentación era añadir una política aparte —"los de prueba los ve quien
-- puede"— y dejar las de 0002/0012 como estaban. **No funciona**: varias
-- políticas de `select` sobre la misma tabla se combinan con `or`, así que la
-- vieja seguiría dejando pasar las filas de prueba a cualquiera. La única forma
-- de que una condición **reste** visibilidad es que viva dentro de la misma
-- política, unida con `and`. Por eso las cuatro se reemplazan enteras.
--
-- Consecuencia que conviene saber de antemano: en `hub_market_items` la rama del
-- dueño (`seller_id = auth.uid()`) también queda bajo el `and`. Si un moderador
-- marca como prueba la publicación de un usuario normal, ese usuario **deja de
-- verla en su propio perfil**. Es lo correcto para lo que se pide —un artículo
-- de prueba lo ve solo quien prueba— pero significa que marcar contenido ajeno
-- no es un gesto inocuo. En la práctica se marca contenido propio, hecho para
-- probar.
--
--
-- CÓMO SE PROTEGEN LAS DOS COLUMNAS
-- ---------------------------------
-- Con el patrón que ya usa el esquema desde 0005, y por la razón de siempre:
-- **RLS no filtra por columna.** Que la política de update diga "solo tu propia
-- fila" o "solo tu publicación" no impide que la fila enviada traiga
-- `is_test_user = true` o `is_test = false`. Se congelan en el trigger:
--
--   · `profiles.is_test_user` — se suma a `freeze_profile_privileges` (0005 →
--     0007 → 0011). La puerta legítima es `set_user_test()`, solo admin.
--     Sin el congelado, cualquiera se auto-marcaría como usuario de prueba y
--     tendría acceso de lectura a todo el contenido oculto. Es una escalada de
--     privilegios, aunque suene menor.
--
--   · `hub_market_items.is_test` — se suma a `freeze_publication_moderation`
--     (0012), pero con **su propia condición**: aquí no hace falta una función
--     `security definer`, basta con dejar pasar a quien modera. Marcar una
--     publicación es un `update` de una columna, no una transición de estado con
--     historial; no hay nada que dejar consistente en una transacción, así que
--     una función sería ceremonia sin contenido. Ver la nota de 0012 sobre por
--     qué `moderate_publication()` sí existe.
--
-- En `hub_parts`, `auto_hub_vehicles` y `news` no hace falta congelar nada: sus
-- políticas de update ya son `solo admin gestiona`, así que la columna está tan
-- protegida como el precio.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Las columnas
-- -----------------------------------------------------------------------------

alter table public.auto_hub_vehicles
  add column if not exists is_test boolean not null default false;
alter table public.hub_parts
  add column if not exists is_test boolean not null default false;
alter table public.hub_market_items
  add column if not exists is_test boolean not null default false;
alter table public.news
  add column if not exists is_test boolean not null default false;

alter table public.profiles
  add column if not exists is_test_user boolean not null default false;

comment on column public.auto_hub_vehicles.is_test is
  'Contenido de prueba: solo lo ven admin, moderador y usuarios de prueba.';
comment on column public.hub_parts.is_test is
  'Contenido de prueba: solo lo ven admin, moderador y usuarios de prueba.';
comment on column public.hub_market_items.is_test is
  'Contenido de prueba. Lo marca moderador+; el trigger lo congela para el resto.';
comment on column public.news.is_test is
  'Contenido de prueba: solo lo ven admin, moderador y usuarios de prueba.';
comment on column public.profiles.is_test_user is
  'Puede ver el contenido de prueba. Solo lo cambia set_user_test(); el trigger lo congela.';


-- -----------------------------------------------------------------------------
-- 2. Quién ve lo de prueba
-- -----------------------------------------------------------------------------
-- `security definer` por lo mismo que las otras dos: lee `profiles`, y sin eso
-- su propia política de lectura entraría en recursión.
--
-- Se apoya en `is_moderator_or_admin()` (0011) en vez de repetir la comparación
-- de roles: la jerarquía se escribe una vez y no hay dos sitios donde
-- equivocarse. Un admin puede lo que puede un moderador, y los dos pueden ver lo
-- que ve un usuario de prueba.

create or replace function public.can_see_test_items()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_moderator_or_admin()
     or coalesce(
          (select p.is_test_user from public.profiles p where p.id = auth.uid()),
          false
        );
$$;

comment on function public.can_see_test_items() is
  'true para admin, moderador y usuarios de prueba. Nadie mas ve las filas is_test.';


-- -----------------------------------------------------------------------------
-- 3. Visibilidad: las cuatro políticas de select, recompuestas
-- -----------------------------------------------------------------------------
-- Cada una conserva **tal cual** la condición que ya tenía y le añade el filtro
-- de prueba con `and`. Si algún día cambia una de las condiciones viejas, hay
-- que cambiarla aquí: son estas las políticas que quedan vivas, no las de 0002.

drop policy if exists "vehiculos de Auto Hub visibles para todos" on public.auto_hub_vehicles;

create policy "vehiculos de Auto Hub visibles para todos"
  on public.auto_hub_vehicles for select
  using (
    (is_available or public.is_admin())
    and (not is_test or public.can_see_test_items())
  );

drop policy if exists "piezas del catalogo visibles para todos" on public.hub_parts;

create policy "piezas del catalogo visibles para todos"
  on public.hub_parts for select
  using (
    (is_active or public.is_admin())
    and (not is_test or public.can_see_test_items())
  );

drop policy if exists "noticias visibles para todos" on public.news;

create policy "noticias visibles para todos"
  on public.news for select
  using (
    (is_published or public.is_admin())
    and (not is_test or public.can_see_test_items())
  );

-- La de Hub Market es la que hay que leer con cuidado: dentro del paréntesis van
-- las tres ramas de 0012 (público, dueño, moderación) y **todas** quedan bajo el
-- filtro de prueba. Una publicación pendiente y de prueba la ve quien modera; su
-- dueño, si es un usuario normal, no.
drop policy if exists "publicaciones aprobadas visibles para todos" on public.hub_market_items;

create policy "publicaciones aprobadas visibles para todos"
  on public.hub_market_items for select
  using (
    (
      (is_active and status = 'aprobado')
      or seller_id = auth.uid()
      or public.is_moderator_or_admin()
    )
    and (not is_test or public.can_see_test_items())
  );


-- -----------------------------------------------------------------------------
-- 4. Congelar `profiles.is_test_user`
-- -----------------------------------------------------------------------------
-- Se extiende el trigger de 0005 (redefinido en 0007 y en 0011), no se crea
-- otro: es la misma regla —"desde el navegador no se cambian privilegios"— y
-- tenerla en dos funciones es cómo se termina arreglando una y olvidando la
-- otra. El resto del cuerpo es idéntico al de 0011.

create or replace function public.freeze_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('app.allow_privilege_change', true), '') <> 'on' then
    new.role         := old.role;
    new.is_admin     := old.is_admin;
    new.is_verified  := old.is_verified;
    new.is_test_user := old.is_test_user;
  end if;

  -- El espejo se deriva siempre, incluso para service_role: es lo que garantiza
  -- que las dos columnas no puedan discrepar por ningún camino.
  new.is_admin := (new.role = 'admin');

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Congelar `hub_market_items.is_test`
-- -----------------------------------------------------------------------------
-- Se extiende el trigger de 0012 con una condición aparte, porque la regla es
-- distinta: las columnas de moderación las mueve **solo** `moderate_publication()`
-- (ni siquiera un moderador con un update suelto), mientras que `is_test` sí la
-- puede escribir quien modera, directamente. Marcar algo como prueba no tiene
-- historial que mantener.

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
  end if;

  -- El dueño de una publicación no decide si es de prueba: si pudiera, se
  -- escondería a sí mismo del sitio o sacaría a la luz lo que el equipo dejó
  -- oculto. La política de update deja escribir al dueño **y** a quien modera,
  -- y RLS no sabe distinguir columnas; esto sí.
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_moderator_or_admin() then
    new.is_test := old.is_test;
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Marcar a un usuario como usuario de prueba — solo un admin
-- -----------------------------------------------------------------------------
-- Función aparte y no un parámetro más de `set_user_role()`: ser usuario de
-- prueba **no es un rol**. Un usuario de prueba sigue siendo `user` a todos los
-- efectos —no modera, no administra— y lo único que gana es ver el contenido
-- marcado. Mezclarlo con el rol obligaría a mandar los dos valores juntos en
-- cada cambio y a explicar por qué "moderador de prueba" no significa nada.
--
-- **Es admin, no moderador**: ver el contenido oculto es un permiso de lectura
-- sobre algo que el equipo decidió esconder, y repartirlo es repartir acceso.
-- Misma línea que `set_user_role()`, que tampoco deja nombrar a un moderador.
--
-- No hay protección de "no te lo quites a ti mismo", al revés que con el rol: un
-- admin ve el contenido de prueba por ser admin, así que quitarse la marca no lo
-- deja fuera de nada.

create or replace function public.set_user_test(
  p_user_id uuid,
  p_is_test boolean
)
returns table (id uuid, display_name text, is_test_user boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede marcar usuarios de prueba.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where profiles.id = p_user_id) then
    raise exception 'Ese usuario no existe.' using errcode = '22023';
  end if;

  perform set_config('app.allow_privilege_change', 'on', true);

  update public.profiles p
     set is_test_user = coalesce(p_is_test, false)
   where p.id = p_user_id;

  perform set_config('app.allow_privilege_change', 'off', true);

  return query
    select p.id, p.display_name, p.is_test_user
    from public.profiles p
    where p.id = p_user_id;
end;
$$;

revoke all on function public.set_user_test(uuid, boolean) from public;
grant execute on function public.set_user_test(uuid, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 7. La marca en las funciones que ya lee el panel
-- -----------------------------------------------------------------------------
-- Las dos se redefinen enteras porque en Postgres no se puede añadir una columna
-- al `returns table` de una función existente sin volver a crearla. El cuerpo es
-- el de 0011 más `is_test_user`.

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id           uuid,
  display_name text,
  email        text,
  phone        text,
  location     text,
  role         text,
  is_admin     boolean,
  is_verified  boolean,
  is_test_user boolean,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los usuarios.' using errcode = '42501';
  end if;

  return query
    select p.id, p.display_name, p.email, p.phone, p.location,
           p.role, p.is_admin, p.is_verified, p.is_test_user, p.created_at
    from public.profiles p
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;


-- `get_my_profile()` lleva la marca al cliente. La necesita para dos cosas: el
-- modo simulado, que filtra por su cuenta porque ahí no hay RLS, y el distintivo
-- "PRUEBA" de las tarjetas.
drop function if exists public.get_my_profile();

create or replace function public.get_my_profile()
returns table (
  id           uuid,
  display_name text,
  email        text,
  phone        text,
  location     text,
  avatar_url   text,
  role         text,
  is_verified  boolean,
  is_admin     boolean,
  is_test_user boolean,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitas una sesion para ver tu perfil.' using errcode = '42501';
  end if;

  return query
    select p.id, p.display_name, p.email, p.phone, p.location,
           p.avatar_url, p.role, p.is_verified, p.is_admin, p.is_test_user, p.created_at
    from public.profiles p
    where p.id = v_uid;
end;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;


-- -----------------------------------------------------------------------------
-- 8. Comprar una pieza de prueba
-- -----------------------------------------------------------------------------
-- Un usuario de prueba **tiene** que poder comprarla: probar el checkout es
-- justo para lo que existe la marca. Eso ya funciona sin tocar nada, porque
-- `create_order()` es `security definer` y lee `hub_parts` saltándose RLS.
--
-- Y ese mismo hecho es el problema: al saltarse RLS, la función también le
-- vendería la pieza a quien no puede verla, si adivina el id. La visibilidad no
-- alcanza cuando hay una puerta que no la consulta. Se añade la condición al
-- join del subtotal, junto a `h.is_active`, y quien no deba ver la pieza recibe
-- el mismo mensaje que si estuviera descatalogada.
--
-- El segundo join (el de las líneas del pedido) no la necesita: solo se ejecuta
-- cuando el primero ya validó que todas las piezas cuentan.

create or replace function public.create_order(
  p_contact_email      text,
  p_full_name          text,
  p_address_line1      text,
  p_shipping_option_id text,
  p_payment_method_id  text,
  p_items              jsonb,
  p_contact_phone      text default null,
  p_city               text default null,
  p_postal_code        text default null,
  p_order_notes        text default null
)
returns table (id uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id       uuid;
  v_subtotal       numeric(12,2);
  v_shipping_price numeric(12,2);
  v_total          numeric(12,2);
  v_item_count     integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Un pedido necesita al menos una pieza.' using errcode = '22023';
  end if;

  -- El envío sale de la tabla, no del navegador.
  select s.price into v_shipping_price
  from public.shipping_options s
  where s.id = p_shipping_option_id and s.is_active;

  if v_shipping_price is null then
    raise exception 'Metodo de envio no valido.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.payment_methods m
    where m.id = p_payment_method_id and m.is_active
  ) then
    raise exception 'Metodo de pago no valido.' using errcode = '22023';
  end if;

  -- Subtotal calculado contra el catálogo. Solo piezas activas, con stock y que
  -- quien compra pueda ver.
  select
    coalesce(sum(h.price * i.quantity), 0),
    count(*)
  into v_subtotal, v_item_count
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h
    on h.id = i.part_id
   and h.is_active
   and (not h.is_test or public.can_see_test_items())
  where i.quantity > 0;

  if v_item_count <> jsonb_array_length(p_items) then
    raise exception 'Alguna pieza del carrito ya no esta disponible.' using errcode = '22023';
  end if;

  v_total := v_subtotal + v_shipping_price;

  insert into public.orders (
    user_id, contact_email, contact_phone, full_name, address_line1,
    city, postal_code, shipping_option_id, payment_method_id, order_notes,
    subtotal, shipping_price, total
  ) values (
    auth.uid(), p_contact_email, p_contact_phone, p_full_name, p_address_line1,
    p_city, p_postal_code, p_shipping_option_id, p_payment_method_id, p_order_notes,
    v_subtotal, v_shipping_price, v_total
  )
  returning orders.id into v_order_id;

  -- El nombre y el precio se congelan aquí, como ya documentaba el esquema.
  insert into public.order_items (order_id, part_id, name, unit_price, quantity)
  select v_order_id, h.id, h.name, h.price, i.quantity
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h on h.id = i.part_id;

  return query select v_order_id, v_total;
end;
$$;

revoke all on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text
) from public;

grant execute on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text
) to anon, authenticated;
