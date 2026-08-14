-- =============================================================================
-- X AutoHub — El correo y el teléfono de los perfiles dejan de ser públicos
-- =============================================================================
--
-- La política `"profiles son visibles para todos"` es `using (true)`, y la tabla
-- guarda `email` y `phone`. Como la clave anon es pública por diseño (viaja en
-- el bundle del navegador), cualquiera podía descargar el correo y el teléfono
-- de todos los usuarios registrados con una sola petición. La migración 0002 ya
-- lo advertía en un comentario.
--
-- La lectura pública del perfil se necesita de verdad: el nombre del vendedor
-- aparece en cada publicación de Hub Market y en cada post del Social Hub. Lo
-- que no se necesita es el correo ni el teléfono.
--
-- RLS no sabe filtrar por columna, así que el candado va con permisos de
-- columna, que PostgREST sí respeta. Es más simple que una vista aparte y no
-- obliga a reescribir los `select` con embed que ya funcionan
-- (`*, profiles(display_name)`), porque esos solo piden columnas permitidas.
--
-- Efecto en la app: `auth.service.ts` ya no puede hacer `select('*')` sobre
-- profiles. Pide las columnas públicas y toma el correo de la sesión de Supabase
-- Auth, que es la fuente autoritativa de todos modos.
-- =============================================================================

revoke select on public.profiles from anon, authenticated;

grant select (id, display_name, avatar_url, is_verified, location, created_at, is_admin)
  on public.profiles to anon, authenticated;

-- El usuario sí puede seguir editando su propio perfil, incluidos correo y
-- teléfono: el update lo limita la política de 0002 (`auth.uid() = id`), y el
-- trigger de 0005 impide que se toque `is_admin` / `is_verified`.
grant update (display_name, avatar_url, location, phone, email)
  on public.profiles to authenticated;


-- -----------------------------------------------------------------------------
-- Mensaje más claro para una cantidad inválida en create_order
-- -----------------------------------------------------------------------------
-- Una cantidad <= 0 se filtraba junto con las piezas inexistentes, así que el
-- usuario veía "Alguna pieza del carrito ya no esta disponible", que no explica
-- nada. Se comprueba aparte.
--
-- Nota: 0005 ya está ejecutada, así que la función se redefine aquí en vez de
-- editar aquel archivo.

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

  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
    where i.quantity is null or i.quantity <= 0
  ) then
    raise exception 'La cantidad de cada pieza tiene que ser mayor que cero.' using errcode = '22023';
  end if;

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

  select coalesce(sum(h.price * i.quantity), 0), count(*)
  into v_subtotal, v_item_count
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h on h.id = i.part_id and h.is_active;

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

  insert into public.order_items (order_id, part_id, name, unit_price, quantity)
  select v_order_id, h.id, h.name, h.price, i.quantity
  from jsonb_to_recordset(p_items) as i(part_id bigint, quantity integer)
  join public.hub_parts h on h.id = i.part_id;

  return query select v_order_id, v_total;
end;
$$;

grant execute on function public.create_order(
  text, text, text, text, text, jsonb, text, text, text, text
) to anon, authenticated;
