-- =============================================================================
-- X AutoHub — Esquema de la tienda (fase 1 del pivote de octubre de 2026)
-- =============================================================================
--
-- Ver docs/PIVOT-2026-10.md, sección 4 → "Tienda". Esta migración **extiende**
-- `hub_parts`; no la renombra. Renombrarla rompería `order_items`, el admin, el
-- seed y las políticas de 0013, para ganar un nombre. En el código los modelos
-- nuevos se llaman `Product*` y el mapper traduce.
--
-- Qué trae:
--
--   1. `product_categories` — árbol de categorías, dos niveles como máximo, con
--      la semilla de primer nivel del plan y el mapeo de las 17 categorías de
--      texto que había.
--   2. Columnas nuevas en `hub_parts`: categoría, slug, SKU, oferta,
--      disponibilidad (stock o bajo pedido), compatibilidad, instalación,
--      especificaciones, búsqueda de texto completo.
--   3. `vehicle_makes` / `vehicle_models` — marcas y modelos, con una semilla
--      corta a propósito (no se intenta un catálogo completo).
--   4. `product_fitments` — qué vehículos cubre cada producto específico.
--   5. `profile_vehicles` — el garaje de cada usuario.
--   6. `search_products()` — texto + categoría + compatibilidad + filtros en una
--      sola consulta, con `total_count`.
--
--
-- DECISIONES QUE CONVIENE CONOCER
-- -------------------------------
-- · `fitment_type` nace en `'specific'`, no en `'universal'`. Un producto que
--   dice "universal" por error le promete compatibilidad a quien no la tiene;
--   uno que dice "específico" y no trae fitments cargados solo muestra
--   "Consultar compatibilidad". Mejor eso que mentir (plan, §7).
--
-- · `hub_parts.category` (texto) **se conserva** y deja de ser `not null`: la
--   tienda de hoy (`/catalogo`) todavía filtra por ese texto. Un trigger lo
--   rellena con la categoría raíz cuando se crea un producto con `category_id`
--   y sin texto. Se elimina en la fase 7 (migración 0021).
--
-- · `slug` y `sku` los rellena un trigger si vienen vacíos, y después son
--   `not null` y únicos. El slug lleva el id al final (`disco-gtr-1`) para
--   garantizar la unicidad sin un bucle de reintentos; el admin puede editarlo.
--
-- · `search_products()` es `security invoker`: RLS decide qué productos ve quien
--   llama (activos y no de prueba, salvo admin y usuarios de prueba). No es
--   `security definer` porque no hace falta, y por eso no lleva el idiom de tres
--   líneas de CLAUDE.md; `anon` la puede invocar a propósito.
--
-- · Los parámetros de la función llevan prefijo `p_` (el plan los nombra sin
--   él): `limit`, `offset`, `year` y `sort` son palabras reservadas o chocan con
--   columnas, y entrecomillarlas obliga a todo cliente a escribirlas igual.
--
-- La migración se puede ejecutar dos veces.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Ayudantes: unaccent y slugify
-- -----------------------------------------------------------------------------
-- `unaccent()` es STABLE, y una columna generada o un índice exigen IMMUTABLE.
-- Se envuelve en una función propia marcada inmutable (el patrón habitual: el
-- diccionario no cambia). Sin esto no hay búsqueda sin acentos en un índice.
--
-- La extensión va en el esquema `extensions`, que es donde Supabase las pone y
-- donde `anon` ya tiene USAGE; en `public` la expondría PostgREST como rpc.

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.xah_unaccent(p_text text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent(p_text);
$$;

comment on function public.xah_unaccent(text) is
  'unaccent() marcado inmutable, para poder usarlo en columnas generadas e índices.';

-- 'Disco ventilado GTR 355mm' → 'disco-ventilado-gtr-355mm'.
create or replace function public.xah_slugify(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(lower(public.xah_unaccent(coalesce(p_text, ''))), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
$$;

comment on function public.xah_slugify(text) is
  'Texto en minúsculas, sin acentos y con guiones: lo que va en una URL.';


-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

do $$
begin
  create type public.product_fulfillment as enum ('stock', 'on_order');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.product_fitment_type as enum ('universal', 'specific');
exception when duplicate_object then null;
end $$;


-- -----------------------------------------------------------------------------
-- 2. Categorías
-- -----------------------------------------------------------------------------

create table if not exists public.product_categories (
  id         bigint generated by default as identity primary key,
  -- Nulo = primer nivel. `restrict`: borrar una categoría con hijos o con
  -- productos tiene que fallar, no dejarlos huérfanos en silencio.
  parent_id  bigint references public.product_categories(id) on delete restrict,
  slug       text    not null unique,
  name       text    not null,
  -- Clave de icono. Nulo hasta que la fase 2 decida la iconografía: hoy no hay
  -- ningún asset de categorías en src/assets/icons y no se referencia uno que
  -- no existe.
  icon       text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_categories_not_own_parent check (parent_id is null or parent_id <> id)
);

create index if not exists product_categories_parent_idx
  on public.product_categories (parent_id, sort_order);

-- Dos niveles como máximo. Un `check` no puede mirar otras filas, así que va en
-- un trigger: el padre no puede tener padre, y quien ya tiene hijos no puede
-- pasar a ser hijo.
create or replace function public.check_product_category_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (
      select 1 from public.product_categories p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Las categorias admiten dos niveles como maximo.'
        using errcode = '23514';
    end if;

    if tg_op = 'UPDATE' and exists (
      select 1 from public.product_categories c where c.parent_id = new.id
    ) then
      raise exception 'Una categoria con subcategorias no puede ser subcategoria.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists product_categories_depth on public.product_categories;
create trigger product_categories_depth
  before insert or update of parent_id on public.product_categories
  for each row execute function public.check_product_category_depth();

-- Slug a partir del nombre cuando no viene uno. Lo comparten categorías, marcas
-- y modelos.
create or replace function public.fill_slug_from_name()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := public.xah_slugify(new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists product_categories_slug on public.product_categories;
create trigger product_categories_slug
  before insert or update of slug, name on public.product_categories
  for each row execute function public.fill_slug_from_name();

-- Semilla de primer nivel (plan, §4). Las hijas las crea el admin.
insert into public.product_categories (slug, name, sort_order) values
  ('accesorios-interior',   'Accesorios interior',     10),
  ('accesorios-exterior',   'Accesorios exterior',     20),
  ('iluminacion',           'Iluminación',             30),
  ('audio-multimedia',      'Audio y multimedia',      40),
  ('llantas-aros',          'Llantas y aros',          50),
  ('frenos',                'Frenos',                  60),
  ('suspension',            'Suspensión',              70),
  ('motor-filtros',         'Motor y filtros',         80),
  ('electrico-baterias',    'Eléctrico y baterías',    90),
  ('aire-acondicionado',    'Aire acondicionado',     100),
  ('limpieza-detailing',    'Limpieza y detailing',   110),
  ('herramientas-emergencia', 'Herramientas y emergencia', 120)
on conflict (slug) do nothing;


-- -----------------------------------------------------------------------------
-- 3. Columnas nuevas de hub_parts
-- -----------------------------------------------------------------------------

alter table public.hub_parts
  add column if not exists category_id            bigint references public.product_categories(id) on delete restrict,
  add column if not exists slug                   text,
  add column if not exists sku                    text,
  add column if not exists short_description      text not null default '',
  -- Precio anterior. Nulo = sin oferta. El check `> price` va más abajo.
  add column if not exists compare_at_price       numeric(12,2),
  add column if not exists is_featured            boolean not null default false,
  add column if not exists fulfillment            public.product_fulfillment not null default 'stock',
  add column if not exists lead_time_days         integer,
  -- 'specific' por defecto a propósito: ver la cabecera.
  add column if not exists fitment_type           public.product_fitment_type not null default 'specific',
  add column if not exists installable            boolean not null default false,
  add column if not exists installation_service_id bigint references public.services(id) on delete set null,
  add column if not exists specs                  jsonb not null default '{}'::jsonb,
  add column if not exists sold_count             integer not null default 0,
  add column if not exists updated_at             timestamptz not null default now();

-- La categoría de texto deja de ser obligatoria (ver la cabecera) y se anota
-- cuándo desaparece.
alter table public.hub_parts alter column category drop not null;
comment on column public.hub_parts.category is
  'Categoría de texto de la tienda anterior al pivote. Se elimina en la fase 7 (migración 0021); usa category_id.';

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_compare_at_price_check
    check (compare_at_price is null or compare_at_price > price);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_lead_time_days_check
    check (lead_time_days is null or lead_time_days > 0);
exception when duplicate_object then null;
end $$;

-- Un artículo bajo pedido tiene que decir cuánto tarda. Es lo que la tarjeta, la
-- ficha y el checkout muestran, y no se puede mostrar lo que no se guardó.
do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_on_order_needs_lead_time
    check (fulfillment <> 'on_order' or lead_time_days is not null);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_installation_needs_installable
    check (installation_service_id is null or installable);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_specs_is_object
    check (jsonb_typeof(specs) = 'object');
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hub_parts
    add constraint hub_parts_sold_count_check
    check (sold_count >= 0);
exception when duplicate_object then null;
end $$;

-- slug y sku: los rellena un trigger si vienen vacíos. Va **antes** del
-- backfill para que las filas existentes pasen por la misma regla.
create or replace function public.hub_parts_fill_defaults()
returns trigger
language plpgsql
as $$
declare
  v_root text;
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(nullif(public.xah_slugify(new.name), ''), 'producto') || '-' || new.id;
  end if;

  if new.sku is null or btrim(new.sku) = '' then
    new.sku := 'XAH-' || lpad(new.id::text, 6, '0');
  end if;

  -- La categoría de texto sigue viva una fase más: un producto nuevo creado solo
  -- con `category_id` hereda el slug de su categoría raíz, para que `/catalogo`
  -- (que filtra por texto) no lo pierda.
  if (new.category is null or btrim(new.category) = '') and new.category_id is not null then
    select coalesce(parent.slug, c.slug)
      into v_root
      from public.product_categories c
      left join public.product_categories parent on parent.id = c.parent_id
     where c.id = new.category_id;
    new.category := v_root;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists hub_parts_fill_defaults on public.hub_parts;
create trigger hub_parts_fill_defaults
  before insert or update on public.hub_parts
  for each row execute function public.hub_parts_fill_defaults();

-- Backfill de las filas que ya existen. Un `update` que no cambia nada de
-- verdad dispara el trigger igual, y es lo que rellena slug y sku.
update public.hub_parts set slug = null where slug is null;

-- Las 17 categorías de texto de la tienda anterior, mapeadas a las 12 del plan.
-- Ninguna queda sin mapear. Las dudas, y por qué:
--   refrigeracion → motor-filtros  (radiador, intercooler, termostato: enfriar el
--                                    motor, no aire acondicionado)
--   escape, transmision, aceites   → motor-filtros  (no hay categoría propia en el
--                                    plan; el admin puede crear hijas)
update public.hub_parts p
   set category_id = c.id
  from (values
    ('interior',      'accesorios-interior'),
    ('exterior',      'accesorios-exterior'),
    ('luces',         'iluminacion'),
    ('audio',         'audio-multimedia'),
    ('llantas',       'llantas-aros'),
    ('frenos',        'frenos'),
    ('suspension',    'suspension'),
    ('motor',         'motor-filtros'),
    ('filtros',       'motor-filtros'),
    ('aceites',       'motor-filtros'),
    ('escape',        'motor-filtros'),
    ('transmision',   'motor-filtros'),
    ('refrigeracion', 'motor-filtros'),
    ('electrico',     'electrico-baterias'),
    ('bateria',       'electrico-baterias'),
    ('detailing',     'limpieza-detailing'),
    ('herramientas',  'herramientas-emergencia')
  ) as m(old_category, new_slug)
  join public.product_categories c on c.slug = m.new_slug
 where p.category = m.old_category
   and p.category_id is null;

alter table public.hub_parts alter column slug set not null;
alter table public.hub_parts alter column sku  set not null;

create unique index if not exists hub_parts_slug_key on public.hub_parts (slug);
create unique index if not exists hub_parts_sku_key  on public.hub_parts (sku);
create index if not exists hub_parts_category_id_idx on public.hub_parts (category_id) where is_active;
create index if not exists hub_parts_featured_idx    on public.hub_parts (is_featured) where is_active and is_featured;

-- Búsqueda de texto completo, en español y sin acentos. Va al final porque la
-- expresión lee `sku`, que hasta el backfill no estaba lista.
alter table public.hub_parts
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector(
      'spanish',
      public.xah_unaccent(
        coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' ||
        coalesce(short_description, '') || ' ' || coalesce(sku, '')
      )
    )
  ) stored;

create index if not exists hub_parts_search_vector_idx
  on public.hub_parts using gin (search_vector);


-- -----------------------------------------------------------------------------
-- 4. Marcas y modelos
-- -----------------------------------------------------------------------------

create table if not exists public.vehicle_makes (
  id   bigint generated by default as identity primary key,
  name text not null unique,
  slug text not null unique
);

create table if not exists public.vehicle_models (
  id      bigint generated by default as identity primary key,
  make_id bigint not null references public.vehicle_makes(id) on delete cascade,
  name    text   not null,
  slug    text   not null,
  unique (make_id, slug),
  -- Para que un fitment o un garaje pueda garantizar que el modelo es de esa
  -- marca con una clave foránea compuesta.
  unique (id, make_id)
);

create index if not exists vehicle_models_make_idx on public.vehicle_models (make_id, name);

drop trigger if exists vehicle_makes_slug on public.vehicle_makes;
create trigger vehicle_makes_slug
  before insert or update of slug, name on public.vehicle_makes
  for each row execute function public.fill_slug_from_name();

drop trigger if exists vehicle_models_slug on public.vehicle_models;
create trigger vehicle_models_slug
  before insert or update of slug, name on public.vehicle_models
  for each row execute function public.fill_slug_from_name();

-- Las ~35 marcas que se ven en RD. El slug lo pone el trigger.
insert into public.vehicle_makes (name, slug) values
  ('Toyota', ''), ('Honda', ''), ('Hyundai', ''), ('Kia', ''), ('Nissan', ''),
  ('Mitsubishi', ''), ('Suzuki', ''), ('Chevrolet', ''), ('Ford', ''), ('Jeep', ''),
  ('Mazda', ''), ('Mercedes-Benz', ''), ('BMW', ''), ('Audi', ''), ('Volkswagen', ''),
  ('Lexus', ''), ('Subaru', ''), ('Isuzu', ''), ('Daihatsu', ''), ('Peugeot', ''),
  ('Citroën', ''), ('Renault', ''), ('Fiat', ''), ('Chery', ''), ('BYD', ''),
  ('Geely', ''), ('Great Wall', ''), ('JAC', ''), ('MG', ''), ('Land Rover', ''),
  ('Porsche', ''), ('Volvo', ''), ('Tesla', ''), ('Dodge', ''), ('RAM', '')
on conflict (name) do nothing;

-- Modelos más comunes de las diez primeras marcas. No es un catálogo completo ni
-- pretende serlo: el resto se carga desde el admin.
insert into public.vehicle_models (make_id, name, slug)
select m.id, v.model, ''
  from (values
    ('toyota',     'Corolla'),  ('toyota', 'Camry'),     ('toyota', 'Yaris'),
    ('toyota',     'RAV4'),     ('toyota', 'Highlander'),('toyota', 'Land Cruiser'),
    ('toyota',     'Prado'),    ('toyota', 'Hilux'),     ('toyota', '4Runner'),
    ('toyota',     'Fortuner'), ('toyota', 'Rush'),
    ('honda',      'Civic'),    ('honda', 'Accord'),     ('honda', 'CR-V'),
    ('honda',      'HR-V'),     ('honda', 'Fit'),        ('honda', 'City'),
    ('honda',      'Pilot'),    ('honda', 'Odyssey'),
    ('hyundai',    'Elantra'),  ('hyundai', 'Accent'),   ('hyundai', 'Tucson'),
    ('hyundai',    'Santa Fe'), ('hyundai', 'Sonata'),   ('hyundai', 'Creta'),
    ('hyundai',    'Kona'),     ('hyundai', 'i10'),      ('hyundai', 'Venue'),
    ('kia',        'Rio'),      ('kia', 'Cerato'),       ('kia', 'Sportage'),
    ('kia',        'Sorento'),  ('kia', 'Picanto'),      ('kia', 'Seltos'),
    ('kia',        'Soul'),     ('kia', 'Optima'),
    ('nissan',     'Sentra'),   ('nissan', 'Versa'),     ('nissan', 'Altima'),
    ('nissan',     'Kicks'),    ('nissan', 'X-Trail'),   ('nissan', 'Rogue'),
    ('nissan',     'Frontier'), ('nissan', 'Pathfinder'),('nissan', 'March'),
    ('nissan',     'Qashqai'),
    ('mitsubishi', 'L200'),     ('mitsubishi', 'Outlander'), ('mitsubishi', 'Montero'),
    ('mitsubishi', 'Montero Sport'), ('mitsubishi', 'ASX'), ('mitsubishi', 'Lancer'),
    ('mitsubishi', 'Mirage'),   ('mitsubishi', 'Eclipse Cross'),
    ('suzuki',     'Swift'),    ('suzuki', 'Vitara'),    ('suzuki', 'Jimny'),
    ('suzuki',     'Baleno'),   ('suzuki', 'Ertiga'),    ('suzuki', 'Celerio'),
    ('suzuki',     'S-Presso'), ('suzuki', 'Grand Vitara'),
    ('chevrolet',  'Spark'),    ('chevrolet', 'Aveo'),   ('chevrolet', 'Cruze'),
    ('chevrolet',  'Malibu'),   ('chevrolet', 'Equinox'),('chevrolet', 'Tahoe'),
    ('chevrolet',  'Silverado'),('chevrolet', 'Trax'),   ('chevrolet', 'Captiva'),
    ('chevrolet',  'Camaro'),
    ('ford',       'Ranger'),   ('ford', 'Explorer'),    ('ford', 'Escape'),
    ('ford',       'F-150'),    ('ford', 'Fusion'),      ('ford', 'Focus'),
    ('ford',       'Fiesta'),   ('ford', 'Edge'),        ('ford', 'Mustang'),
    ('ford',       'EcoSport'),
    ('jeep',       'Wrangler'), ('jeep', 'Grand Cherokee'), ('jeep', 'Cherokee'),
    ('jeep',       'Compass'),  ('jeep', 'Renegade'),    ('jeep', 'Gladiator')
  ) as v(make_slug, model)
  join public.vehicle_makes m on m.slug = v.make_slug
on conflict (make_id, slug) do nothing;


-- -----------------------------------------------------------------------------
-- 5. Compatibilidad: product_fitments
-- -----------------------------------------------------------------------------
-- Una fila = "este producto sirve para esta marca [y modelo] [entre estos años]".
-- `model_id` nulo = toda la marca; `year_from` / `year_to` nulos = sin límite.

create table if not exists public.product_fitments (
  id         bigint generated by default as identity primary key,
  product_id bigint  not null references public.hub_parts(id) on delete cascade,
  make_id    bigint  not null references public.vehicle_makes(id) on delete cascade,
  model_id   bigint,
  year_from  integer check (year_from is null or year_from between 1900 and 2100),
  year_to    integer check (year_to   is null or year_to   between 1900 and 2100),
  -- El modelo tiene que ser de la marca. Con `model_id` nulo la clave compuesta
  -- no se evalúa (MATCH SIMPLE), que es lo que se quiere.
  constraint product_fitments_model_of_make
    foreign key (model_id, make_id)
    references public.vehicle_models (id, make_id) on delete cascade,
  constraint product_fitments_year_order
    check (year_from is null or year_to is null or year_from <= year_to)
);

create index if not exists product_fitments_vehicle_idx on public.product_fitments (make_id, model_id);
create index if not exists product_fitments_product_idx on public.product_fitments (product_id);

-- Sin duplicados exactos. `coalesce` porque dos nulos no chocan en un índice
-- único normal.
create unique index if not exists product_fitments_unique
  on public.product_fitments (
    product_id, make_id, coalesce(model_id, 0), coalesce(year_from, 0), coalesce(year_to, 0)
  );


-- -----------------------------------------------------------------------------
-- 6. El garaje: profile_vehicles
-- -----------------------------------------------------------------------------

create table if not exists public.profile_vehicles (
  id         bigint generated by default as identity primary key,
  user_id    uuid    not null references public.profiles(id) on delete cascade,
  make_id    bigint  not null references public.vehicle_makes(id) on delete cascade,
  model_id   bigint  not null,
  year       integer not null check (year between 1950 and 2100),
  nickname   text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profile_vehicles_model_of_make
    foreign key (model_id, make_id)
    references public.vehicle_models (id, make_id) on delete cascade
);

create index if not exists profile_vehicles_user_idx on public.profile_vehicles (user_id);

-- Uno por defecto por usuario.
create unique index if not exists profile_vehicles_one_default
  on public.profile_vehicles (user_id) where is_default;

-- Marcar uno como predeterminado desmarca el anterior en el mismo golpe: sin
-- esto el cliente tendría que hacer dos escrituras y dejaría a medias el garaje
-- si falla la segunda.
create or replace function public.profile_vehicles_single_default()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.profile_vehicles
       set is_default = false
     where user_id = new.user_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_vehicles_single_default on public.profile_vehicles;
create trigger profile_vehicles_single_default
  before insert or update of is_default on public.profile_vehicles
  for each row execute function public.profile_vehicles_single_default();


-- -----------------------------------------------------------------------------
-- 7. RLS
-- -----------------------------------------------------------------------------
-- Categorías, marcas, modelos y fitments: lectura pública, escritura solo admin.
-- Las funciones `is_admin()` ya las pueden invocar `anon` y `authenticated`
-- (las políticas de select de 0002 y 0013 las llaman).
--
-- El `with check` de cada política de escritura es lo que impide que un admin
-- "mueva" una fila fuera de lo permitido; aquí repite al `using`.

alter table public.product_categories enable row level security;
alter table public.vehicle_makes      enable row level security;
alter table public.vehicle_models     enable row level security;
alter table public.product_fitments   enable row level security;
alter table public.profile_vehicles   enable row level security;

drop policy if exists "categorias visibles para todos" on public.product_categories;
create policy "categorias visibles para todos"
  on public.product_categories for select
  using (is_active or public.is_admin());

drop policy if exists "solo admin gestiona categorias" on public.product_categories;
create policy "solo admin gestiona categorias"
  on public.product_categories for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "marcas visibles para todos" on public.vehicle_makes;
create policy "marcas visibles para todos"
  on public.vehicle_makes for select
  using (true);

drop policy if exists "solo admin gestiona marcas" on public.vehicle_makes;
create policy "solo admin gestiona marcas"
  on public.vehicle_makes for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "modelos visibles para todos" on public.vehicle_models;
create policy "modelos visibles para todos"
  on public.vehicle_models for select
  using (true);

drop policy if exists "solo admin gestiona modelos" on public.vehicle_models;
create policy "solo admin gestiona modelos"
  on public.vehicle_models for all
  using (public.is_admin())
  with check (public.is_admin());

-- La compatibilidad se ve si se ve el producto: el `exists` consulta `hub_parts`
-- con las políticas de quien llama, así que un producto inactivo o de prueba no
-- filtra sus fitments.
drop policy if exists "fitments visibles junto con su producto" on public.product_fitments;
create policy "fitments visibles junto con su producto"
  on public.product_fitments for select
  using (exists (select 1 from public.hub_parts p where p.id = product_id));

drop policy if exists "solo admin gestiona fitments" on public.product_fitments;
create policy "solo admin gestiona fitments"
  on public.product_fitments for all
  using (public.is_admin())
  with check (public.is_admin());

-- El garaje: cada quien el suyo. `using` **y** `with check` con `auth.uid() =
-- user_id`: sin el segundo, alguien podría insertar o mover una fila al garaje
-- de otra persona.
drop policy if exists "cada quien ve su garaje" on public.profile_vehicles;
create policy "cada quien ve su garaje"
  on public.profile_vehicles for select
  using (auth.uid() = user_id);

drop policy if exists "cada quien agrega a su garaje" on public.profile_vehicles;
create policy "cada quien agrega a su garaje"
  on public.profile_vehicles for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada quien edita su garaje" on public.profile_vehicles;
create policy "cada quien edita su garaje"
  on public.profile_vehicles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "cada quien borra de su garaje" on public.profile_vehicles;
create policy "cada quien borra de su garaje"
  on public.profile_vehicles for delete
  using (auth.uid() = user_id);

-- Defensa en profundidad: los default privileges de Supabase le dan a `anon`
-- todos los permisos sobre las tablas nuevas, y solo RLS lo detiene. El garaje
-- no tiene nada que hacer con la clave anónima, así que se le quita también.
revoke all on public.profile_vehicles from anon;


-- -----------------------------------------------------------------------------
-- 8. search_products()
-- -----------------------------------------------------------------------------
-- Devuelve los productos de la tienda que cumplen todos los filtros, ya
-- ordenados y paginados, y en cada fila el `total_count` de la consulta entera
-- (el que no depende del limit) para pintar "128 resultados" y el botón de
-- cargar más.
--
-- Texto: cada palabra se compara por prefijo ("bremb" encuentra Brembo), sin
-- acentos y con la configuración 'spanish'; además se acepta una coincidencia
-- parcial en nombre, marca o SKU, que es lo que recupera las búsquedas que el
-- diccionario descarta (palabras vacías como "de").
--
-- Vehículo (`p_make_id`, `p_model_id`, `p_year`): devuelve los `universal` Y los
-- `specific` con un fitment que cubra ese vehículo. Un `specific` sin fitments
-- cargados **no** aparece: no se afirma compatibilidad que no se declaró.
--
-- Orden (`p_sort`): 'relevance' (por defecto), 'price_asc', 'price_desc',
-- 'best_sellers', 'newest'. Cualquier otro valor cae en 'relevance'.
--
-- `security invoker`: RLS aplica. `language sql` y no plpgsql porque en plpgsql
-- los nombres de las columnas de salida chocan con las de `hub_parts`.

create or replace function public.search_products(
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
  category                text,
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
    f.id, f.category, f.category_id, f.slug, f.sku, f.name, f.brand,
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

-- security invoker: no se salta nada, así que `anon` la puede invocar. El
-- `revoke ... from public` deja el permiso explícito, no heredado.
revoke all on function public.search_products(
  text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer
) from public;
grant execute on function public.search_products(
  text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer
) to anon, authenticated;
