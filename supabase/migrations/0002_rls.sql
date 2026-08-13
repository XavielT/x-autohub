-- =============================================================================
-- X AutoHub — Row Level Security
-- =============================================================================
-- La app se conecta con la clave `anon`, que es pública por diseño. Lo único
-- que protege los datos son estas políticas. Sin ellas, cualquiera con la clave
-- (visible en el bundle del navegador) podría borrar la base completa.
--
-- Principio por tabla:
--   · Inventario propio (auto_hub_vehicles, hub_parts, news, services,
--     social_clubs, social_events) → lectura pública, escritura solo admin.
--   · Contenido de la comunidad (hub_market_items, social_posts) → lectura
--     pública, y cada quien solo toca lo suyo.
--   · Datos personales (orders, club_subscriptions) → nadie los lee en público.
-- =============================================================================

alter table public.profiles           enable row level security;
alter table public.auto_hub_vehicles  enable row level security;
alter table public.hub_parts          enable row level security;
alter table public.hub_market_items   enable row level security;
alter table public.services           enable row level security;
alter table public.news               enable row level security;
alter table public.social_clubs       enable row level security;
alter table public.social_posts       enable row level security;
alter table public.social_events      enable row level security;
alter table public.club_subscriptions enable row level security;
alter table public.shipping_options   enable row level security;
alter table public.payment_methods    enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;

-- Helper: ¿el usuario actual es admin?
-- security definer para que la función pueda leer profiles sin que su propia
-- política de lectura entre en recursión.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Lectura pública: la app muestra el nombre del vendedor en cada publicación.
-- Nota: esto expone display_name y email de todos los perfiles. Si el correo
-- debe quedar privado, muévelo a una tabla aparte o usa una vista.
create policy "profiles son visibles para todos"
  on public.profiles for select using (true);

create policy "cada usuario edita su propio perfil"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- El insert lo hace el trigger handle_new_user (security definer), no el cliente.

-- -----------------------------------------------------------------------------
-- Inventario propio: lectura pública, escritura solo admin
-- -----------------------------------------------------------------------------
create policy "vehiculos de Auto Hub visibles para todos"
  on public.auto_hub_vehicles for select using (is_available or public.is_admin());
create policy "solo admin gestiona los vehiculos de Auto Hub"
  on public.auto_hub_vehicles for all
  using (public.is_admin()) with check (public.is_admin());

create policy "piezas del catalogo visibles para todos"
  on public.hub_parts for select using (is_active or public.is_admin());
create policy "solo admin gestiona el catalogo"
  on public.hub_parts for all
  using (public.is_admin()) with check (public.is_admin());

create policy "servicios visibles para todos"
  on public.services for select using (is_active or public.is_admin());
create policy "solo admin gestiona los servicios"
  on public.services for all
  using (public.is_admin()) with check (public.is_admin());

create policy "noticias visibles para todos"
  on public.news for select using (is_published or public.is_admin());
create policy "solo admin gestiona las noticias"
  on public.news for all
  using (public.is_admin()) with check (public.is_admin());

create policy "clubes visibles para todos"
  on public.social_clubs for select using (true);
create policy "solo admin gestiona los clubes"
  on public.social_clubs for all
  using (public.is_admin()) with check (public.is_admin());

create policy "eventos visibles para todos"
  on public.social_events for select using (true);
create policy "solo admin gestiona los eventos"
  on public.social_events for all
  using (public.is_admin()) with check (public.is_admin());

create policy "opciones de envio visibles para todos"
  on public.shipping_options for select using (is_active);
create policy "solo admin gestiona las opciones de envio"
  on public.shipping_options for all
  using (public.is_admin()) with check (public.is_admin());

create policy "metodos de pago visibles para todos"
  on public.payment_methods for select using (is_active);
create policy "solo admin gestiona los metodos de pago"
  on public.payment_methods for all
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- HUB MARKET — cada usuario administra solo sus publicaciones
-- -----------------------------------------------------------------------------
create policy "publicaciones de Hub Market visibles para todos"
  on public.hub_market_items for select
  using (is_active or seller_id = auth.uid() or public.is_admin());

-- with check obliga a que seller_id sea el propio usuario: nadie puede publicar
-- en nombre de otro.
create policy "usuarios autenticados publican en su nombre"
  on public.hub_market_items for insert
  to authenticated
  with check (seller_id = auth.uid());

create policy "cada usuario edita sus publicaciones"
  on public.hub_market_items for update
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

create policy "cada usuario borra sus publicaciones"
  on public.hub_market_items for delete
  using (seller_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- SOCIAL HUB — mismo criterio para las publicaciones del feed
-- -----------------------------------------------------------------------------
create policy "publicaciones del feed visibles para todos"
  on public.social_posts for select using (true);

create policy "usuarios autenticados publican en el feed"
  on public.social_posts for insert
  to authenticated
  with check (author_id = auth.uid());

create policy "cada usuario edita sus publicaciones del feed"
  on public.social_posts for update
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy "cada usuario borra sus publicaciones del feed"
  on public.social_posts for delete
  using (author_id = auth.uid() or public.is_admin());

-- -----------------------------------------------------------------------------
-- Datos personales — se escriben pero no se leen en público
-- -----------------------------------------------------------------------------
-- Cualquiera puede suscribirse desde el home, incluso sin cuenta.
create policy "cualquiera puede suscribirse al club"
  on public.club_subscriptions for insert
  to anon, authenticated
  with check (true);
-- Sin política de select: la lista de correos no se puede leer con la clave anon.
create policy "solo admin lee las suscripciones"
  on public.club_subscriptions for select using (public.is_admin());

-- Checkout de invitado permitido; leer el pedido solo si es tuyo.
create policy "cualquiera puede crear un pedido"
  on public.orders for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

create policy "cada usuario ve sus pedidos"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());

create policy "solo admin actualiza el estado de los pedidos"
  on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

create policy "las lineas se insertan con su pedido"
  on public.order_items for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id is null or o.user_id = auth.uid())
    )
  );

create policy "cada usuario ve las lineas de sus pedidos"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.user_id = auth.uid() or public.is_admin())
    )
  );
