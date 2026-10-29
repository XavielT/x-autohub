-- 0048 — suggest_products(): la marca también perdona errores de tecleo.
--
-- La 0042 comparaba por trigramas solo con el nombre del producto, así que "brenbo" no encontraba
-- los Brembo cuando la marca no está en el nombre. Mismo contrato (columnas y permisos); solo
-- cambia el puntaje. `create or replace` no toca los grants.

create or replace function public.suggest_products(
  p_query text,
  p_limit integer default 6
)
returns table (
  id            bigint,
  slug          text,
  name          text,
  brand         text,
  img_url       text,
  price         numeric,
  stock         integer,
  fulfillment   public.product_fulfillment,
  matched_alias text,
  score         real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (
    select
      lower(public.xah_unaccent(btrim(coalesce(p_query, '')))) as norm,
      -- Patrón de prefijo, con \, % y _ escapados para que "100%" no sea comodín.
      replace(replace(replace(
        lower(public.xah_unaccent(btrim(coalesce(p_query, '')))),
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as prefix
  ),
  scored as (
    select
      p.id, p.slug, p.name, p.brand, p.img_url, p.price, p.stock, p.fulfillment,
      -- El mejor alias, solo si le gana al nombre.
      (
        select a.alias
          from public.product_aliases a
         where a.product_id = p.id
           and (
             lower(public.xah_unaccent(a.alias)) like q.prefix
             or lower(public.xah_unaccent(a.alias)) like '% ' || q.prefix
             or similarity(lower(public.xah_unaccent(a.alias)), q.norm) > 0.3
           )
         order by similarity(lower(public.xah_unaccent(a.alias)), q.norm) desc, a.id
         limit 1
      ) as alias_hit,
      greatest(
        -- Empieza igual: lo más relevante.
        case when lower(public.xah_unaccent(p.name))  like q.prefix then 1.0 else 0 end,
        case when lower(public.xah_unaccent(p.brand)) like q.prefix then 0.9 else 0 end,
        case when p.sku ilike q.prefix                              then 0.9 else 0 end,
        -- Una palabra del nombre empieza igual ("frenos" en "Discos de frenos").
        case when lower(public.xah_unaccent(p.name)) like '% ' || q.prefix then 0.8 else 0 end,
        similarity(lower(public.xah_unaccent(p.name)), q.norm),
        word_similarity(q.norm, lower(public.xah_unaccent(p.name))),
        -- La marca también perdona errores de tecleo ("brenbo" → Brembo).
        0.9 * similarity(lower(public.xah_unaccent(p.brand)), q.norm)
      ) as name_score
    from public.hub_parts p
    cross join q
    where p.is_active
      and char_length(q.norm) >= 2
  )
  select
    s.id, s.slug, s.name, s.brand, s.img_url, s.price, s.stock, s.fulfillment,
    case when s.name_score >= 0.5 then null else s.alias_hit end as matched_alias,
    greatest(
      s.name_score,
      case when s.alias_hit is not null then 0.6 else 0 end
    )::real as score
  from scored s
  where s.name_score >= 0.3 or s.alias_hit is not null
  order by score desc, s.name
  limit greatest(1, least(coalesce(p_limit, 6), 20));
$$;

comment on function public.suggest_products(text, integer) is
  'Sugerencias del buscador: prefijo, trigramas y alias. matched_alias dice qué alias coincidió cuando el nombre no. security invoker: RLS decide qué ve quien llama.';
