-- =============================================================================
-- X AutoHub — Catálogo asistido por IA: número de parte y borradores de producto
-- =============================================================================
--
-- Dos cosas en una migración, porque la segunda no sirve sin la primera:
--
--   1. `hub_parts.part_number` y `hub_parts.cross_refs`. La gente busca por NÚMERO DE PARTE y hoy no funciona: el vector
--      de búsqueda solo tenía nombre, marca, descripción corta y SKU interno. Los números se normalizan (sin espacios,
--      guiones ni minúsculas) para comparar, entran al vector y una búsqueda exacta por número sale de primera.
--
--   2. `ai_product_drafts`: lo que la IA lee de las fotos de una pieza, para que Xaviel solo revise y apruebe. La IA
--      NUNCA crea ni publica un producto: escribe un borrador; aprobarlo crea el producto por el camino de siempre del
--      panel (`AdminService.createPart`), con sus mismas validaciones.
--
-- DE DÓNDE SALE CADA CAMPO DE UN BORRADOR
-- ---------------------------------------
--   fields          { campo: { value, confidence: alta|media|baja, source: etiqueta|foto|sugerido } }
--   unmatched       compatibilidades que el servidor no pudo resolver contra vehicle_makes/models (se muestran, no se descartan)
--   duplicate_of    producto existente por número de parte + marca, o por similitud de nombre. Un borrador con duplicado
--                   no se puede aprobar hasta que el admin confirme "es otro artículo" (`duplicate_confirmed`).
--   final_fields / edited_fields   lo que se guardó y qué campos cambió el humano: de ahí sale la precisión por campo.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Número de parte
-- -----------------------------------------------------------------------------

-- "04465-02220", "04465 02220" y "0446502220" son el mismo número.
create or replace function public.xah_norm_part(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Todas las equivalencias normalizadas, separadas por espacio (para el vector de búsqueda).
create or replace function public.xah_norm_parts(p_values text[])
returns text
language sql
immutable
parallel safe
as $$
  select coalesce(string_agg(public.xah_norm_part(v), ' '), '') from unnest(coalesce(p_values, '{}'::text[])) as v;
$$;

-- `array_to_string` es STABLE y una columna generada exige IMMUTABLE: para texto es seguro declararlo así.
create or replace function public.xah_join(p_values text[])
returns text
language sql
immutable
parallel safe
as $$
  select array_to_string(coalesce(p_values, '{}'::text[]), ' ');
$$;

alter table public.hub_parts add column if not exists part_number text;
alter table public.hub_parts add column if not exists part_number_norm text;
alter table public.hub_parts add column if not exists cross_refs text[] not null default '{}';
alter table public.hub_parts add column if not exists cross_refs_norm text[] not null default '{}';

alter table public.hub_parts drop constraint if exists hub_parts_part_number_check;
alter table public.hub_parts
  add constraint hub_parts_part_number_check check (part_number is null or char_length(part_number) between 2 and 60);
alter table public.hub_parts drop constraint if exists hub_parts_cross_refs_check;
alter table public.hub_parts
  add constraint hub_parts_cross_refs_check check (cardinality(cross_refs) <= 30);

comment on column public.hub_parts.part_number is 'Número de parte del fabricante, como está impreso. Nulo si no se conoce.';
comment on column public.hub_parts.cross_refs is 'Números equivalentes (impresos en la pieza o la caja), como se escribieron.';

-- Las columnas normalizadas las mantiene un trigger: nadie las escribe a mano.
create or replace function public.hub_parts_part_numbers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.part_number := nullif(btrim(coalesce(new.part_number, '')), '');
  new.part_number_norm := nullif(public.xah_norm_part(new.part_number), '');
  new.cross_refs := coalesce(
    (select array_agg(distinct btrim(r)) from unnest(coalesce(new.cross_refs, '{}'::text[])) as r where btrim(r) <> ''),
    '{}'::text[]
  );
  new.cross_refs_norm := coalesce(
    (select array_agg(distinct public.xah_norm_part(r)) from unnest(new.cross_refs) as r where public.xah_norm_part(r) <> ''),
    '{}'::text[]
  );
  return new;
end;
$$;

drop trigger if exists hub_parts_part_numbers_trg on public.hub_parts;
create trigger hub_parts_part_numbers_trg
  before insert or update of part_number, cross_refs on public.hub_parts
  for each row execute function public.hub_parts_part_numbers();

create index if not exists hub_parts_part_number_norm_idx on public.hub_parts (part_number_norm) where part_number_norm is not null;
create index if not exists hub_parts_cross_refs_norm_idx on public.hub_parts using gin (cross_refs_norm);

-- El vector de búsqueda suma los dos. Una columna generada no se altera: se rehace, solo si todavía no los lleva.
do $$
begin
  if not exists (
    select 1
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = 'public.hub_parts'::regclass
       and a.attname = 'search_vector'
       and pg_get_expr(d.adbin, d.adrelid) like '%xah_norm_part%'
  ) then
    drop index if exists public.hub_parts_search_vector_idx;
    alter table public.hub_parts drop column if exists search_vector;
    alter table public.hub_parts
      add column search_vector tsvector
      generated always as (
        to_tsvector(
          'spanish',
          public.xah_unaccent(
            coalesce(name, '') || ' ' || coalesce(brand, '') || ' ' ||
            coalesce(short_description, '') || ' ' || coalesce(sku, '') || ' ' ||
            coalesce(part_number, '') || ' ' || public.xah_norm_part(part_number) || ' ' ||
            public.xah_join(cross_refs) || ' ' || public.xah_norm_parts(cross_refs)
          )
        )
      ) stored;
    create index hub_parts_search_vector_idx on public.hub_parts using gin (search_vector);
  end if;
end $$;

-- Backfill: las filas que ya existen pasan por el trigger una vez (no cambian, solo se normalizan).
update public.hub_parts set part_number = part_number where part_number is not null and part_number_norm is null;

-- Una búsqueda exacta por número de parte sale de primera. `search_products()` y `suggest_products()` tienen columnas
-- de salida explícitas y cuerpos largos; en vez de copiarlos (y desincronizarlos del original) se les cambia el texto
-- en su definición viva, y la migración falla en voz alta si el texto esperado ya no está.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.search_products(text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer)'::regprocedure)
    into v_def;
  if v_def is not null and v_def not like '%xah_norm_part%' then
    v_new := replace(v_def,
      'or p.sku ilike q.pat',
      'or p.sku ilike q.pat or (public.xah_norm_part(p_query) <> '''' and (p.part_number_norm = public.xah_norm_part(p_query) or p.cross_refs_norm @> array[public.xah_norm_part(p_query)]))');
    v_new := replace(v_new,
      'case when q.tsq is not null then ts_rank(p.search_vector, q.tsq) else 0 end as rnk',
      'case when q.tsq is not null then ts_rank(p.search_vector, q.tsq) else 0 end + case when public.xah_norm_part(p_query) <> '''' and (p.part_number_norm = public.xah_norm_part(p_query) or p.cross_refs_norm @> array[public.xah_norm_part(p_query)]) then 10 else 0 end as rnk');
    if v_new = v_def or v_new not like '%xah_norm_part%' then
      raise exception 'search_products(): no encontré el texto a reemplazar.';
    end if;
    execute v_new;
  end if;

  select pg_get_functiondef('public.suggest_products(text, integer)'::regprocedure) into v_def;
  if v_def is not null and v_def not like '%xah_norm_part%' then
    v_new := replace(v_def,
      'case when p.sku ilike q.prefix                              then 0.9 else 0 end,',
      'case when p.sku ilike q.prefix                              then 0.9 else 0 end,' || E'\n' ||
      '        case when public.xah_norm_part(p_query) <> '''' and (p.part_number_norm = public.xah_norm_part(p_query) or p.cross_refs_norm @> array[public.xah_norm_part(p_query)]) then 1.0 else 0 end,');
    if v_new = v_def or v_new not like '%xah_norm_part%' then
      raise exception 'suggest_products(): no encontré el texto a reemplazar.';
    end if;
    execute v_new;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Borradores de producto
-- -----------------------------------------------------------------------------

create table if not exists public.ai_product_drafts (
  id                  uuid        primary key default gen_random_uuid(),
  created_by          uuid        references auth.users(id) on delete set null,
  status              text        not null default 'queued'
                      check (status in ('queued', 'processing', 'ready', 'failed', 'approved', 'rejected')),
  -- 'article': fotos de una pieza. 'list': foto o PDF de lista de proveedor o factura (un borrador por renglón).
  source_kind         text        not null default 'article' check (source_kind in ('article', 'list')),
  -- Rutas en el bucket privado `ai-product-sources`: <uid>/<lote>/<archivo>.
  source_paths        text[]      not null default '{}' check (cardinality(source_paths) between 1 and 8),
  batch_id            uuid,
  -- Pista de texto de "Pedir otra lectura".
  hint                text        check (hint is null or char_length(hint) <= 300),
  fields              jsonb       not null default '{}'::jsonb,
  unmatched           jsonb       not null default '[]'::jsonb,
  duplicate_of        bigint      references public.hub_parts(id) on delete set null,
  duplicate_confirmed boolean     not null default false,
  final_fields        jsonb,
  edited_fields       text[]      not null default '{}',
  product_id          bigint      references public.hub_parts(id) on delete set null,
  model               text,
  cost_usd            numeric(10, 6) not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);

comment on table public.ai_product_drafts is
  'Borradores de producto leídos por IA. La edge los escribe (service_role); solo un admin los ve y los aprueba.';

create index if not exists ai_product_drafts_status_idx on public.ai_product_drafts (status, created_at desc);
create index if not exists ai_product_drafts_batch_idx on public.ai_product_drafts (batch_id) where batch_id is not null;

alter table public.ai_product_drafts enable row level security;
revoke all on public.ai_product_drafts from anon;
grant select, insert, update, delete on public.ai_product_drafts to authenticated;

drop policy if exists "un admin lee los borradores" on public.ai_product_drafts;
create policy "un admin lee los borradores"
  on public.ai_product_drafts for select to authenticated using (public.is_admin());

-- Un borrador nace en cola y a nombre de quien lo sube: lo demás lo pone la edge.
drop policy if exists "un admin crea borradores en cola" on public.ai_product_drafts;
create policy "un admin crea borradores en cola"
  on public.ai_product_drafts for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid() and status = 'queued');

drop policy if exists "un admin revisa los borradores" on public.ai_product_drafts;
create policy "un admin revisa los borradores"
  on public.ai_product_drafts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "un admin borra los borradores" on public.ai_product_drafts;
create policy "un admin borra los borradores"
  on public.ai_product_drafts for delete to authenticated using (public.is_admin());

create or replace function public.ai_product_drafts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status = 'approved' and old.status is distinct from 'approved' then
    -- Con un posible duplicado, aprobar exige haber dicho "es otro artículo".
    if new.duplicate_of is not null and not new.duplicate_confirmed then
      raise exception 'Este borrador parece un duplicado: confirma que es otro artículo antes de aprobarlo.'
        using errcode = '22023';
    end if;
    if new.product_id is null then
      raise exception 'Un borrador aprobado tiene que apuntar al producto que se creó.' using errcode = '22023';
    end if;
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  if tg_op = 'UPDATE' and new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.reviewed_at := coalesce(new.reviewed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists ai_product_drafts_guard_trg on public.ai_product_drafts;
create trigger ai_product_drafts_guard_trg
  before insert or update on public.ai_product_drafts
  for each row execute function public.ai_product_drafts_guard();

-- Bucket privado de las fotos de origen. Solo admin sube y ve.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-product-sources', 'ai-product-sources', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "un admin sube fotos de origen" on storage.objects;
create policy "un admin sube fotos de origen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ai-product-sources' and public.is_admin() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "un admin lee fotos de origen" on storage.objects;
create policy "un admin lee fotos de origen"
  on storage.objects for select to authenticated
  using (bucket_id = 'ai-product-sources' and public.is_admin());

drop policy if exists "un admin borra fotos de origen" on storage.objects;
create policy "un admin borra fotos de origen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ai-product-sources' and public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. Duplicados (solo la edge, con service_role)
-- -----------------------------------------------------------------------------
-- Primero por número de parte normalizado (el principal o una equivalencia) con la misma marca (o sin marca de un lado);
-- después por similitud de nombre dentro de la misma marca.

create or replace function public.ai_find_duplicate_product(p_name text, p_brand text, p_part text)
returns bigint
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_part  text := public.xah_norm_part(p_part);
  v_brand text := lower(public.xah_unaccent(btrim(coalesce(p_brand, ''))));
  v_id    bigint;
begin
  if v_part <> '' then
    select p.id into v_id
      from public.hub_parts p
     where (p.part_number_norm = v_part or p.cross_refs_norm @> array[v_part])
       and (v_brand = '' or lower(public.xah_unaccent(p.brand)) = v_brand or p.brand = '')
     order by p.id limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  if char_length(btrim(coalesce(p_name, ''))) >= 4 then
    select p.id into v_id
      from public.hub_parts p
     where (v_brand = '' or lower(public.xah_unaccent(p.brand)) = v_brand)
       and similarity(lower(public.xah_unaccent(p.name)), lower(public.xah_unaccent(p_name))) >= 0.7
     order by similarity(lower(public.xah_unaccent(p.name)), lower(public.xah_unaccent(p_name))) desc, p.id
     limit 1;
  end if;
  return v_id;
end;
$$;

revoke all on function public.ai_find_duplicate_product(text, text, text) from public;
revoke execute on function public.ai_find_duplicate_product(text, text, text) from anon;
revoke execute on function public.ai_find_duplicate_product(text, text, text) from authenticated;
grant execute on function public.ai_find_duplicate_product(text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Precisión por campo (solo admin)
-- -----------------------------------------------------------------------------
-- De los borradores aprobados: por cada campo que la IA propuso, cuántas veces el humano lo dejó como estaba.

create or replace function public.ai_catalog_accuracy()
returns table (field text, total bigint, unchanged bigint, pct numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver la precisión del catálogo asistido.' using errcode = '42501';
  end if;

  return query
    select k.key,
           count(*)::bigint,
           (count(*) filter (where not (k.key = any (d.edited_fields))))::bigint,
           round(100.0 * count(*) filter (where not (k.key = any (d.edited_fields))) / count(*), 1)
      from public.ai_product_drafts d
     cross join lateral jsonb_object_keys(d.fields) as k(key)
     where d.status = 'approved'
       and d.fields -> k.key ->> 'value' is not null
     group by k.key
     order by count(*) desc, k.key;
end;
$$;

revoke all on function public.ai_catalog_accuracy() from public;
revoke execute on function public.ai_catalog_accuracy() from anon;
grant execute on function public.ai_catalog_accuracy() to authenticated;
