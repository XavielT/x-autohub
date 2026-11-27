-- =============================================================================
-- 0068 — Sinónimos de búsqueda: "pantalla" y los nombres en inglés de las tiendas en línea
-- =============================================================================
-- Xaviel busca las piezas por su nombre en inglés (eBay, Amazon) y en las tiendas de RD a un faro le dicen "pantalla":
--   · "pantalla"/"pantallas" y "headlamp"/"head light" entran al grupo del faro (el "Pantallas Hyundai Santa Fe…" del catálogo es un faro).
--   · "wheel"/"wheels" al de los aros; "tail light" al de las calaveras.
--   · Grupos nuevos: capó/hood, parrilla/grille, guardafango/fender, neblinero/fog light, catalizador/catalytic converter.
--
-- Los términos se AGREGAN a un grupo que ya existe (un grupo que el admin editó conserva lo suyo; el trigger quita repetidos). Los grupos
-- nuevos entran solo si su primer término no está ya en alguno. Se puede ejecutar dos veces.
-- =============================================================================

-- Grupos que ya existen: se les suman términos.
update public.search_synonym_groups g
   set terms = g.terms || v.extra
  from (values
    ('faro',      array['pantalla', 'pantallas', 'headlamp', 'headlamps', 'head light', 'head lights']),
    ('aro',       array['wheel', 'wheels']),
    ('calavera',  array['tail light', 'tail lights'])
  ) as v(first_term, extra)
 where g.terms @> array[v.first_term]
   and not (g.terms @> v.extra);

-- Grupos nuevos.
insert into public.search_synonym_groups (terms)
select v.terms
  from (values
    (array['capo', 'hood']),
    (array['parrilla', 'parrillas', 'grille', 'grill']),
    (array['guardafango', 'guardafangos', 'guardalodo', 'guardalodos', 'fender', 'fenders']),
    (array['neblinero', 'neblineros', 'fog light', 'fog lights', 'fog lamp', 'foglight']),
    (array['catalizador', 'catalizadores', 'catalytic converter', 'cat converter'])
  ) as v(terms)
 where not exists (
   select 1 from public.search_synonym_groups g where g.terms @> array[v.terms[1]]
 );


-- -----------------------------------------------------------------------------
-- Una frase que es justo un término de un grupo ("head light", "brake pad", "floor mat")
-- -----------------------------------------------------------------------------
-- search_products() evalúa cada palabra por separado: "head light" se partía en "head" y "light", que no son sinónimos de nada, y no
-- encontraba nada aunque la frase entera sea un término del grupo del faro. `xah_phrase_query()` devuelve, si la consulta completa (de
-- dos palabras o más) es un término de algún grupo, la tsquery con todos los términos de ese grupo; search_products() la suma como
-- otra forma de coincidir. Se parcha la definición viva (como la 0051), y falla en voz alta si el texto esperado ya no está.

create or replace function public.xah_phrase_query(p_query text)
returns tsquery
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_norm  text;
  v_term  text;
  v_parts text[];
  v_expr  text;
  v_q     tsquery;
begin
  v_norm := btrim(regexp_replace(regexp_replace(lower(public.xah_unaccent(coalesce(p_query, ''))), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
  -- Una sola palabra ya la cubre xah_query_words().
  if position(' ' in v_norm) = 0 then
    return null;
  end if;

  for v_term in
    select distinct x
      from public.search_synonym_groups g
     cross join lateral unnest(g.terms) as x
     where g.terms @> array[v_norm]
  loop
    v_parts := array(
      select regexp_replace(w, '[^a-z0-9]', '', 'g')
        from unnest(string_to_array(v_term, ' ')) w
       where regexp_replace(w, '[^a-z0-9]', '', 'g') <> ''
    );
    continue when cardinality(v_parts) = 0;
    v_expr := coalesce(v_expr || ' | ', '') || array_to_string(v_parts, ' <-> ');
  end loop;

  if v_expr is null then
    return null;
  end if;
  v_q := to_tsquery('spanish', v_expr);
  return case when numnode(v_q) > 0 then v_q else null end;
end;
$$;

do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.search_products(text, text, bigint, bigint, integer, numeric, numeric, boolean, text, integer, integer)'::regprocedure)
    into v_def;
  if v_def is not null and v_def not like '%xah_phrase_query%' then
    v_new := replace(v_def,
      'public.xah_norm_part(p_query) as part',
      'public.xah_norm_part(p_query) as part,' || E'\n' || '      public.xah_phrase_query(p_query) as pq');
    v_new := replace(v_new,
      'or public.xah_unaccent(p.name)  ilike q.pat',
      'or (q.pq is not null and x.doc @@ q.pq)' || E'\n' || '        or public.xah_unaccent(p.name)  ilike q.pat');
    v_new := replace(v_new,
      'then 10 else 0 end',
      'then 10 else 0 end' || E'\n' || '        + case when q.pq is not null and x.doc @@ q.pq then 1 else 0 end');
    if v_new = v_def or (length(v_new) - length(replace(v_new, 'q.pq', ''))) / 4 <> 4 then
      raise exception 'search_products(): no encontré el texto a reemplazar para la búsqueda por frase.';
    end if;
    execute v_new;
  end if;
end $$;
