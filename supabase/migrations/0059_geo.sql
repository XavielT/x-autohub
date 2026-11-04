-- =============================================================================
-- X AutoHub — Direcciones con coordenadas (Google Maps, del lado del servidor)
-- =============================================================================
--
-- Autocompletar y normalizar la dirección de envío en el checkout, y guardar dónde cae (lat, lng, place_id, dirección formateada) para que el equipo pueda abrirla
-- en Google Maps. TODO pasa por Edge Functions (`maps-autocomplete`, `maps-geocode`, `ai-normalize-address`) con la clave de SERVIDOR: ninguna clave en el navegador y la
-- CSP no se toca. El costo de Google se cuenta en `ai_usage` con features `maps_*` contra `maps_monthly_cap_usd` (migración 0050).
--
--   · `orders.shipping_geo` (jsonb): { lat, lng, place_id, formatted, province, municipality, sector, geo_confidence }. NUNCA bloquea un pedido: nace nulo.
--   · `set_order_geo()`: lo guarda desde el navegador DESPUÉS de crear el pedido (así no se toca la firma de `create_order()`, que obligaría a retirar la anterior:
--     PGRST203). Mismo modelo de seguridad que `attach_payment_proof()`: el uuid del pedido es la llave, y solo mientras el pedido siga sin pagar y sin coordenadas.
--
-- La dirección del taller (y su "Cómo llegar") vive en el ajuste `pickup_address`, que ya existía como objeto jsonb: ahora admite `lat`, `lng` y `place_id`
-- (no hace falta migración: el valor es jsonb; se edita en /admin/ajustes).
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

alter table public.orders add column if not exists shipping_geo jsonb;

alter table public.orders drop constraint if exists orders_shipping_geo_check;
alter table public.orders
  add constraint orders_shipping_geo_check check (
    shipping_geo is null
    or (
      jsonb_typeof(shipping_geo) = 'object'
      and (shipping_geo ->> 'lat')::numeric between -90 and 90
      and (shipping_geo ->> 'lng')::numeric between -180 and 180
      and coalesce(shipping_geo ->> 'geo_confidence', 'media') in ('alta', 'media', 'baja')
      and char_length(coalesce(shipping_geo ->> 'formatted', '')) <= 300
    )
  );

comment on column public.orders.shipping_geo is
  'Dónde cae la dirección de envío: { lat, lng, place_id, formatted, province, municipality, sector, geo_confidence }. La normaliza una Edge Function; nunca bloquea un pedido.';

create or replace function public.set_order_geo(p_order_id uuid, p_geo jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean jsonb;
begin
  if p_geo is null or jsonb_typeof(p_geo) <> 'object' then
    return false;
  end if;

  -- Solo lo que se espera, con largos acotados: lo demás se descarta.
  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'lat',            (p_geo ->> 'lat')::numeric,
    'lng',            (p_geo ->> 'lng')::numeric,
    'place_id',       left(p_geo ->> 'place_id', 200),
    'formatted',      left(p_geo ->> 'formatted', 300),
    'province',       left(p_geo ->> 'province', 80),
    'municipality',   left(p_geo ->> 'municipality', 80),
    'sector',         left(p_geo ->> 'sector', 80),
    'reference',      left(p_geo ->> 'reference', 160),
    'geo_confidence', coalesce(nullif(p_geo ->> 'geo_confidence', ''), 'media')
  ));

  -- Solo un pedido que todavía no se paga ni se prepara, y que no tiene coordenadas: no se le reescribe la entrega a un pedido en marcha.
  update public.orders o
     set shipping_geo = v_clean
   where o.id = p_order_id
     and o.shipping_geo is null
     and o.status in ('pending', 'awaiting_payment')
     and o.fulfillment_type = 'shipping';
  return found;
exception when others then
  -- Un dato mal formado no puede romper el cierre del pedido: simplemente no se guarda.
  return false;
end;
$$;

revoke all on function public.set_order_geo(uuid, jsonb) from public;
grant execute on function public.set_order_geo(uuid, jsonb) to anon, authenticated;

-- La dirección del taller admite coordenadas: lat y lng, si vienen, tienen que ser números dentro de rango.
alter table public.site_settings drop constraint if exists site_settings_pickup_geo_valid;
alter table public.site_settings
  add constraint site_settings_pickup_geo_valid check (
    key <> 'pickup_address'
    or (
      (not (value ? 'lat') or (jsonb_typeof(value -> 'lat') = 'number' and (value ->> 'lat')::numeric between -90 and 90))
      and (not (value ? 'lng') or (jsonb_typeof(value -> 'lng') = 'number' and (value ->> 'lng')::numeric between -180 and 180))
    )
  ) not valid;
alter table public.site_settings validate constraint site_settings_pickup_geo_valid;
