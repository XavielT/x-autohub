-- =============================================================================
-- X AutoHub — Leer el propio perfil completo
-- =============================================================================
--
-- La migración 0006 le quitó `email` y `phone` a las claves anon y authenticated
-- porque cualquiera podía descargar los de todos los usuarios. Fue lo correcto,
-- pero deja un hueco: **un usuario tampoco puede leer su propio teléfono.** Los
-- permisos de columna son por rol, no por fila, así que no hay forma de decir
-- "este puede ver el suyo" con un `grant`.
--
-- Consecuencia real, comprobada antes de escribir esto: `UserModel.phone` es
-- siempre `undefined` en modo Supabase, así que la página de perfil diría
-- "Sin telefono" aunque haya uno guardado, y el checkout nunca precargaba el
-- teléfono de quien ya tenía sesión.
--
-- Esta función lo resuelve con el mismo patrón que `admin_list_users()` (0007):
-- `security definer` para saltarse los permisos de columna, y **sin parámetros**,
-- de modo que solo puede devolver la fila de `auth.uid()`. No hay nada que
-- manipular desde el cliente: no recibe un id que pudiera falsearse.
-- =============================================================================

create or replace function public.get_my_profile()
returns table (
  id           uuid,
  display_name text,
  email        text,
  phone        text,
  location     text,
  avatar_url   text,
  is_verified  boolean,
  is_admin     boolean,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitas una sesion para ver tu perfil.' using errcode = '42501';
  end if;

  return query
    select p.id, p.display_name, p.email, p.phone, p.location,
           p.avatar_url, p.is_verified, p.is_admin, p.created_at
    from public.profiles p
    where p.id = v_uid;
end;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;
