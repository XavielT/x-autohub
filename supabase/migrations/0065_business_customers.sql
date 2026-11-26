-- =============================================================================
-- 0065 · Clientes de X AutoHub (solo admin)
-- =============================================================================
--
-- Hasta aquí los clientes de las cotizaciones y facturas solo existían escritos dentro de cada documento. Ahora
-- tienen su propia tabla, que un admin crea, edita y borra desde /admin/clientes:
--
--   · `business_customers`: nombre, teléfono, correo, RNC / cédula, dirección, notas y los vehículos con los que ya
--     vino (`vehicles`, jsonb: `{ text, plate, mileage, vin }`). Solo un admin la lee y escribe.
--   · `business_documents.customer_id`: de qué cliente es el documento. **El documento conserva su propia copia de los
--     datos** (nombre, teléfono…): una factura emitida no cambia porque después se edite al cliente. Si se borra el
--     cliente, sus documentos se quedan y el vínculo pasa a nulo.
--   · `name_key`: el nombre sin mayúsculas, acentos ni espacios de sobra, para encontrar al cliente por nombre. No es
--     único a propósito: dos personas pueden llamarse igual.
--
-- Al crearse, la tabla se llena con los clientes que ya aparecen en los documentos (uno por nombre, con los datos más
-- recientes y los vehículos que ya se usaron) y los documentos quedan vinculados. Solo corre si la tabla está vacía, así
-- que repetir la migración no duplica nada.
--
-- ESTA MIGRACIÓN SE PUEDE EJECUTAR DOS VECES.
-- =============================================================================

create table if not exists public.business_customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  name_key   text generated always as (public.xah_unaccent(lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))) stored,
  phone      text not null default '',
  email      text not null default '',
  rnc        text not null default '',
  address    text not null default '',
  notes      text not null default '',
  vehicles   jsonb not null default '[]'::jsonb check (jsonb_typeof(vehicles) = 'array'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_customers_name_key_idx on public.business_customers (name_key);

comment on table public.business_customers is
  'Clientes de cotizaciones y facturas. Solo admin. Los documentos guardan su propia copia de los datos.';

-- Marca de tiempo y autor: no se escriben desde el navegador.
create or replace function public.business_customers_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.business_customers_touch() from public;
revoke execute on function public.business_customers_touch() from anon, authenticated;

drop trigger if exists business_customers_touch on public.business_customers;
create trigger business_customers_touch
  before insert or update on public.business_customers
  for each row execute function public.business_customers_touch();

-- Solo admin. `anon` ni siquiera tiene el permiso de tabla.
alter table public.business_customers enable row level security;

revoke all on public.business_customers from public;
revoke all on public.business_customers from anon, authenticated;
grant select, insert, update, delete on public.business_customers to authenticated;

drop policy if exists "solo admin lee los clientes" on public.business_customers;
create policy "solo admin lee los clientes" on public.business_customers
  for select to authenticated using (public.is_admin());

drop policy if exists "solo admin crea los clientes" on public.business_customers;
create policy "solo admin crea los clientes" on public.business_customers
  for insert to authenticated with check (public.is_admin());

drop policy if exists "solo admin edita los clientes" on public.business_customers;
create policy "solo admin edita los clientes" on public.business_customers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "solo admin borra los clientes" on public.business_customers;
create policy "solo admin borra los clientes" on public.business_customers
  for delete to authenticated using (public.is_admin());

-- El vínculo de cada documento con su cliente.
alter table public.business_documents
  add column if not exists customer_id uuid references public.business_customers (id) on delete set null;

create index if not exists business_documents_customer_idx on public.business_documents (customer_id);

-- -----------------------------------------------------------------------------
-- Los clientes que ya estaban escritos en los documentos pasan a la tabla.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.business_customers) then
    return;
  end if;

  with docs as (
    select d.*,
           public.xah_unaccent(lower(regexp_replace(btrim(d.customer_name), '\s+', ' ', 'g'))) as k
      from public.business_documents d
     where btrim(d.customer_name) <> ''
  ),
  latest as (
    -- El nombre y lo que falte, del documento más reciente que lo tenga.
    select k,
           (array_agg(btrim(customer_name) order by created_at desc))[1] as name,
           coalesce((array_agg(nullif(btrim(customer_phone), '') order by created_at desc) filter (where nullif(btrim(customer_phone), '') is not null))[1], '') as phone,
           coalesce((array_agg(nullif(btrim(customer_email), '') order by created_at desc) filter (where nullif(btrim(customer_email), '') is not null))[1], '') as email,
           coalesce((array_agg(nullif(btrim(customer_rnc), '') order by created_at desc) filter (where nullif(btrim(customer_rnc), '') is not null))[1], '') as rnc,
           min(created_at) as first_at
      from docs
     group by k
  ),
  cars as (
    -- Los vehículos distintos (por placa o, sin ella, por nombre), el más reciente primero.
    select k,
           jsonb_agg(
             jsonb_build_object(
               'text', coalesce(vehicle ->> 'text', ''),
               'plate', coalesce(vehicle ->> 'plate', ''),
               'mileage', coalesce(vehicle ->> 'mileage', ''),
               'vin', coalesce(vehicle ->> 'vin', '')
             )
             order by created_at desc
           ) as vehicles
      from (
        select distinct on (k, coalesce(nullif(lower(btrim(vehicle ->> 'plate')), ''), lower(btrim(vehicle ->> 'text'))))
               k, vehicle, created_at
          from docs
         where btrim(coalesce(vehicle ->> 'plate', '')) <> '' or btrim(coalesce(vehicle ->> 'text', '')) <> ''
         order by k, coalesce(nullif(lower(btrim(vehicle ->> 'plate')), ''), lower(btrim(vehicle ->> 'text'))), created_at desc
      ) v
     group by k
  )
  insert into public.business_customers (name, phone, email, rnc, vehicles, created_at)
  select l.name, l.phone, l.email, l.rnc, coalesce(c.vehicles, '[]'::jsonb), l.first_at
    from latest l
    left join cars c on c.k = l.k;

  update public.business_documents d
     set customer_id = c.id
    from public.business_customers c
   where d.customer_id is null
     and btrim(d.customer_name) <> ''
     and c.name_key = public.xah_unaccent(lower(regexp_replace(btrim(d.customer_name), '\s+', ' ', 'g')));
end;
$$;
