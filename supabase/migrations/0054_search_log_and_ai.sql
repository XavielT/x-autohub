-- =============================================================================
-- X AutoHub — Registro de búsquedas (sin datos personales) para la búsqueda inteligente
-- =============================================================================
--
-- La búsqueda inteligente (edge `ai-parse-search`) entiende frases como "faros corolla 2015". Esta migración trae lo que la rodea:
--
--   · `search_log`: qué se busca y con cuántos resultados, SIN datos personales: el texto se sanea en la base (teléfonos, correos y cédulas
--     fuera) y no se guarda quién buscó ni desde dónde. Las búsquedas SIN resultado son la demanda perdida: alimentan el resumen diario (bloque 6)
--     y las propuestas de alias. Retención de 90 días (cron).
--   · `log_search()`: la única forma de escribir, abierta a visitantes. Tiene un freno global para que nadie llene la tabla.
--   · `admin_search_gaps()`: las búsquedas sin resultado más repetidas (solo admin).
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

create table if not exists public.search_log (
  id           bigint generated always as identity primary key,
  query_norm   text        not null check (char_length(query_norm) between 2 and 120),
  result_count integer     not null check (result_count >= 0),
  had_vehicle  boolean     not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.search_log is
  'Búsquedas de la tienda, saneadas (sin teléfonos, correos ni cédulas) y sin quién las hizo. Retención de 90 días. Se escribe solo con log_search().';

create index if not exists search_log_created_idx on public.search_log (created_at desc);
create index if not exists search_log_gap_idx on public.search_log (query_norm) where result_count = 0;

alter table public.search_log enable row level security;
revoke all on public.search_log from anon, authenticated;
grant select on public.search_log to authenticated;

drop policy if exists "un admin lee el registro de busquedas" on public.search_log;
create policy "un admin lee el registro de busquedas"
  on public.search_log for select to authenticated using (public.is_admin());

-- Normaliza y sanea: minúsculas, sin acentos, sin teléfonos/correos/cédulas, espacios colapsados.
create or replace function public.xah_clean_query(p_query text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select btrim(regexp_replace(
    lower(public.xah_unaccent(
      regexp_replace(
        regexp_replace(
          regexp_replace(coalesce(p_query, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', ' ', 'g'),
          '\d{3}-?\d{7}-?\d', ' ', 'g'),
        '(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}', ' ', 'g')
    )),
    '\s+', ' ', 'g'));
$$;

create or replace function public.log_search(p_query text, p_result_count integer, p_had_vehicle boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text := left(public.xah_clean_query(p_query), 120);
begin
  if char_length(v_norm) < 2 or p_result_count is null or p_result_count < 0 then
    return;
  end if;

  -- Freno global: más de 600 renglones en un minuto es abuso, no búsqueda. Se ignora en silencio (el visitante no se entera de nada).
  if (select count(*) from public.search_log where created_at > now() - interval '1 minute') > 600 then
    return;
  end if;

  insert into public.search_log (query_norm, result_count, had_vehicle)
  values (v_norm, p_result_count, coalesce(p_had_vehicle, false));
end;
$$;

revoke all on function public.log_search(text, integer, boolean) from public;
grant execute on function public.log_search(text, integer, boolean) to anon, authenticated;

create or replace function public.admin_search_gaps(p_days integer default 30, p_limit integer default 20)
returns table (query_norm text, searches bigint, last_seen timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver esto.' using errcode = '42501';
  end if;

  return query
    select s.query_norm, count(*), max(s.created_at)
      from public.search_log s
     where s.result_count = 0 and s.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 90)))
     group by s.query_norm
     order by count(*) desc, max(s.created_at) desc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.admin_search_gaps(integer, integer) from public;
revoke execute on function public.admin_search_gaps(integer, integer) from anon;
grant execute on function public.admin_search_gaps(integer, integer) to authenticated;

-- La misma lista para la edge (service_role): sirve al resumen diario y a las propuestas de alias.
create or replace function public.ai_search_gaps(p_days integer default 7, p_limit integer default 30)
returns table (query_norm text, searches bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.query_norm, count(*)
    from public.search_log s
   where s.result_count = 0 and s.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)))
   group by s.query_norm
   order by count(*) desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.ai_search_gaps(integer, integer) from public;
revoke execute on function public.ai_search_gaps(integer, integer) from anon;
revoke execute on function public.ai_search_gaps(integer, integer) from authenticated;
grant execute on function public.ai_search_gaps(integer, integer) to service_role;

-- Retención: 90 días.
create or replace function public.search_log_purge()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.search_log where created_at < now() - interval '90 days';
$$;

revoke all on function public.search_log_purge() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('search-log-purge', '40 8 * * *', 'select public.search_log_purge()');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Asignar un modelo escrito a mano a uno que ya existe (lo usa "Proponer modelos" con un clic)
-- -----------------------------------------------------------------------------
-- `admin_create_vehicle_model()` (0040) solo mueve los garajes cuyo texto es IGUAL (por slug) al modelo que crea. Una errata ("corola") o una
-- variante ("Corolla XLI") apunta a un modelo que ya existe y no se arregla creando otro: se asigna. Mueve los garajes de esa marca con ese texto.
create or replace function public.admin_assign_vehicle_model(p_make_id bigint, p_model_text text, p_model_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moved bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar modelos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vehicle_models m where m.id = p_model_id and m.make_id = p_make_id) then
    raise exception 'Ese modelo no es de esa marca.' using errcode = '22023';
  end if;

  update public.profile_vehicles pv
     set model_id = p_model_id, model_text = null
   where pv.make_id = p_make_id
     and pv.model_text is not null
     and public.xah_slugify(pv.model_text) = public.xah_slugify(p_model_text);
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

revoke all on function public.admin_assign_vehicle_model(bigint, text, bigint) from public;
revoke execute on function public.admin_assign_vehicle_model(bigint, text, bigint) from anon;
grant execute on function public.admin_assign_vehicle_model(bigint, text, bigint) to authenticated;
