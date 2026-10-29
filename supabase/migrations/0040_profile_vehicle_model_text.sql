-- 0040 — Modelo escrito a mano en el garaje.
--
-- Una marca sin modelos cargados deja a la persona sin poder elegir su vehículo.
-- Ahora `profile_vehicles.model_id` puede ser nulo y el modelo se escribe en
-- `model_text`. Con `model_id` nulo la clave compuesta `profile_vehicles_model_of_make`
-- no se comprueba (MATCH SIMPLE), y la compatibilidad lo trata como "toda la marca",
-- que ya es la semántica de `product_fitments`.
--
-- `model_text` lo escribe solo el dueño de la fila: las políticas de insert y update
-- de 0017 ya exigen `auth.uid() = user_id`, y no hay otra vía de escritura.
--
-- `admin_create_vehicle_model()` es lo que usa /admin → Vehículos: agrega el modelo
-- a `vehicle_models` y pasa a ese modelo los garajes que lo habían escrito. Tiene que
-- ser `security definer` porque el admin no puede escribir filas ajenas de
-- `profile_vehicles`.

alter table public.profile_vehicles
  alter column model_id drop not null;

alter table public.profile_vehicles
  add column if not exists model_text text;

alter table public.profile_vehicles
  drop constraint if exists profile_vehicles_model_text_len;
alter table public.profile_vehicles
  add constraint profile_vehicles_model_text_len
  check (model_text is null or char_length(btrim(model_text)) between 1 and 60);

-- O hay modelo, o hay texto (o ninguno de los dos: "toda la marca" sin más detalle);
-- las dos cosas a la vez no.
alter table public.profile_vehicles
  drop constraint if exists profile_vehicles_model_or_text;
alter table public.profile_vehicles
  add constraint profile_vehicles_model_or_text
  check (model_id is null or model_text is null);

create index if not exists profile_vehicles_model_text_idx
  on public.profile_vehicles (make_id, lower(model_text))
  where model_text is not null;

-- Lo que se escribió, agrupado: la lista de /admin → Vehículos.
create or replace function public.admin_unmatched_vehicle_models()
returns table (make_id bigint, make_name text, model_text text, vehicles bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver esto' using errcode = '42501';
  end if;

  return query
    select pv.make_id, mk.name, min(btrim(pv.model_text)), count(*)
      from public.profile_vehicles pv
      join public.vehicle_makes mk on mk.id = pv.make_id
     where pv.model_text is not null
     group by pv.make_id, mk.name, lower(btrim(pv.model_text))
     order by mk.name, min(btrim(pv.model_text));
end;
$$;

-- Crea el modelo y migra los garajes que lo habían escrito (sin distinguir
-- mayúsculas ni acentos). Devuelve el id del modelo y cuántos garajes movió.
create or replace function public.admin_create_vehicle_model(p_make_id bigint, p_name text)
returns table (model_id bigint, migrated bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := btrim(p_name);
  v_slug  text;
  v_id    bigint;
  v_moved bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede crear modelos' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) = 0 then
    raise exception 'El nombre del modelo no puede estar vacío' using errcode = '22023';
  end if;

  v_slug := public.xah_slugify(v_name);

  insert into public.vehicle_models (make_id, name, slug)
  values (p_make_id, v_name, v_slug)
  on conflict (make_id, slug) do update set name = public.vehicle_models.name
  returning id into v_id;

  update public.profile_vehicles pv
     set model_id = v_id,
         model_text = null
   where pv.make_id = p_make_id
     and pv.model_text is not null
     and public.xah_slugify(pv.model_text) = v_slug;
  get diagnostics v_moved = row_count;

  return query select v_id, v_moved;
end;
$$;

revoke all     on function public.admin_unmatched_vehicle_models() from public;
revoke execute on function public.admin_unmatched_vehicle_models() from anon;
grant  execute on function public.admin_unmatched_vehicle_models() to authenticated;

revoke all     on function public.admin_create_vehicle_model(bigint, text) from public;
revoke execute on function public.admin_create_vehicle_model(bigint, text) from anon;
grant  execute on function public.admin_create_vehicle_model(bigint, text) to authenticated;
