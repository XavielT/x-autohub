-- =============================================================================
-- X AutoHub — Ajustes del sitio y contadores reales del home
-- =============================================================================
--
-- La sección de contadores del home ("280+ Vehiculos", "1.3K Piezas", "2.8K
-- Miembros") era **HTML escrito a mano**. No salía de ningún dato: el sitio
-- decía 280 vehículos teniendo 6.
--
-- Esta migración trae las dos piezas que hacen falta para que sea real sin
-- perder la primera impresión:
--
--   1. `site_settings` — una tabla clave/valor con un ajuste: `stats_mode`,
--      que vale `"showcase"` (los números de siempre) o `"real"` (lo que hay
--      de verdad). Lo cambia un admin desde /admin/ajustes y **aplica a lo que
--      ve todo el mundo**, incluido quien no tiene sesión.
--
--   2. `get_site_stats()` — los tres conteos en una sola llamada, con las
--      reglas de visibilidad de un visitante anónimo.
--
--
-- POR QUÉ UNA TABLA CLAVE/VALOR Y NO UNA COLUMNA POR AJUSTE
-- --------------------------------------------------------
-- Porque hoy hay **un** ajuste y mañana habrá tres, y cada uno como columna
-- significa una migración, un tipo nuevo y un mapper cada vez. `jsonb` en el
-- valor evita además tener que decidir ahora si el próximo ajuste es un
-- booleano, un número o una lista.
--
-- El precio es que el tipo del valor no lo comprueba Postgres. Se paga con un
-- `check` en la única clave que existe hoy: si alguien escribe
-- `stats_mode = "showcas"`, falla aquí y no seis meses después en el navegador.
--
--
-- POR QUÉ LA ESCRITURA NO TIENE POLÍTICA
-- --------------------------------------
-- Las migraciones 0005 y 0011 documentan la trampa: **RLS no filtra por
-- columna.** Una política de update que diga "solo tu propia fila" no impide
-- que la fila que mandas traiga `is_admin = true`, y por eso `profiles`
-- necesita un trigger de congelado además de su política.
--
-- Aquí el problema no aparece, porque la tabla **no tiene ninguna política de
-- escritura**: sin política, RLS niega por defecto, así que ni `anon` ni
-- `authenticated` pueden escribir por PostgREST — ni una fila nueva, ni un
-- update, ni un delete. El único camino es `set_site_setting()`, que es
-- `security definer` y vuelve a comprobar `is_admin()` dentro de Postgres.
--
-- Aun así se añade el trigger de congelado (punto 4). No protege de nada hoy:
-- protege del día en que alguien agregue una política de escritura "para poder
-- editar los ajustes desde el Table Editor" y reabra el agujero sin darse
-- cuenta. Es la misma defensa en profundidad de 0005, y cuesta quince líneas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------

create table if not exists public.site_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is
  'Ajustes del sitio, clave/valor. Se leen en publico; se escriben solo con set_site_setting().';

comment on column public.site_settings.value is
  'jsonb. Para stats_mode es un string JSON: "showcase" o "real".';

-- El único valor validado, porque es el único que existe. Cuando se agregue
-- otra clave, se extiende este check con su rama.
alter table public.site_settings
  drop constraint if exists site_settings_value_valid;

alter table public.site_settings
  add constraint site_settings_value_valid check (
    key <> 'stats_mode'
    or value #>> '{}' in ('showcase', 'real')
  );

-- Arranca en `showcase`: mientras el sitio es joven, los números reales son
-- pequeños y la sección es lo primero que ve alguien que llega. Cambiarlo es un
-- clic en /admin/ajustes.
insert into public.site_settings (key, value)
values ('stats_mode', '"showcase"')
on conflict (key) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Lectura pública, escritura por ningún lado
-- -----------------------------------------------------------------------------
-- El home tiene que poder leer el ajuste **sin sesión**: si solo lo leyera un
-- usuario autenticado, la sección se comportaría distinto para un visitante
-- anónimo, que es justo el que importa aquí.

alter table public.site_settings enable row level security;

drop policy if exists "los ajustes del sitio los lee cualquiera" on public.site_settings;

create policy "los ajustes del sitio los lee cualquiera"
  on public.site_settings for select
  to anon, authenticated
  using (true);

-- Sin política de insert, update ni delete. No es un olvido: es el mecanismo.

-- El grant, que RLS **no** sustituye: una política dice qué filas, un grant dice
-- si la tabla se puede tocar. En el proyecto de Supabase las tablas nuevas del
-- esquema `public` ya reciben este permiso por los default privileges de la
-- plataforma, y por eso ninguna de las 13 migraciones anteriores lo escribe. Se
-- escribe aquí igualmente porque se comprobó que sin él `anon` recibe
-- `permission denied for table site_settings` — y prefiero que la migración se
-- sostenga sola en cualquier Postgres a que dependa de un default de la
-- plataforma para que el home cargue sin sesión.
grant select on public.site_settings to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. Escribir un ajuste — solo un admin
-- -----------------------------------------------------------------------------
-- Misma forma que `set_user_role()` (0011) y `moderate_publication()` (0012):
-- `security definer`, comprobación del rol **dentro** de Postgres, y el grant
-- solo a `authenticated`. Un moderador no entra: los ajustes del sitio no son
-- moderación de contenido.

create or replace function public.set_site_setting(p_key text, p_value jsonb)
returns table (key text, value jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cambiar los ajustes del sitio.'
      using errcode = '42501';
  end if;

  -- No se crean claves desde el navegador. Un ajuste nuevo nace en una
  -- migración, con su `check` y su valor por defecto; si se pudiera inventar
  -- aquí, la tabla acabaría con claves que ningún código lee y con el ajuste
  -- de verdad escrito con un typo.
  if not exists (select 1 from public.site_settings s where s.key = p_key) then
    raise exception 'Ese ajuste no existe: %.', p_key using errcode = '22023';
  end if;

  perform set_config('app.allow_site_settings_write', 'on', true);

  update public.site_settings s
     set value = p_value,
         updated_at = now()
   where s.key = p_key;

  perform set_config('app.allow_site_settings_write', 'off', true);

  return query
    select s.key, s.value, s.updated_at
    from public.site_settings s
    where s.key = p_key;
end;
$$;

comment on function public.set_site_setting(text, jsonb) is
  'Cambia un ajuste existente. Solo admin (lo comprueba dentro de Postgres).';

-- El `revoke ... from public` **no alcanza**, y conviene saberlo: en el proyecto
-- de Supabase las funciones nuevas del esquema `public` nacen con un grant
-- directo a `anon` y a `authenticated` por los default privileges de la
-- plataforma, y quitarle el permiso al pseudo-rol PUBLIC no toca esos grants.
-- Se comprobó contra la base en vivo: sin el `revoke ... from anon` de abajo,
-- `anon` **puede invocar** esta función (le responde 42501 el `is_admin()` de
-- dentro, que es lo que de verdad protege — pero el permiso estaba ahí).
--
-- Las funciones de 0009/0011/0012 usan el idiom sin el revoke y por tanto
-- siguen siendo invocables por `anon`; queda anotado como pendiente en la
-- bitácora, no se cambia aquí: son migraciones ya aplicadas y eso es una
-- decisión de Xaviel, no un arreglo de esta fase.
revoke all on function public.set_site_setting(text, jsonb) from public;
revoke execute on function public.set_site_setting(text, jsonb) from anon;
grant execute on function public.set_site_setting(text, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
-- 4. Congelado: defensa en profundidad
-- -----------------------------------------------------------------------------
-- Ver la cabecera. Hoy no hay política de escritura, así que este trigger no se
-- dispara nunca desde el navegador. Está para el día en que alguien agregue una.
--
-- La puerta legítima es la misma que en 0007/0011: `service_role` (scripts de
-- administración, el Table Editor del dashboard) o el ajuste de transacción que
-- solo pone `set_site_setting()`.
--
-- Lo que se bloquea es **exactamente** `anon` y `authenticated`, y no "todo lo
-- que no sea service_role", que es como lo escriben 0007 y 0011. La diferencia
-- importa aquí: en una sesión SQL directa —una migración, el editor del
-- dashboard, la Management API— no hay JWT y `auth.role()` es null, así que la
-- versión de 0011 se bloquearía a sí misma. Concretamente: volver a ejecutar
-- esta migración fallaría, porque un trigger BEFORE INSERT se dispara **antes**
-- de que el `on conflict do nothing` resuelva el conflicto. Y no se pierde nada
-- de seguridad: quien tiene una conexión SQL directa puede borrar el trigger.

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

  return new;
end;
$$;

drop trigger if exists site_settings_guard_write on public.site_settings;

create trigger site_settings_guard_write
  before insert or update or delete on public.site_settings
  for each row execute function public.guard_site_settings_write();


-- -----------------------------------------------------------------------------
-- 5. Los tres conteos
-- -----------------------------------------------------------------------------
-- Una sola función y una sola llamada: la sección del home necesita los tres a
-- la vez, y tres consultas serían tres viajes para pintar una fila.
--
-- Es `security definer` por **miembros**: contar `profiles` con la clave anon es
-- imposible a propósito (0002 no le da select, y 0006 le quitó las columnas
-- personales). La función devuelve **solo el número** — ninguna fila, ningún
-- correo, ningún nombre.
--
-- Y como `security definer` se salta RLS, las condiciones de visibilidad van
-- escritas aquí a mano. Eso es lo que se quiere: los contadores tienen que decir
-- lo mismo a todo el mundo. Sin esto, un admin —que por RLS ve el contenido de
-- prueba y las publicaciones pendientes— vería en el home unos números que
-- ningún visitante ve, y creería que el sitio tiene más de lo que muestra.
--
-- Las condiciones son el espejo de las políticas de select de 0013 para un
-- usuario sin sesión (`can_see_test_items()` = false):
--
--   auto_hub_vehicles  is_available and not is_test
--   hub_parts          is_active    and not is_test
--   hub_market_items   is_active and status = 'aprobado' and not is_test
--
-- **Si alguna de esas políticas cambia, esta función hay que cambiarla.**

create or replace function public.get_site_stats()
returns table (vehicles bigint, parts bigint, members bigint)
language sql
security definer
stable
set search_path = public
as $$
  select
    -- Vehículos = los de la empresa (Auto Hub) más los de la comunidad que ya
    -- pasaron moderación. Es lo que un visitante puede abrir hoy.
    (
      (select count(*) from public.auto_hub_vehicles v
        where v.is_available and not v.is_test)
      +
      (select count(*) from public.hub_market_items m
        where m.is_active and m.status = 'aprobado' and not m.is_test
          and m.category = 'vehiculos')
    ) as vehicles,
    (select count(*) from public.hub_parts p
      where p.is_active and not p.is_test) as parts,
    -- Miembros = cuentas reales. Las de prueba no cuentan: existen para ver el
    -- contenido marcado, no son comunidad.
    (select count(*) from public.profiles pr
      where not pr.is_test_user) as members;
$$;

comment on function public.get_site_stats() is
  'Los tres contadores del home con la visibilidad de un visitante anonimo. Devuelve solo numeros.';

-- La lee el home, que funciona sin sesión: `anon` tiene que poder ejecutarla.
revoke all on function public.get_site_stats() from public;
grant execute on function public.get_site_stats() to anon, authenticated;
