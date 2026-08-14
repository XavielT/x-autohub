-- =============================================================================
-- X AutoHub — Correcciones de seguridad
-- =============================================================================
--
-- Tres problemas encontrados al auditar el backend ya conectado (agosto 2026).
-- Los tres se verificaron contra la base real antes de escribir esto.
--
--   1. CRÍTICO — Escalada de privilegios. Cualquier usuario registrado podía
--      hacerse admin editando su propio perfil.
--   2. CRÍTICO — Precios controlados por el cliente. El navegador enviaba
--      `total`, `subtotal` y `unit_price`; nada los verificaba contra el
--      catálogo.
--   3. El checkout de invitado estaba roto: el pedido se creaba pero la app
--      fallaba después, así que un reintento generaba pedidos duplicados.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Escalada de privilegios en profiles
-- -----------------------------------------------------------------------------
-- La política de update solo comprobaba `auth.uid() = id`, es decir "estás
-- editando tu propia fila". Nada impedía que esa fila incluyera
-- `is_admin = true`. Verificado: un usuario recién registrado se auto-promovió
-- y con esa sesión cambió el precio de una pieza del catálogo a RD$ 1.
--
-- RLS no distingue columnas, así que el candado va en un trigger: `is_admin` e
-- `is_verified` solo los puede mover la clave `service_role` (es decir,
-- scripts/make-admin.mjs o el SQL Editor), nunca una sesión del navegador.
--
-- Congela los valores en silencio en vez de lanzar un error: así una edición
-- normal de perfil que reenvíe el objeto completo sigue funcionando.

create or replace function public.freeze_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.is_admin    := old.is_admin;
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_freeze_privileges on public.profiles;

create trigger profiles_freeze_privileges
  before update on public.profiles
  for each row execute function public.freeze_profile_privileges();


-- -----------------------------------------------------------------------------
-- 2 y 3. Creación de pedidos: precios del servidor y checkout de invitado
-- -----------------------------------------------------------------------------
-- El problema del invitado: un pedido con `user_id is null` no lo puede leer
-- nadie (la política de select pide `user_id = auth.uid()`, y NULL = NULL no es
-- verdadero). Eso rompía dos cosas del cliente:
--
--   a) `.insert(...).select().single()` devolvía 42501 aunque el pedido sí se
--      había creado.
--   b) El insert en `order_items` fallaba, porque su `with check` consulta
--      `orders` y esa subconsulta también pasa por RLS.
--
-- La solución es una función `security definer` que hace todo en una sola
-- transacción. De paso arregla el problema de los precios: el cliente ya solo
-- manda qué pieza y cuántas; el precio, el subtotal y el envío salen del
-- catálogo. Un cliente manipulado no puede comprar a RD$ 1.

create or replace function public.create_order(
  p_contact_email      text,
  p_full_name          text,
  p_address_line1      text,
  p_shipping_option_id text,
  p_payment_method_id  text,
  p_items              jsonb,          -- [{"part_id": 1, "quantity": 2}, ...]
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

  -- Subtotal calculado contra el catálogo. Solo piezas activas y con stock.
  select
    coalesce(sum(h.price * i.quantity), 0),
    count(*)
  into v_subtotal, v_item_count
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h on h.id = i.part_id and h.is_active
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

-- La función es el único camino para crear pedidos desde el navegador.
revoke all on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text
) from public;

grant execute on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text
) to anon, authenticated;

-- Con la función en su lugar, el cliente ya no inserta directo en estas tablas.
-- Se quitan los permisos de insert para que no quede un camino alterno donde el
-- navegador vuelva a decidir el precio.
drop policy if exists "cualquiera puede crear un pedido" on public.orders;
drop policy if exists "las lineas se insertan con su pedido" on public.order_items;
