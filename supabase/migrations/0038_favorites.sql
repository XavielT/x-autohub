-- =============================================================================
-- X AutoHub — Favoritos (0038)
-- =============================================================================
--
-- Una persona con cuenta guarda productos de la tienda para volver a ellos. Sin
-- cuenta no hay favoritos: es una de las razones para crearla.
--
--   · Cada quien ve, agrega y borra solo los suyos (`auth.uid() = user_id`, en
--     `using` y en `with check`). No hay UPDATE: un favorito existe o no existe.
--   · `anon` no tiene acceso a la tabla.
--   · Un producto que se borra se lleva sus favoritos (`on delete cascade`).
--   · Hasta 200 por persona: un trigger lo exige con un 22023, el único código que
--     `translateDbError` deja pasar con su mensaje.
--
-- Un producto inactivo o de prueba que ya estaba guardado sigue en la tabla pero
-- el frontend lo pide a `hub_parts`, así que RLS de esa tabla decide si se ve.
--
-- Esta migración es solo aditiva: el frontend anterior no la usa y no rompe.

create table if not exists public.favorites (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  part_id    bigint      not null references public.hub_parts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, part_id)
);

-- Para listar los de una persona del más nuevo al más viejo.
create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

drop policy if exists "cada quien ve sus favoritos" on public.favorites;
create policy "cada quien ve sus favoritos"
  on public.favorites for select
  using (auth.uid() = user_id);

drop policy if exists "cada quien agrega sus favoritos" on public.favorites;
create policy "cada quien agrega sus favoritos"
  on public.favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "cada quien borra sus favoritos" on public.favorites;
create policy "cada quien borra sus favoritos"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- Los default privileges de Supabase le dan a `anon` y `authenticated` todo sobre las tablas
-- nuevas; se deja a `authenticated` lo justo y a `anon` nada.
revoke all on public.favorites from public;
revoke all on public.favorites from anon;
revoke all on public.favorites from authenticated;
grant select, insert, delete on public.favorites to authenticated;

create or replace function public.favorites_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.favorites where user_id = new.user_id) >= 200 then
    raise exception 'Llegaste al maximo de 200 favoritos. Quita alguno para guardar otro.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists favorites_limit on public.favorites;
create trigger favorites_limit
  before insert on public.favorites
  for each row execute function public.favorites_limit();

comment on table public.favorites is
  'Productos guardados por una persona con cuenta (0038). Solo ella los ve y los cambia; máximo 200.';
