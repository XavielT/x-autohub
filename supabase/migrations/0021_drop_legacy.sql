-- =============================================================================
-- X AutoHub — Se retira lo que dejó el pivote: hub_parts.category y el contador
-- del home (después del pivote)
-- =============================================================================
--
-- Dos restos que ya nada usa:
--
--   1. `hub_parts.category` (texto). Era la clasificación de la tienda anterior al
--      pivote (17 palabras sueltas: "frenos", "interior"…). La 0017 la sustituyó por
--      `category_id` (el árbol de categorías) y la dejó viva "una fase más": un
--      trigger la rellenaba con la categoría raíz para que `/catalogo` no perdiera
--      los productos nuevos. `/catalogo` ya solo redirige; el frontend dejó de
--      leerla y de escribirla.
--
--   2. El contador del home: la fila `stats_mode` de `site_settings` y la función
--      `get_site_stats()` (0014). El pivote quitó ese contador y el interruptor de
--      `/admin/ajustes` se fue con él.
--
--
-- LO QUE TOCA, EN ORDEN
-- ---------------------
--   a. Una **comprobación previa**: si alguna pieza tiene `category` pero no
--      `category_id`, la migración se detiene. Borrar la columna destruiría la
--      única clasificación que esa pieza tiene. (Se comprobó contra producción:
--      las 35 piezas tienen `category_id`.)
--   b. `search_products()` se vuelve a crear **sin** la columna `category` de salida.
--      Devuelve columnas explícitas, así que no sirve `create or replace` con otras
--      columnas: hay que borrarla y crearla de nuevo (y volver a dar sus permisos).
--   c. `hub_parts_fill_defaults()` pierde el bloque que rellenaba el texto.
--   d. Se borra el índice y la columna `category`.
--   e. Se corrige el trigger de congelado de `site_settings` (ver más abajo), se borra
--      `get_site_stats()` y la fila `stats_mode`, y el `check` de `site_settings` deja
--      de mencionarla.
--
--
-- ORDEN DE DESPLIEGUE
-- -------------------
-- **Primero el frontend, después esta migración.** El frontend anterior pide la
-- columna `category` en sus `select` y la manda (nula) al guardar un producto desde el
-- panel: con la columna ya borrada, esas llamadas fallan. El frontend nuevo funciona
-- igual con la columna presente o ausente.
--
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES
-- ------------------------------------------
-- Todo lleva `if exists`, la comprobación previa solo corre si la columna existe, y
-- `search_products()` se vuelve a crear igual cada vez.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- a. Comprobación previa: no borrar una clasificación que no tiene reemplazo
-- -----------------------------------------------------------------------------

do $$
declare
  v_sin_reemplazo integer;
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'hub_parts' and column_name = 'category'
  ) then
    execute 'select count(*) from public.hub_parts where category is not null and category_id is null'
      into v_sin_reemplazo;

    if v_sin_reemplazo > 0 then
      raise exception
        'No se puede borrar hub_parts.category: % pieza(s) tienen texto pero no category_id. Clasifícalas primero.',
        v_sin_reemplazo;
    end if;
  end if;
end
$$;


-- -----------------------------------------------------------------------------
-- b. search_products() sin la columna `category` de salida
-- -----------------------------------------------------------------------------
-- Misma función de la 0017, línea por línea, menos `category`. Cambiar las columnas
-- de salida obliga a borrarla y crearla de nuevo.

drop function if exists public.search_products(
  text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer
);

create function public.search_products(
  p_query         text    default null,
  p_category_slug text    default null,
  p_make_id       bigint  default null,
  p_model_id      bigint  default null,
  p_year          integer default null,
  p_min_price     numeric default null,
  p_max_price     numeric default null,
  p_in_stock_only boolean default false,
  p_sort          text    default 'relevance',
  p_limit         integer default 24,
  p_offset        integer default 0
)
returns table (
  id                      bigint,
  category_id             bigint,
  slug                    text,
  sku                     text,
  name                    text,
  brand                   text,
  short_description       text,
  img_url                 text,
  images                  text[],
  stars_rating            numeric,
  price                   numeric,
  compare_at_price        numeric,
  description             text,
  stock                   integer,
  is_active               boolean,
  is_test                 boolean,
  is_featured             boolean,
  fulfillment             public.product_fulfillment,
  lead_time_days          integer,
  fitment_type            public.product_fitment_type,
  installable             boolean,
  installation_service_id bigint,
  specs                   jsonb,
  sold_count              integer,
  created_at              timestamptz,
  updated_at              timestamptz,
  total_count             bigint
)
language sql
stable
security invoker
as $$
  with q as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as raw,
      -- Patrón para el like: se escapan \, % y _ para que "100%" no sea comodín.
      '%' || replace(replace(replace(
        coalesce(public.xah_unaccent(nullif(btrim(coalesce(p_query, '')), '')), ''),
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
      -- Cada palabra, limpia de todo lo que no sea letra o número (para que no
      -- pueda romper la sintaxis de tsquery), con comodín de prefijo.
      (
        select to_tsquery('spanish', string_agg(w.word || ':*', ' & '))
          from (
            select regexp_replace(t.token, '[^a-z0-9]', '', 'g') as word
              from unnest(
                     regexp_split_to_array(
                       lower(public.xah_unaccent(btrim(coalesce(p_query, '')))),
                       '\s+')
                   ) as t(token)
          ) w
         where w.word <> ''
      ) as tsq
  ),
  filtered as (
    select
      p.*,
      case when q.tsq is not null then ts_rank(p.search_vector, q.tsq) else 0 end as rnk
    from public.hub_parts p
    cross join q
    where p.is_active
      and (
        q.raw is null
        or p.search_vector @@ q.tsq
        or public.xah_unaccent(p.name)  ilike q.pat
        or public.xah_unaccent(p.brand) ilike q.pat
        or p.sku ilike q.pat
      )
      and (
        p_category_slug is null
        or p.category_id in (
          select c.id
            from public.product_categories c
           where c.slug = p_category_slug
              or c.parent_id = (select r.id from public.product_categories r where r.slug = p_category_slug)
        )
      )
      and (
        p_make_id is null
        or p.fitment_type = 'universal'
        or exists (
          select 1
            from public.product_fitments f
           where f.product_id = p.id
             and f.make_id = p_make_id
             -- Sin modelo elegido basta con la marca; con modelo, el fitment es
             -- de toda la marca (model_id nulo) o de ese modelo.
             and (p_model_id is null or f.model_id is null or f.model_id = p_model_id)
             and (p_year is null or f.year_from is null or f.year_from <= p_year)
             and (p_year is null or f.year_to   is null or f.year_to   >= p_year)
        )
      )
      and (p_min_price is null or p.price >= p_min_price)
      and (p_max_price is null or p.price <= p_max_price)
      and (not coalesce(p_in_stock_only, false) or (p.fulfillment = 'stock' and p.stock > 0))
  )
  select
    f.id, f.category_id, f.slug, f.sku, f.name, f.brand,
    f.short_description, f.img_url, f.images, f.stars_rating, f.price,
    f.compare_at_price, f.description, f.stock, f.is_active, f.is_test,
    f.is_featured, f.fulfillment, f.lead_time_days, f.fitment_type,
    f.installable, f.installation_service_id, f.specs, f.sold_count,
    f.created_at, f.updated_at,
    count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'price_asc'     then f.price      end asc,
    case when p_sort = 'price_desc'    then f.price      end desc,
    case when p_sort = 'best_sellers'  then f.sold_count end desc,
    case when p_sort = 'newest'        then f.created_at end desc,
    case when coalesce(p_sort, 'relevance')
              not in ('price_asc', 'price_desc', 'best_sellers', 'newest')
         then f.rnk end desc,
    f.is_featured desc,
    f.sold_count desc,
    f.id
  limit  least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.search_products(
  text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer
) is
  'Búsqueda de la tienda: texto, categoría, compatibilidad por vehículo, precio y stock, con total_count. security invoker: RLS decide qué ve quien llama.';

-- Como en la 0017: `security invoker`, así que `anon` la puede invocar. Al volver a
-- crearla los permisos se pierden y hay que darlos otra vez.
revoke all on function public.search_products(
  text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer
) from public;
grant execute on function public.search_products(
  text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer
) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- c. hub_parts_fill_defaults() sin el relleno del texto de categoría
-- -----------------------------------------------------------------------------

create or replace function public.hub_parts_fill_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(nullif(public.xah_slugify(new.name), ''), 'producto') || '-' || new.id;
  end if;

  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'XAH-' || lpad(new.id::text, 6, '0');
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- d. Fuera el índice y la columna
-- -----------------------------------------------------------------------------

drop index if exists public.hub_parts_category_idx;

alter table public.hub_parts drop column if exists category;


-- -----------------------------------------------------------------------------
-- e. Fuera el contador del home
-- -----------------------------------------------------------------------------

drop function if exists public.get_site_stats();

-- Primero hay que arreglar el trigger de congelado (0014): devolvía `new`, que en un
-- DELETE es **nulo**, y en un trigger BEFORE devolver nulo cancela la operación **sin
-- error**. Con eso ningún DELETE sobre `site_settings` hacía nada, ni siquiera el de una
-- migración o el del dashboard, que el propio trigger permite. Se descubrió con
-- `verify-migrations.sh`: el `delete` de abajo "funcionaba" y dejaba la fila. Lo demás
-- del trigger no cambia (sigue bloqueando a `anon` y `authenticated` por nombre; una
-- migración corre sin JWT y pasa).
create or replace function public.guard_site_settings_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and coalesce(current_setting('app.allow_site_settings_write', true), '') <> 'on' then
    raise exception 'Los ajustes del sitio se cambian con set_site_setting().'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- La fila primero y el `check` después: el `check` ya no debe mencionar `stats_mode`.
delete from public.site_settings where key = 'stats_mode';

alter table public.site_settings
  drop constraint if exists site_settings_value_valid;

alter table public.site_settings
  add constraint site_settings_value_valid check (
    (key <> 'bank_accounts'  or jsonb_typeof(value) = 'array')
    and (key <> 'pickup_address' or jsonb_typeof(value) = 'object')
  );

comment on column public.site_settings.value is
  'jsonb. bank_accounts es un arreglo y pickup_address un objeto (el check lo exige).';
