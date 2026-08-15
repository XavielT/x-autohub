-- =============================================================================
-- X AutoHub — Roles: admin > moderador > user
-- =============================================================================
--
-- Hasta ahora solo había dos niveles, y uno de ellos era un booleano:
-- `is_admin`. Eso alcanza mientras "poder" signifique una sola cosa, pero el
-- producto necesita un tercer nivel: alguien que apruebe publicaciones cuando el
-- admin no está, **sin** poder tocar el catálogo, los pedidos, el inventario ni
-- nombrar a nadie. Un booleano no expresa eso; una columna `role` sí.
--
-- Jerarquía, de más a menos:
--
--   admin      — todo. Es el único que puede repartir roles.
--   moderador  — aprueba y rechaza publicaciones de Hub Market. Nada más.
--   user       — el valor por defecto de cualquier cuenta nueva.
--
--
-- QUÉ PASA CON `is_admin`
-- -----------------------
-- Se **conserva como espejo sincronizado**, con `role` como única fuente de
-- verdad. La decisión salió de contar qué depende de cada cosa:
--
--   · Del **helper** `public.is_admin()` dependen ~30 políticas RLS repartidas
--     por 0002, 0007 y 0008. Todas siguen funcionando sin tocarlas, porque aquí
--     se redefine la función para que lea `role`. Una línea, treinta políticas.
--
--   · De la **columna** `is_admin` dependen menos cosas, pero son molestas de
--     mover a la vez: el grant de columna de 0006, `admin_list_users()` (0007),
--     `get_my_profile()` (0009), los tipos `MyProfileRow` / `AdminUserRow` y
--     `mappers.toUser`. Y sobre todo: **el bundle que ya está desplegado sigue
--     leyendo `is_admin`.** Borrar la columna rompe a todo usuario con la app
--     abierta hasta que recargue.
--
-- Mantenerla sincronizada cuesta dos líneas de trigger y no deja nada a medias.
-- Cuando ya no quede cliente viejo, se borra en una migración de una línea.
--
-- Se descartó una **columna generada** (`generated always as (role = 'admin')`)
-- aunque parezca lo más limpio: el trigger de 0005/0007 hace
-- `new.is_admin := old.is_admin`, y a una columna generada no se le puede
-- asignar dentro de un trigger BEFORE — Postgres lo rechaza. Habría que
-- reescribir el trigger de congelado para que la esquive, que es justo el
-- código más delicado del esquema. No vale la pena.
--
--
-- POR QUÉ `role` TAMBIÉN SE CONGELA
-- ---------------------------------
-- Exactamente por lo que documenta 0005: RLS no filtra por columna. La política
-- de update de `profiles` dice "solo tu propia fila", y nada dentro de esa regla
-- impide que la fila que mandas traiga `role = 'admin'`. Sin el congelado, esta
-- migración reabriría la escalada de privilegios que 0005 cerró, solo que con
-- otro nombre de columna. El trigger se extiende, no se reemplaza.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La columna
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_valid;

alter table public.profiles
  add constraint profiles_role_valid check (role in ('admin', 'moderador', 'user'));

comment on column public.profiles.role is
  'admin > moderador > user. Fuente de verdad de los permisos; is_admin es su espejo.';

comment on column public.profiles.is_admin is
  'ESPEJO de (role = ''admin''), mantenido por trigger. No escribir directo: usa set_user_role().';

-- Backfill: quien era admin lo sigue siendo. El resto queda en 'user' por el
-- default, que es lo correcto — nadie nace moderador.
update public.profiles set role = 'admin' where is_admin and role <> 'admin';


-- -----------------------------------------------------------------------------
-- 2. Helpers para las políticas
-- -----------------------------------------------------------------------------
-- `is_admin()` ahora lee `role`. Con esto las ~30 políticas que ya la llaman
-- pasan a la nueva fuente de verdad sin editar ni una.
--
-- Las dos son `security definer` por lo mismo que explicaba 0002: leen
-- `profiles`, y sin eso su propia política de lectura entraría en recursión.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Quién puede moderar publicaciones. Un admin siempre puede lo que puede un
-- moderador; la jerarquía se codifica aquí y no en cada política, para que no
-- haya dos sitios donde equivocarse.
create or replace function public.is_moderator_or_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.role in ('admin', 'moderador') from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_moderator_or_admin() is
  'true para moderador y para admin. Un admin puede todo lo que puede un moderador.';


-- -----------------------------------------------------------------------------
-- 3. Congelar `role` y mantener `is_admin` en espejo
-- -----------------------------------------------------------------------------
-- Se extiende el trigger de 0005 (redefinido en 0007), no se crea otro: son la
-- misma regla —"desde el navegador no se cambian privilegios"— y tenerla en dos
-- funciones distintas es cómo se termina arreglando una y olvidando la otra.
--
-- El orden importa: primero se congela (o no) el rol, y solo después se deriva
-- `is_admin` del rol que quedó. Así el espejo nunca refleja un valor que el
-- congelado acaba de rechazar.
--
-- La puerta legítima sigue siendo la misma de 0007: `service_role`, o el ajuste
-- de transacción `app.allow_privilege_change` que solo pueden poner las
-- funciones `security definer` de este esquema. Desde PostgREST no se puede.

create or replace function public.freeze_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('app.allow_privilege_change', true), '') <> 'on' then
    new.role        := old.role;
    new.is_admin    := old.is_admin;
    new.is_verified := old.is_verified;
  end if;

  -- El espejo se deriva siempre, incluso para service_role: es lo que garantiza
  -- que las dos columnas no puedan discrepar por ningún camino.
  new.is_admin := (new.role = 'admin');

  return new;
end;
$$;

drop trigger if exists profiles_freeze_privileges on public.profiles;

create trigger profiles_freeze_privileges
  before update on public.profiles
  for each row execute function public.freeze_profile_privileges();

-- En el INSERT no hay nada que congelar (no hay valor anterior), pero sí que
-- sincronizar: el perfil lo crea `handle_new_user()` con los defaults, y si
-- algún día un script inserta con `role = 'admin'` sin poner `is_admin`, las dos
-- columnas nacerían discrepando.
create or replace function public.sync_profile_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.is_admin := (new.role = 'admin');
  return new;
end;
$$;

drop trigger if exists profiles_sync_is_admin on public.profiles;

create trigger profiles_sync_is_admin
  before insert on public.profiles
  for each row execute function public.sync_profile_is_admin();


-- -----------------------------------------------------------------------------
-- 4. Repartir roles — solo un admin
-- -----------------------------------------------------------------------------
-- Sustituye a `set_user_admin()`. Misma forma y mismas defensas que la de 0007,
-- con dos diferencias que importan:
--
--   · Recibe un rol, no un booleano.
--   · **Un moderador no puede nombrar a nadie.** La comprobación es
--     `is_admin()`, no `is_moderator_or_admin()`. Delegar la moderación no es
--     delegar el poder de repartir permisos: si un moderador pudiera nombrar
--     moderadores —o peor, admins— el rol dejaría de ser un escalón y sería una
--     puerta trasera al nivel de arriba.

create or replace function public.set_user_role(
  p_user_id     uuid,
  p_role        text,
  p_is_verified boolean default null
)
returns table (id uuid, display_name text, role text, is_admin boolean, is_verified boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar roles.' using errcode = '42501';
  end if;

  if p_role not in ('admin', 'moderador', 'user') then
    raise exception 'Rol no valido: %.', p_role using errcode = '22023';
  end if;

  -- Un admin no se degrada a sí mismo: si es el único, el panel se queda sin
  -- dueño y ya no hay forma de volver a entrar sin la clave service_role. Es la
  -- misma protección que traía set_user_admin(), con la regla ampliada.
  if p_user_id = v_caller and p_role <> 'admin' then
    raise exception 'No puedes quitarte a ti mismo el acceso de administrador.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where profiles.id = p_user_id) then
    raise exception 'Ese usuario no existe.' using errcode = '22023';
  end if;

  perform set_config('app.allow_privilege_change', 'on', true);

  update public.profiles p
     set role        = p_role,
         is_verified = coalesce(p_is_verified, p.is_verified)
   where p.id = p_user_id;

  perform set_config('app.allow_privilege_change', 'off', true);

  return query
    select p.id, p.display_name, p.role, p.is_admin, p.is_verified
    from public.profiles p
    where p.id = p_user_id;
end;
$$;

revoke all on function public.set_user_role(uuid, text, boolean) from public;
grant execute on function public.set_user_role(uuid, text, boolean) to authenticated;


-- `set_user_admin()` queda como envoltorio, por la misma razón que se conserva
-- la columna: el bundle desplegado todavía la llama. Traduce el booleano al rol
-- y delega, así que no hay dos implementaciones que puedan divergir.
create or replace function public.set_user_admin(
  p_user_id     uuid,
  p_is_admin    boolean,
  p_is_verified boolean default null
)
returns table (id uuid, display_name text, is_admin boolean, is_verified boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select r.id, r.display_name, r.is_admin, r.is_verified
    from public.set_user_role(
      p_user_id,
      case when p_is_admin then 'admin' else 'user' end,
      p_is_verified
    ) r;
end;
$$;

comment on function public.set_user_admin(uuid, boolean, boolean) is
  'OBSOLETA: envoltorio de set_user_role() para clientes viejos. Degrada a user, no a moderador.';

revoke all on function public.set_user_admin(uuid, boolean, boolean) from public;
grant execute on function public.set_user_admin(uuid, boolean, boolean) to authenticated;


-- -----------------------------------------------------------------------------
-- 5. El rol en las funciones que ya lee el panel
-- -----------------------------------------------------------------------------
-- Las dos siguen siendo `security definer` y siguen comprobando quién llama.
-- Se redefinen enteras porque en Postgres no se puede añadir una columna al
-- `returns table` de una función existente sin volver a crearla.
--
-- `admin_list_users()` sigue exigiendo **admin**: la lista trae correos y
-- teléfonos de todo el mundo, que es justo lo que 0006 sacó del alcance de las
-- claves del navegador. Un moderador no tiene por qué verlos.

drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id           uuid,
  display_name text,
  email        text,
  phone        text,
  location     text,
  role         text,
  is_admin     boolean,
  is_verified  boolean,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede ver los usuarios.' using errcode = '42501';
  end if;

  return query
    select p.id, p.display_name, p.email, p.phone, p.location,
           p.role, p.is_admin, p.is_verified, p.created_at
    from public.profiles p
    order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;


-- `get_my_profile()` devuelve el rol del propio usuario. Es lo que alimenta las
-- señales `isAdmin` / `canModerate` del cliente. Sigue sin recibir ningún id.
drop function if exists public.get_my_profile();

create or replace function public.get_my_profile()
returns table (
  id           uuid,
  display_name text,
  email        text,
  phone        text,
  location     text,
  avatar_url   text,
  role         text,
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
           p.avatar_url, p.role, p.is_verified, p.is_admin, p.created_at
    from public.profiles p
    where p.id = v_uid;
end;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;


-- -----------------------------------------------------------------------------
-- Nota sobre permisos de columna
-- -----------------------------------------------------------------------------
-- `role` **no** se agrega al grant de select de 0006, a propósito. El rol propio
-- llega por `get_my_profile()` y el de los demás por `admin_list_users()`, las
-- dos `security definer`, que se saltan los permisos de columna y comprueban
-- quién llama. Ningún select del navegador necesita la columna, así que dejarla
-- fuera es gratis y evita publicar quién modera.
