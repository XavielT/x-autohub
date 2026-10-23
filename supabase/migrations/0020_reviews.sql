-- =============================================================================
-- X AutoHub — Reseñas verificadas de productos y servicios (pivote, fase 7)
-- =============================================================================
--
-- Hasta aquí la ficha decía "Aún no hay reseñas" y las estrellas de cada pieza eran
-- un número sembrado a mano. Esta migración trae las reseñas de verdad:
--
--   1. `reviews`: una reseña por usuario y objetivo (un producto o un servicio), de 1
--      a 5 estrellas y un comentario.
--   2. `is_verified_purchase` **la calcula Postgres**, nunca el navegador: un trigger
--      BEFORE INSERT mira si esa persona tiene un pedido `delivered` con ese producto,
--      o una cita `done` con ese servicio. Lo que mande el cliente en esa columna se
--      pisa.
--   3. Un trigger recalcula `hub_parts.stars_rating` (el promedio) y
--      `hub_parts.review_count` cada vez que entra o sale una reseña de producto.
--   4. `review_stats()`: promedio y distribución 5→1 de un objetivo, en una llamada.
--
--
-- LO QUE SE DECIDIÓ
-- ------------------
-- · **Sin compra verificada también se puede reseñar**, pero sin la etiqueta. Exigir
--   compra habría dejado el bloque vacío durante meses; la etiqueta es lo que separa
--   una opinión de una compra comprobada, y el listado pone primero las verificadas.
--
-- · **No hay UPDATE.** Ni política ni permiso: una reseña no se edita, se borra y se
--   vuelve a escribir. Editarla obligaría a congelar `is_verified_purchase`,
--   `target_*` y `user_id` con un trigger (RLS no filtra por columna), y la
--   alternativa —que no exista el camino— es más simple y no se puede equivocar.
--
-- · **Borra el autor o el admin.** El admin no puede escribir reseñas ajenas ni
--   editarlas, solo quitarlas (moderación).
--
-- · **Las estrellas sembradas se conservan** como `stars_seed`: mientras un producto
--   no tenga reseñas reales, `stars_rating` sigue siendo ese valor. Con la primera
--   reseña pasa a ser el promedio real; si se borra la última, vuelve al sembrado.
--   `review_count` es lo que distingue uno del otro: **solo un contador mayor que 0
--   significa que hay opiniones reales** (el JSON-LD de la ficha lo usa así).
--
-- · `target_id` no es una clave foránea (apunta a dos tablas). Lo suple el trigger de
--   entrada, que rechaza un objetivo inexistente, y dos triggers de borrado que se
--   llevan las reseñas de lo que se elimina.
--
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES
-- ------------------------------------------
-- El backfill de `stars_seed` solo toca filas sin sembrar y sin reseñas, así que
-- repetirla no pisa el promedio real de un producto que ya tenga opiniones.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Estrellas sembradas y contador en hub_parts
-- -----------------------------------------------------------------------------

alter table public.hub_parts
  add column if not exists stars_seed   numeric(2,1) not null default 0,
  add column if not exists review_count integer      not null default 0;

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_stars_seed_check check (stars_seed between 0 and 5);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_review_count_check check (review_count >= 0);
exception when duplicate_object then null;
end
$$;

-- Lo que hay hoy en `stars_rating` es el dato sembrado. Solo se copia si todavía no
-- se copió (`stars_seed = 0`) y nadie ha reseñado (`review_count = 0`): al volver a
-- aplicar la migración, un promedio real nunca se toma por sembrado.
update public.hub_parts
   set stars_seed = stars_rating
 where stars_seed = 0
   and review_count = 0
   and stars_rating > 0;

comment on column public.hub_parts.stars_seed is
  'Estrellas de antes de las reseñas (dato sembrado). stars_rating vuelve a este valor si el producto se queda sin reseñas.';
comment on column public.hub_parts.review_count is
  'Cuántas reseñas reales tiene (las mantiene un trigger). Mayor que 0 = stars_rating es un promedio real, no el sembrado.';

-- Una pieza nueva entra con sus estrellas sembradas (el seed y el panel las mandan en
-- `stars_rating`): el sembrado es lo que traiga al entrar. Función aparte: no se toca
-- `hub_parts_fill_defaults()` (0017).
create or replace function public.hub_parts_seed_stars()
returns trigger
language plpgsql
as $$
begin
  if new.stars_seed = 0 then
    new.stars_seed := new.stars_rating;
  end if;
  return new;
end;
$$;

drop trigger if exists hub_parts_seed_stars on public.hub_parts;
create trigger hub_parts_seed_stars
  before insert on public.hub_parts
  for each row execute function public.hub_parts_seed_stars();


-- -----------------------------------------------------------------------------
-- 2. La tabla
-- -----------------------------------------------------------------------------

do $$
begin
  create type public.review_target as enum ('product', 'service');
exception when duplicate_object then null;
end
$$;

create table if not exists public.reviews (
  id                   bigint generated by default as identity primary key,
  target_type          public.review_target not null,
  -- Sin clave foránea: apunta a hub_parts o a services según `target_type`.
  target_id            bigint       not null,
  user_id              uuid         not null references public.profiles(id) on delete cascade,
  rating               smallint     not null check (rating between 1 and 5),
  comment              text         not null default '' check (char_length(comment) <= 1000),
  -- La calcula el trigger de abajo. Lo que mande el cliente aquí se descarta.
  is_verified_purchase boolean      not null default false,
  created_at           timestamptz  not null default now(),

  constraint reviews_one_per_user unique (target_type, target_id, user_id)
);

-- El listado: las verificadas primero, y dentro de cada grupo las más nuevas.
create index if not exists reviews_target_idx
  on public.reviews (target_type, target_id, is_verified_purchase desc, created_at desc);
create index if not exists reviews_user_idx on public.reviews (user_id);

comment on table public.reviews is
  'Reseñas de productos y servicios. Sin UPDATE: se borran y se vuelven a escribir.';


-- -----------------------------------------------------------------------------
-- 3. Al entrar: validar el objetivo y calcular la compra verificada
-- -----------------------------------------------------------------------------

create or replace function public.reviews_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.comment := btrim(coalesce(new.comment, ''));
  new.created_at := now();

  if new.target_type = 'product' then
    if not exists (select 1 from public.hub_parts p where p.id = new.target_id and p.is_active) then
      raise exception 'Ese producto no existe.' using errcode = '22023';
    end if;

    -- Un pedido entregado con este producto, de esta persona. Los pedidos de
    -- invitado (user_id nulo) nunca cuentan: no hay a quién atribuirlos.
    new.is_verified_purchase := exists (
      select 1
      from public.orders o
      join public.order_items i on i.order_id = o.id
      where o.user_id = new.user_id
        and o.status = 'delivered'
        and i.part_id = new.target_id
    );
  else
    if not exists (select 1 from public.services s where s.id = new.target_id and s.is_active) then
      raise exception 'Ese servicio no existe.' using errcode = '22023';
    end if;

    new.is_verified_purchase := exists (
      select 1
      from public.service_appointments a
      where a.user_id = new.user_id
        and a.service_id = new.target_id
        and a.status = 'done'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_prepare on public.reviews;
create trigger reviews_prepare
  before insert on public.reviews
  for each row execute function public.reviews_prepare();


-- -----------------------------------------------------------------------------
-- 4. Al entrar o salir una reseña: recalcular las estrellas del producto
-- -----------------------------------------------------------------------------

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
  where r.target_type = 'product' and r.target_id = v_id;

  update public.hub_parts p
     set review_count = v_n,
         stars_rating = case when v_n > 0 then v_avg else p.stars_seed end
   where p.id = v_id;

  return null;
end;
$$;

drop trigger if exists reviews_sync_product on public.reviews;
create trigger reviews_sync_product
  after insert or delete on public.reviews
  for each row execute function public.reviews_sync_product();


-- -----------------------------------------------------------------------------
-- 5. Si se borra el producto o el servicio, se van sus reseñas
-- -----------------------------------------------------------------------------

create or replace function public.reviews_cascade_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reviews where target_type = 'product' and target_id = old.id;
  return null;
end;
$$;

create or replace function public.reviews_cascade_service()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.reviews where target_type = 'service' and target_id = old.id;
  return null;
end;
$$;

drop trigger if exists hub_parts_delete_reviews on public.hub_parts;
create trigger hub_parts_delete_reviews
  after delete on public.hub_parts
  for each row execute function public.reviews_cascade_product();

drop trigger if exists services_delete_reviews on public.services;
create trigger services_delete_reviews
  after delete on public.services
  for each row execute function public.reviews_cascade_service();

-- Las funciones de trigger no se llaman a mano. Aun así se cierran con el idiom
-- de siempre: en Supabase `revoke ... from public` no le quita nada a `anon` (grant
-- directo por los default privileges), por eso van las tres líneas.
revoke all on function public.reviews_prepare()         from public, anon, authenticated;
revoke all on function public.reviews_sync_product()    from public, anon, authenticated;
revoke all on function public.reviews_cascade_product() from public, anon, authenticated;
revoke all on function public.reviews_cascade_service() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. RLS: lee cualquiera, escribe el autor, borra el autor o el admin
-- -----------------------------------------------------------------------------

alter table public.reviews enable row level security;

drop policy if exists "las reseñas las lee cualquiera" on public.reviews;
create policy "las reseñas las lee cualquiera"
  on public.reviews for select
  using (true);

drop policy if exists "cada quien escribe su propia reseña" on public.reviews;
create policy "cada quien escribe su propia reseña"
  on public.reviews for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "borra el autor o el admin" on public.reviews;
create policy "borra el autor o el admin"
  on public.reviews for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- No hay política de UPDATE: ya no se puede. Se le quita además el permiso, para que
-- el intento falle con "permission denied" y no con un silencioso "0 filas".
revoke update on public.reviews from anon, authenticated;
-- Un invitado solo lee.
revoke insert, delete on public.reviews from anon;


-- -----------------------------------------------------------------------------
-- 7. review_stats(): promedio y distribución de un objetivo
-- -----------------------------------------------------------------------------

create or replace function public.review_stats(p_target_type public.review_target, p_target_id bigint)
returns table (
  total   integer,
  average numeric,
  c1      integer,
  c2      integer,
  c3      integer,
  c4      integer,
  c5      integer
)
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
  where r.target_type = p_target_type and r.target_id = p_target_id;
$$;

comment on function public.review_stats(public.review_target, bigint) is
  'Promedio (1 decimal) y cuántas reseñas hay de cada estrella. La puede llamar un invitado: la lectura de reseñas es pública.';

-- `security invoker` y de lectura pública: `anon` y `authenticated` la ejecutan.
revoke all on function public.review_stats(public.review_target, bigint) from public;
grant execute on function public.review_stats(public.review_target, bigint) to anon, authenticated;
