#!/usr/bin/env bash
#
# Levanta un Postgres temporal, le aplica las migraciones y el seed desde cero, y
# comprueba que las reglas de seguridad hacen lo que dicen.
#
#   ./scripts/verify-migrations.sh
#
# No toca ninguna base real: crea un cluster con `initdb` en un directorio
# temporal (sin sudo, sin Docker), lo usa y lo borra. Lo unico que hace falta
# instalado es Postgres.
#
#
# PARA QUE SIRVE
# --------------
# Ni el build, ni `tsc`, ni las pruebas del suite ven un solo error de SQL: las
# pruebas corren en modo simulado a proposito (`TestSupabaseService`), y en modo
# simulado no hay Postgres ni RLS. Hasta ahora la unica forma de saber si una
# migracion aplicaba limpia era ejecutarla en la base de verdad.
#
# Lo que este script atrapo mientras se escribia la 0014 y la 0015:
#
#   · Un trigger de congelado copiado de 0011 se bloqueaba a si mismo, y con eso
#     la migracion no se podia volver a ejecutar (un BEFORE INSERT se dispara
#     antes de que el `on conflict do nothing` resuelva el conflicto).
#   · `revoke all ... from public` no le quitaba a `anon` el permiso de invocar
#     las funciones de admin: los default privileges de Supabase le dan un grant
#     directo. Por eso el andamio de abajo **los reproduce**; sin ellos la
#     comprobacion no significaria nada.
#
#
# EL ANDAMIO
# ----------
# Un Postgres pelado no es un proyecto de Supabase. Se le pone el minimo que las
# migraciones dan por hecho: los tres roles, `auth.uid()` / `auth.role()` leyendo
# los claims de la sesion, `auth.users` con su trigger, un `storage` de mentira y
# —importante— los default privileges de la plataforma.
#
# Lo que **no** se reproduce es PostgREST. Hay fallos que solo se ven ahi (el
# `PGRST201` de la ronda 14 es el ejemplo: SQL valido, embed ambiguo), asi que
# esto no sustituye al humo contra la base real despues de desplegar.

set -euo pipefail

cd "$(dirname "$0")/.."

# --- Postgres -----------------------------------------------------------------

PGBIN=""
for candidate in $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -rV) ""; do
  if [ -x "${candidate}/initdb" ]; then PGBIN="$candidate"; break; fi
done
if [ -z "$PGBIN" ]; then
  command -v initdb >/dev/null 2>&1 || {
    echo "No encontre initdb. Instala Postgres (p. ej. apt install postgresql)." >&2
    exit 1
  }
  PGBIN="$(dirname "$(command -v initdb)")"
fi

PORT="${PGPORT_VERIFY:-54329}"
WORKDIR="$(mktemp -d /tmp/x-autohub-verify.XXXXXX)"
SOCKET="$WORKDIR/socket"
PSQL="$PGBIN/psql -h $SOCKET -p $PORT -U postgres -X -q"

cleanup() {
  "$PGBIN/pg_ctl" -D "$WORKDIR/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

mkdir -p "$SOCKET"
echo "→ Cluster temporal en $WORKDIR (puerto $PORT)"
"$PGBIN/initdb" -D "$WORKDIR/data" -U postgres --auth=trust >"$WORKDIR/initdb.log" 2>&1
"$PGBIN/pg_ctl" -D "$WORKDIR/data" \
  -o "-k $SOCKET -p $PORT -c listen_addresses=''" \
  -l "$WORKDIR/postgres.log" start >/dev/null 2>&1

for _ in $(seq 1 20); do
  $PSQL -c 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

# --- Andamio ------------------------------------------------------------------

$PSQL -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
grant usage on schema public to anon, authenticated, service_role;

-- Los default privileges de Supabase. Sin esto `anon` no recibiria EXECUTE en
-- cada funcion nueva, y la comprobacion de los grants de la 0015 seria falsa.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);
-- Los claims de la sesion se fingen con `set request.jwt.claim.*`, que es como
-- los pone PostgREST.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

-- Supabase le da acceso al esquema `auth` a los tres roles, y hace falta: dentro
-- de una politica RLS `auth.uid()` se ejecuta con los permisos del **dueño de la
-- tabla**, asi que las politicas funcionan sin esto — pero una consulta del
-- propio usuario (`update ... where id = auth.uid()`) no, y falla con
-- "permission denied for schema auth". Sin este grant el andamio mentiria.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- El esquema donde Supabase instala las extensiones (unaccent, de la 0017). Los
-- tres roles ya tienen USAGE en la plataforma real (comprobado en la base en
-- vivo); sin esto `search_products()` fallaria para `anon` solo en el andamio.
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;
grant usage on schema storage to anon, authenticated, service_role;
SQL
echo "→ Andamio de Supabase puesto"

# Una segunda base, copia del andamio, para el camino de actualizacion de la
# 0017: la base real ya tiene piezas cuando la migracion se aplica, y el recorrido
# "desde cero + seed" no lo ejercita nunca (ahi hub_parts esta vacia al migrar).
$PSQL -c "create database upgrade template postgres" >/dev/null

# --- Migraciones y seed -------------------------------------------------------

FAILED=0
LAST_MIGRATION=""

apply() {
  local file="$1" db="${2:-postgres}" name
  name="$(basename "$file")"
  if $PSQL -d "$db" -v ON_ERROR_STOP=1 --single-transaction -f "$file" >"$WORKDIR/$name.$db.log" 2>&1; then
    printf '   OK    %s\n' "$name"
  else
    printf '   FALLA %s\n' "$name"
    sed 's/^/         /' "$WORKDIR/$name.$db.log" | head -8
    FAILED=$((FAILED + 1))
  fi
}

echo "→ Aplicando migraciones desde cero"
for migration in supabase/migrations/*.sql; do
  apply "$migration"
  LAST_MIGRATION="$migration"
done
apply supabase/seed.sql

# Cada migracion tiene que poder ejecutarse dos veces: se aplican a mano y es
# facil repetir una. Se prueba con la ultima, que es la que nadie ha repetido
# todavia.
echo "→ Re-aplicando la ultima migracion (idempotencia)"
apply "$LAST_MIGRATION"

# --- Datos de prueba: un admin, un usuario normal y uno de prueba -------------

$PSQL -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@x.com'),
  ('22222222-2222-2222-2222-222222222222', 'user@x.com'),
  ('33333333-3333-3333-3333-333333333333', 'prueba@x.com');

-- El congelado de 0005/0011/0013 exige la clave service_role para tocar estas
-- columnas, que es justo lo que se quiere comprobar de paso.
set request.jwt.claim.role = 'service_role';
update profiles set role = 'admin'      where id = '11111111-1111-1111-1111-111111111111';
update profiles set is_test_user = true where id = '33333333-3333-3333-3333-333333333333';
-- Un nombre conocido en la cuenta ajena, para poder comprobar que nadie se lo
-- cambia por detras.
update profiles set display_name = 'Sin tocar' where id = '33333333-3333-3333-3333-333333333333';
reset request.jwt.claim.role;
SQL

# --- Comprobaciones -----------------------------------------------------------
#
# `check <nombre> <esperado> <sql>`: cada una es un fallo que ya paso o que la
# migracion promete evitar.

CHECKS=0
CHECKS_OK=0

check() {
  local name="$1" expected="$2" sql="$3" raw got
  CHECKS=$((CHECKS + 1))

  # Media docena de comprobaciones esperan que la consulta **falle** (un 42501,
  # un check violado), asi que aqui se apaga `errexit`: con el puesto, un psql en
  # rojo mata el script en vez de dejar comparar el mensaje. `|| true` no basta,
  # porque `pipefail` tambien alcanza a los pipes de la extraccion de abajo.
  set +e
  raw="$($PSQL -d "${CHECK_DB:-postgres}" -t -A -c "$sql" 2>&1)"
  set -e

  # De la salida se saca una sola linea para comparar:
  #
  #   · Si hay un `ERROR:`, esa. Un error de Postgres viene con su `CONTEXT:` y
  #     su `LINE n:` detras, asi que quedarse con la ultima linea dejaba el
  #     mensaje fuera (y comparaba contra un `^`).
  #   · Si no, la ultima linea con algo escrito, que es el valor del select.
  #     Los `SET` y los `UPDATE 0` de los pasos previos se descartan.
  # Un solo `awk` y no una tuberia de `grep`: un grep sin coincidencias devuelve
  # 1, y con `pipefail` eso tumbaba el script justo cuando la consulta no
  # imprimia nada. awk siempre sale en 0.
  got="$(printf '%s\n' "$raw" | tr -d '\r' | awk '
    /^ERROR:/            { print; encontrado = 1; exit }
    /^(SET|RESET|UPDATE|INSERT|DELETE|BEGIN|COMMIT)/ { next }
    NF                   { ultima = $0 }
    END                  { if (!encontrado) print ultima }
  ' | sed 's/^ *//;s/ *$//')"

  if [ "$got" = "$expected" ]; then
    printf '   OK    %s\n' "$name"
    CHECKS_OK=$((CHECKS_OK + 1))
  else
    printf '   FALLA %s\n          esperaba: %s\n          recibio:  %s\n' "$name" "$expected" "$got"
    # La salida completa, que es lo que hace falta para entender por que.
    printf '%s\n' "$raw" | sed 's/^/            | /' | head -6
    FAILED=$((FAILED + 1))
  fi
}

# Envuelve una consulta en una sesion con rol y claims, como la haria PostgREST.
as_anon() { echo "set role anon; set request.jwt.claim.role='anon'; $1"; }
as_user() {
  echo "set role authenticated; set request.jwt.claim.role='authenticated';
        set request.jwt.claim.sub='$1'; $2"
}
# Si una consulta falla, `check` compara contra el texto del error; para eso se
# recorta a la primera linea significativa.
denied() { echo 'ERROR:  permission denied for function '"$1"; }

echo "→ Visibilidad publica (las politicas de select llaman a is_admin(); sin"
echo "  EXECUTE para anon, cada consulta anonima del sitio falla)"
check "anon lee el catalogo"        "35" "$(as_anon 'select count(*) from hub_parts;')"
check "anon lee Auto Hub"           "6"  "$(as_anon 'select count(*) from auto_hub_vehicles;')"
check "anon lee Hub Market"         "7"  "$(as_anon 'select count(*) from hub_market_items;')"
check "anon lee las noticias"       "2"  "$(as_anon 'select count(*) from news;')"
check "anon lee los ajustes"        "showcase" \
  "$(as_anon "select value #>> '{}' from site_settings where key='stats_mode';")"

echo "→ Contenido de prueba (migracion 0013)"
check "anon no ve piezas de prueba"      "0" "$(as_anon 'select count(*) from hub_parts where is_test;')"
check "anon no ve vehiculos de prueba"   "0" "$(as_anon 'select count(*) from auto_hub_vehicles where is_test;')"
check "un usuario de prueba si las ve"   "1" \
  "$(as_user '33333333-3333-3333-3333-333333333333' 'select count(*) from hub_parts where is_test;')"

echo "→ Contadores del home (migracion 0014): la visibilidad de un anonimo,"
echo "  sea quien sea el que llame"
check "vehiculos = 6 propios + 4 aprobados" "10" "$(as_anon 'select vehicles from get_site_stats();')"
check "piezas = 35 activas y no de prueba"  "35" "$(as_anon 'select parts from get_site_stats();')"
check "miembros = 2 (de 3 cuentas, 1 de prueba)" "2" "$(as_anon 'select members from get_site_stats();')"
check "un admin ve los mismos numeros que un anonimo" "10" \
  "$(as_user '11111111-1111-1111-1111-111111111111' 'select vehicles from get_site_stats();')"

# Una publicacion de prueba y una pendiente, las dos de vehiculos: ninguna cuenta.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_market_items
  (title, description, images, price, location, seller_name, category, spec_year, status, is_active, is_test)
values
  ('PRUEBA vehiculo',    'x', '{}', 1, 'Santiago', 'x', 'vehiculos', 2020, 'aprobado',  true, true),
  ('Pendiente vehiculo', 'x', '{}', 1, 'Santiago', 'x', 'vehiculos', 2020, 'pendiente', true, false);
SQL
check "una publicacion de prueba no cuenta"  "10" "$(as_anon 'select vehicles from get_site_stats();')"

echo "→ Ajustes del sitio: escritura solo por set_site_setting() (0014)"
# Ojo con lo que se comprueba aqui: el update de `anon` **no da error**, se queda
# en cero filas. Los default privileges de Supabase le dan UPDATE sobre la tabla
# (se verifico en la base en vivo: `anon` tiene INSERT/UPDATE/DELETE en todo lo
# nuevo del esquema public), asi que lo unico que lo detiene es que no hay
# politica de escritura. Lo que importa no es el error, es que el valor no
# cambie: es exactamente lo que responde PostgREST en produccion — HTTP 200 con
# `[]`.
check "un update de anon deja el ajuste como estaba" "showcase" \
  "$(as_anon "update site_settings set value='\"real\"' where key='stats_mode';
              select value #>> '{}' from site_settings where key='stats_mode';")"
check "anon no puede invocar set_site_setting" "$(denied set_site_setting)" \
  "$(as_anon "select * from set_site_setting('stats_mode','\"real\"');")"
check "un usuario normal recibe 42501" \
  "ERROR:  Solo un administrador puede cambiar los ajustes del sitio." \
  "$(as_user '22222222-2222-2222-2222-222222222222' "select * from set_site_setting('stats_mode','\"real\"');")"
check "un admin si lo cambia" "real" \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select value #>> '{}' from set_site_setting('stats_mode','\"real\"');")"
check "un valor invalido lo rechaza el check" \
  "ERROR:  new row for relation \"site_settings\" violates check constraint \"site_settings_value_valid\"" \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select * from set_site_setting('stats_mode','\"showcas\"');")"
check "no se pueden inventar claves" "ERROR:  Ese ajuste no existe: inventada." \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select * from set_site_setting('inventada','\"x\"');")"

echo "→ Grants de las funciones de admin (migracion 0015)"
for fn in admin_list_users get_my_profile; do
  check "anon no invoca $fn" "$(denied $fn)" "$(as_anon "select * from $fn();")"
done
check "anon no invoca set_user_role" "$(denied set_user_role)" \
  "$(as_anon "select * from set_user_role('22222222-2222-2222-2222-222222222222','admin');")"
check "anon no invoca set_user_test" "$(denied set_user_test)" \
  "$(as_anon "select * from set_user_test('22222222-2222-2222-2222-222222222222', true);")"
check "anon no invoca moderate_publication" "$(denied moderate_publication)" \
  "$(as_anon "select * from moderate_publication(1,'aprobado');")"
check "un admin si las usa" "admin" \
  "$(as_user '11111111-1111-1111-1111-111111111111' 'select role from get_my_profile();')"
check "un usuario normal no lista usuarios" \
  "ERROR:  Solo un administrador puede ver los usuarios." \
  "$(as_user '22222222-2222-2222-2222-222222222222' 'select * from admin_list_users();')"

echo "→ Lo que anon **si** tiene que poder hacer (revocar de mas rompe el sitio)"
check "checkout de invitado" "1" \
  "$(as_anon "select count(*) from create_order('invitado@correo.com','Cliente Invitado','Calle 1','standard','card','[{\"part_id\": 1, \"quantity\": 1}]'::jsonb);")"
check "contadores del home sin sesion" "35" "$(as_anon 'select parts from get_site_stats();')"

echo "→ Baja del club con token (migracion 0016)"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into club_subscriptions (email) values ('uno@correo.com'), ('dos@correo.com');
SQL
check "cada suscriptor recibe su propio token" "2" \
  "select count(distinct unsubscribe_token) from club_subscriptions;"
# Ojo con lo que se comprueba: `anon` **no** recibe un error, recibe **cero
# filas**. La tabla tiene el grant de tabla por los default privileges y lo que
# la cierra es que no hay politica de select desde 0002 — igual que
# `site_settings`. Lo que importa es que la lista de correos y sus tokens no
# salgan, no como se niegan.
check "la lista y sus tokens no salen con la clave del navegador" "0" \
  "$(as_anon 'select count(*) from club_subscriptions;')"
check "un token basura no da de baja a nadie" "f" \
  "$(as_anon "select unsubscribe_from_club('lo-que-sea');")"
check "ni uno nulo" "f" "$(as_anon 'select unsubscribe_from_club(null);')"
check "ni un uuid que no existe" "f" \
  "$(as_anon "select unsubscribe_from_club('11111111-2222-3333-4444-555555555555');")"
check "y nadie se fue todavia" "2" "select count(*) from club_subscriptions;"

# El token de verdad, leido por encima de RLS para simular el que llego por
# correo.
TOKEN="$($PSQL -t -A -c "select unsubscribe_token from club_subscriptions where email='uno@correo.com';" | tr -d '[:space:]')"
check "con su token, alguien sin sesion se da de baja" "t" \
  "$(as_anon "select unsubscribe_from_club('$TOKEN');")"
check "y la fila desaparece" "dos@correo.com" \
  "select string_agg(email, ',') from club_subscriptions;"
check "el mismo enlace dos veces no revienta, solo dice que no" "f" \
  "$(as_anon "select unsubscribe_from_club('$TOKEN');")"
# Volver a suscribirse tiene que funcionar sin nada extra: es la razon por la que
# la baja borra la fila en vez de marcarla (ver la cabecera de la 0016).
check "volver a suscribirse no da error" "" \
  "$(as_anon "insert into club_subscriptions (email) values ('uno@correo.com');")"
check "y la fila nueva trae un token distinto del que se uso" "t" \
  "select unsubscribe_token <> '$TOKEN' from club_subscriptions where email='uno@correo.com';"

echo "→ Escalada de privilegios: quien para que (0005 / 0006 / 0011 / 0013)"
#
# Escribir esto obligo a comprobar cual de las defensas hace el trabajo, y la
# respuesta no es la que se lee en 0006. Verificado tambien en la base en vivo:
#
#   · 0006 **si** cerro el SELECT: hace `revoke select` y despues lo devuelve por
#     columnas, asi que `email` y `phone` no se pueden leer con las claves del
#     navegador. Esa era su razon de ser y funciona.
#   · Pero el UPDATE **nunca se revoco**, y los default privileges de Supabase
#     dan UPDATE sobre todas las columnas, `role` incluida. O sea que el
#     `grant update (display_name, ...)` de 0006 no restringe nada: ya estaba
#     todo dado.
#   · Lo que de verdad impide la escalada son las otras dos capas, que es justo
#     lo que dice 0005 ("RLS no filtra por columna") y por lo que existe el
#     trigger:
#       - la politica de update (`using` y `with check`, las dos con
#         `auth.uid() = id`), que ademas impide cambiarse el propio id;
#       - el congelado, que devuelve role / is_admin / is_verified /
#         is_test_user a su valor anterior en cualquier update que no venga de
#         service_role ni de una funcion sancionada.
#
# De ahi que estas comprobaciones esperen "el update pasa pero no cambia nada" y
# no "permiso denegado": es el comportamiento real, y el que hay que vigilar.
# El intento de escalada, hecho como el usuario. Sin salida = sin error: el
# update **pasa**, y es correcto que pase — lo que no pasa es el cambio.
check "escribir role no da error: lo tapa el congelado, no el grant" "" \
  "$(as_user '22222222-2222-2222-2222-222222222222' "update profiles set role='admin' where id=auth.uid();")"
check "ni is_test_user" "" \
  "$(as_user '22222222-2222-2222-2222-222222222222' 'update profiles set is_test_user=true where id=auth.uid();')"
check "ni is_verified" "" \
  "$(as_user '22222222-2222-2222-2222-222222222222' 'update profiles set is_verified=true where id=auth.uid();')"

# Y la comprobacion de verdad, leida por encima de RLS: nada de eso se movio.
# Se lee como superusuario a proposito, porque el propio cliente **no puede**
# leer `role` ni `is_test_user` (ver la comprobacion de mas abajo).
check "el rol sigue en user" "user" \
  "select role from profiles where id='22222222-2222-2222-2222-222222222222';"
check "y las tres banderas siguen en false" "false|false|false" \
  "select is_admin || '|' || is_verified || '|' || is_test_user
     from profiles where id='22222222-2222-2222-2222-222222222222';"

# El rol tampoco se puede *leer* desde el navegador: 0006 revoco el select y lo
# devolvio por columnas, y 0011 dejo `role` fuera de esa lista a proposito (el
# rol propio llega por `get_my_profile()`). Esto es lo que hizo fallar a estas
# comprobaciones la primera vez que se escribieron: el error venia del select,
# no del update.
check "el cliente no puede leer role" "ERROR:  permission denied for table profiles" \
  "$(as_user '22222222-2222-2222-2222-222222222222' 'select role from profiles where id=auth.uid();')"

check "lo que si puede cambiar, lo cambia" "Nombre nuevo" \
  "$(as_user '22222222-2222-2222-2222-222222222222' "update profiles set display_name='Nombre nuevo' where id=auth.uid(); select display_name from profiles where id=auth.uid();")"
check "no puede editar la fila de otro (politica de update)" "Sin tocar" \
  "$(as_user '22222222-2222-2222-2222-222222222222' "update profiles set display_name='Hackeado' where id='33333333-3333-3333-3333-333333333333';")
   select display_name from profiles where id='33333333-3333-3333-3333-333333333333';"
check "ni cambiarse el id (with check de la politica)" \
  "ERROR:  new row violates row-level security policy for table \"profiles\"" \
  "$(as_user '22222222-2222-2222-2222-222222222222' "update profiles set id='44444444-4444-4444-4444-444444444444' where id=auth.uid();")"
check "los correos siguen fuera del alcance de la clave anon (0006)" \
  "ERROR:  permission denied for table profiles" \
  "$(as_anon 'select email from profiles limit 1;')"

echo "→ Tienda (migracion 0017): lectura publica, escritura solo admin"
ADMIN='11111111-1111-1111-1111-111111111111'
USER_A='22222222-2222-2222-2222-222222222222'
USER_B='33333333-3333-3333-3333-333333333333'

check "las 12 categorias de primer nivel" "12" \
  "$(as_anon 'select count(*) from product_categories where parent_id is null;')"
check "anon lee las 35 marcas" "35" "$(as_anon 'select count(*) from vehicle_makes;')"
check "anon lee los 88 modelos" "88" "$(as_anon 'select count(*) from vehicle_models;')"
check "las 36 piezas del seed quedan clasificadas" "0" \
  "select count(*) from hub_parts where category_id is null;"
check "y todas traen slug y sku" "0" \
  "select count(*) from hub_parts where slug is null or sku is null;"
check "anon lee los 29 fitments de las piezas visibles" "29" \
  "$(as_anon 'select count(*) from product_fitments;')"

check "anon no crea categorias" \
  'ERROR:  new row violates row-level security policy for table "product_categories"' \
  "$(as_anon "insert into product_categories (slug, name) values ('hackeada', 'Hackeada');")"
# Igual que site_settings: el update de `anon` no da error, se queda en cero
# filas. Lo que importa es que el nombre no cambie.
check "anon no cambia una categoria: el update no toca ninguna fila" "Frenos" \
  "$(as_anon "update product_categories set name='Hackeada' where slug='frenos'; select name from product_categories where slug='frenos';")"
check "anon no crea marcas" \
  'ERROR:  new row violates row-level security policy for table "vehicle_makes"' \
  "$(as_anon "insert into vehicle_makes (name, slug) values ('Falsa', 'falsa');")"
check "anon no crea modelos" \
  'ERROR:  new row violates row-level security policy for table "vehicle_models"' \
  "$(as_anon "insert into vehicle_models (make_id, name, slug) values (1, 'Falso', 'falso');")"
check "anon no crea fitments" \
  'ERROR:  new row violates row-level security policy for table "product_fitments"' \
  "$(as_anon "insert into product_fitments (product_id, make_id) values (1, 1);")"
check "un usuario normal tampoco crea categorias" \
  'ERROR:  new row violates row-level security policy for table "product_categories"' \
  "$(as_user "$USER_A" "insert into product_categories (slug, name) values ('hackeada', 'Hackeada');")"
check "ni fitments" \
  'ERROR:  new row violates row-level security policy for table "product_fitments"' \
  "$(as_user "$USER_A" "insert into product_fitments (product_id, make_id) values (1, 1);")"
check "un admin si crea una subcategoria" "discos" \
  "$(as_user "$ADMIN" "insert into product_categories (slug, name, parent_id) select 'discos', 'Discos', id from product_categories where slug='frenos' returning slug;")"
check "una subcategoria no puede tener hijas: tres niveles no" \
  "ERROR:  Las categorias admiten dos niveles como maximo." \
  "$(as_user "$ADMIN" "insert into product_categories (slug, name, parent_id) select 'x3', 'X3', id from product_categories where slug='discos';")"
check "ni una categoria con hijas puede pasar a ser hija" \
  "ERROR:  Una categoria con subcategorias no puede ser subcategoria." \
  "$(as_user "$ADMIN" "update product_categories set parent_id = (select id from product_categories where slug='suspension') where slug='frenos';")"

echo "→ Reglas del producto (migracion 0017)"
check "una oferta no puede costar lo mismo o mas que el precio normal" \
  'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_compare_at_price_check"' \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, compare_at_price) values ('QQ Mala oferta', 'M', 'x.jpg', 100, 100);")"
check "un articulo bajo pedido tiene que decir cuanto tarda" \
  'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_on_order_needs_lead_time"' \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, fulfillment) values ('QQ Sin plazo', 'M', 'x.jpg', 100, 'on_order');")"
check "un servicio de instalacion exige que el producto sea instalable" \
  'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_installation_needs_installable"' \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, installation_service_id) values ('QQ No instalable', 'M', 'x.jpg', 100, 1);")"
check "las especificaciones tienen que ser un objeto" \
  'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_specs_is_object"' \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, specs) values ('QQ Specs', 'M', 'x.jpg', 100, '[1]'::jsonb);")"
check "slug y sku salen solos al insertar" "t" \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price) values ('QQ Alta Rapida', 'M', 'x.jpg', 100) returning (slug = 'qq-alta-rapida-' || id) and (sku = 'XAH-' || lpad(id::text, 6, '0'));")"
check "la categoria de texto la rellena el trigger con la raiz" "frenos" \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, category_id) select 'QQ Hija', 'M', 'x.jpg', 100, id from product_categories where slug='discos' returning category;")"
check "un producto nuevo nace como especifico, sin prometer compatibilidad" "specific" \
  "select fitment_type from hub_parts where name = 'QQ Alta Rapida';"
check "un fitment no puede mezclar la marca de un modelo con otra" \
  'ERROR:  insert or update on table "product_fitments" violates foreign key constraint "product_fitments_model_of_make"' \
  "$(as_user "$ADMIN" "insert into product_fitments (product_id, make_id, model_id) select 1, mk.id, vm.id from vehicle_makes mk, vehicle_models vm where mk.slug='toyota' and vm.slug='civic';")"
check "ni tener los anios al reves" \
  'ERROR:  new row for relation "product_fitments" violates check constraint "product_fitments_year_order"' \
  "$(as_user "$ADMIN" "insert into product_fitments (product_id, make_id, year_from, year_to) select 1, id, 2020, 2010 from vehicle_makes where slug='toyota';")"
check "ni el mismo fitment dos veces" \
  'ERROR:  duplicate key value violates unique constraint "product_fitments_unique"' \
  "$(as_user "$ADMIN" "insert into product_fitments (product_id, make_id, model_id, year_from, year_to) select f.product_id, f.make_id, f.model_id, f.year_from, f.year_to from product_fitments f limit 1;")"

echo "→ search_products(): texto, vehiculo, precio y stock (migracion 0017)"
# Datos propios para no depender del seed: siete productos, cada uno un caso.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_parts (id, name, brand, img_url, price, fitment_type, stock, fulfillment, lead_time_days, is_active) values
  (9001, 'ZZTEST Universal',           'Marca', 'x.jpg', 100, 'universal', 5, 'stock',    null, true),
  (9002, 'ZZTEST Corolla',             'Marca', 'x.jpg', 200, 'specific',  5, 'stock',    null, true),
  (9003, 'ZZTEST Toyota',              'Marca', 'x.jpg', 300, 'specific',  5, 'stock',    null, true),
  (9004, 'ZZTEST Civic',               'Marca', 'x.jpg', 400, 'specific',  5, 'stock',    null, true),
  (9005, 'ZZTEST Sin fitments',        'Marca', 'x.jpg', 500, 'specific',  5, 'stock',    null, true),
  (9006, 'ZZTEST Batería bajo pedido', 'Marca', 'x.jpg', 600, 'universal', 0, 'on_order', 7,    true),
  (9007, 'ZZTEST Inactivo',            'Marca', 'x.jpg',  50, 'universal', 5, 'stock',    null, false);

insert into product_fitments (product_id, make_id, model_id, year_from, year_to)
select 9002, mk.id, vm.id, 2010, 2020
  from vehicle_makes mk join vehicle_models vm on vm.make_id = mk.id
 where mk.slug = 'toyota' and vm.slug = 'corolla';
insert into product_fitments (product_id, make_id)
select 9003, id from vehicle_makes where slug = 'toyota';
insert into product_fitments (product_id, make_id, model_id)
select 9004, mk.id, vm.id
  from vehicle_makes mk join vehicle_models vm on vm.make_id = mk.id
 where mk.slug = 'honda' and vm.slug = 'civic';
SQL

TOYOTA="(select id from vehicle_makes where slug='toyota')"
HONDA="(select id from vehicle_makes where slug='honda')"
COROLLA="(select vm.id from vehicle_models vm join vehicle_makes mk on mk.id=vm.make_id where mk.slug='toyota' and vm.slug='corolla')"
CIVIC="(select vm.id from vehicle_models vm join vehicle_makes mk on mk.id=vm.make_id where mk.slug='honda' and vm.slug='civic')"
NAMES="select string_agg(name, '|' order by price) from search_products"

check "el texto encuentra los 6 activos (el inactivo no sale)" "6" \
  "$(as_anon "select total_count from search_products(p_query := 'zztest', p_limit := 1);")"
check "una palabra a medias busca por prefijo" "6" \
  "$(as_anon "select total_count from search_products(p_query := 'zztes', p_limit := 1);")"
check "sin acentos: 'bateria' encuentra 'Batería'" "ZZTEST Batería bajo pedido" \
  "$(as_anon "select name from search_products(p_query := 'zztest bateria');")"
check "un inactivo no sale ni buscandolo por el nombre" "0" \
  "$(as_anon "select count(*) from search_products(p_query := 'zztest inactivo');")"
check "Toyota Corolla 2015: universales + los que cubren ese carro" \
  "ZZTEST Universal|ZZTEST Corolla|ZZTEST Toyota|ZZTEST Batería bajo pedido" \
  "$(as_anon "$NAMES(p_query := 'zztest', p_make_id := $TOYOTA, p_model_id := $COROLLA, p_year := 2015);")"
check "Toyota Corolla 2005: el de 2010-2020 queda fuera" \
  "ZZTEST Universal|ZZTEST Toyota|ZZTEST Batería bajo pedido" \
  "$(as_anon "$NAMES(p_query := 'zztest', p_make_id := $TOYOTA, p_model_id := $COROLLA, p_year := 2005);")"
check "Honda Civic: el de Toyota queda fuera" \
  "ZZTEST Universal|ZZTEST Civic|ZZTEST Batería bajo pedido" \
  "$(as_anon "$NAMES(p_query := 'zztest', p_make_id := $HONDA, p_model_id := $CIVIC);")"
check "solo la marca: cualquier modelo de esa marca" \
  "ZZTEST Universal|ZZTEST Corolla|ZZTEST Toyota|ZZTEST Batería bajo pedido" \
  "$(as_anon "$NAMES(p_query := 'zztest', p_make_id := $TOYOTA);")"
# El caso del plan (§7): un `specific` sin compatibilidad cargada no aparece
# como compatible con nada, ni con la marca sola.
check "un especifico sin fitments no sale en ninguna busqueda por vehiculo" "0" \
  "$(as_anon "select count(*) from search_products(p_query := 'zztest', p_make_id := $TOYOTA) where name like '%Sin fitments%';")"
check "solo en stock deja fuera lo bajo pedido" "5" \
  "$(as_anon "select total_count from search_products(p_query := 'zztest', p_in_stock_only := true, p_limit := 1);")"
check "rango de precio" "3" \
  "$(as_anon "select total_count from search_products(p_query := 'zztest', p_min_price := 200, p_max_price := 400, p_limit := 1);")"
check "orden por precio mayor" "ZZTEST Batería bajo pedido" \
  "$(as_anon "select name from search_products(p_query := 'zztest', p_sort := 'price_desc', p_limit := 1);")"
check "paginacion: dos filas, total de seis" "2/6" \
  "$(as_anon "select count(*) || '/' || max(total_count) from search_products(p_query := 'zztest', p_limit := 2);")"
check "una categoria incluye los productos de sus hijas" "4" \
  "$(as_anon "select total_count from search_products(p_category_slug := 'frenos', p_limit := 1);")"
check "y una hija solo los suyos" "1" \
  "$(as_anon "select total_count from search_products(p_category_slug := 'discos', p_limit := 1);")"
check "simbolos de tsquery en el texto no revientan" "t" \
  "$(as_anon "select count(*) >= 0 from search_products(p_query := 'zz|&!:*()<>');")"
check "ni una palabra vacia del diccionario" "t" \
  "$(as_anon "select count(*) >= 0 from search_products(p_query := 'de');")"
check "ni un porcentaje" "t" \
  "$(as_anon "select count(*) >= 0 from search_products(p_query := '100%');")"

echo "→ El garaje (profile_vehicles): cada quien el suyo (migracion 0017)"
check "un usuario guarda un vehiculo en su garaje" "" \
  "$(as_user "$USER_A" "insert into profile_vehicles (user_id, make_id, model_id, year, is_default) select auth.uid(), mk.id, vm.id, 2015, true from vehicle_makes mk join vehicle_models vm on vm.make_id = mk.id where mk.slug='toyota' and vm.slug='corolla';")"
check "y lo ve" "1" "$(as_user "$USER_A" 'select count(*) from profile_vehicles;')"
check "otro usuario no ve el garaje ajeno" "0" "$(as_user "$USER_B" 'select count(*) from profile_vehicles;')"
check "anon no tiene garaje" 'ERROR:  permission denied for table profile_vehicles' \
  "$(as_anon 'select count(*) from profile_vehicles;')"
check "nadie escribe en el garaje de otro" \
  'ERROR:  new row violates row-level security policy for table "profile_vehicles"' \
  "$(as_user "$USER_B" "insert into profile_vehicles (user_id, make_id, model_id, year) select '$USER_A', mk.id, vm.id, 2020 from vehicle_makes mk join vehicle_models vm on vm.make_id = mk.id where mk.slug='toyota' and vm.slug='corolla';")"
check "ni mueve su vehiculo al garaje de otro" \
  'ERROR:  new row violates row-level security policy for table "profile_vehicles"' \
  "$(as_user "$USER_A" "update profile_vehicles set user_id = '$USER_B' where user_id = auth.uid();")"
check "el modelo tiene que ser de la marca" \
  'ERROR:  insert or update on table "profile_vehicles" violates foreign key constraint "profile_vehicles_model_of_make"' \
  "$(as_user "$USER_A" "insert into profile_vehicles (user_id, make_id, model_id, year) select auth.uid(), mk.id, vm.id, 2020 from vehicle_makes mk, vehicle_models vm where mk.slug='toyota' and vm.slug='civic';")"
check "un segundo vehiculo por defecto entra sin error" "" \
  "$(as_user "$USER_A" "insert into profile_vehicles (user_id, make_id, model_id, year, is_default) select auth.uid(), mk.id, vm.id, 2018, true from vehicle_makes mk join vehicle_models vm on vm.make_id = mk.id where mk.slug='honda' and vm.slug='civic';")"
check "...y desmarca al primero: queda uno solo por defecto" "1" \
  "select count(*) from profile_vehicles where user_id = '$USER_A' and is_default;"
check "los dos siguen en el garaje" "2" \
  "select count(*) from profile_vehicles where user_id = '$USER_A';"

echo "→ Camino de actualizacion de la 0017: la base real ya tiene piezas al migrar"
# El recorrido de arriba aplica la 0017 con `hub_parts` vacia. En produccion no:
# hay piezas con su categoria de texto, y es ahi donde el backfill (slug, sku,
# category_id) tiene que hacer su trabajo.
for migration in supabase/migrations/00{01..16}_*.sql; do
  apply "$migration" upgrade
done
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_parts (category, name, brand, img_url, price, stock) values
  ('interior',      'Alfombras all-weather',  'WeatherTech', 'x.jpg', 2950, 10),
  ('exterior',      'Lip frontal',            'Maxton',      'x.jpg', 3250, 10),
  ('luces',         'Kit LED H7',             'Philips',     'x.jpg', 3650, 10),
  ('audio',         'Subwoofer 12in',         'JL Audio',    'x.jpg', 9600, 10),
  ('llantas',       'Rin forjado',            'Enkei',       'x.jpg', 9800, 10),
  ('frenos',        'Disco ventilado',        'Brembo',      'x.jpg', 12950, 10),
  ('suspension',    'Kit Coilover',           'BC Racing',   'x.jpg', 32500, 10),
  ('motor',         'Bobina de encendido',    'NGK',         'x.jpg', 2150, 10),
  ('filtros',       'Filtro de aire',         'K&N',         'x.jpg', 2850, 10),
  ('aceites',       'Aceite sintetico',       'Motul',       'x.jpg', 2250, 10),
  ('escape',        'Downpipe inox',          'Borla',       'x.jpg', 11800, 10),
  ('transmision',   'Kit clutch',             'Exedy',       'x.jpg', 16700, 10),
  ('refrigeracion', 'Radiador aluminio',      'Mishimoto',   'x.jpg', 15400, 10),
  ('electrico',     'Alternador',             'Powermaster', 'x.jpg', 13200, 10),
  ('bateria',       'Batería AGM 70Ah',       'Bosch',       'x.jpg', 6900, 10),
  ('detailing',     'Shampoo pH neutro',      'Meguiars',    'x.jpg', 780, 10),
  ('herramientas',  'Llave torque',           'Tekton',      'x.jpg', 3650, 10);
SQL
apply "$LAST_MIGRATION" upgrade
echo "   (las 17 categorias de texto de la tienda anterior, una pieza por cada una)"
CHECK_DB=upgrade check "las 17 piezas quedan clasificadas" "17" \
  "select count(*) from hub_parts where category_id is not null;"
CHECK_DB=upgrade check "refrigeracion cae en motor-filtros (no en aire acondicionado)" "motor-filtros" \
  "select c.slug from hub_parts p join product_categories c on c.id = p.category_id where p.category = 'refrigeracion';"
CHECK_DB=upgrade check "bateria cae en electrico-baterias" "electrico-baterias" \
  "select c.slug from hub_parts p join product_categories c on c.id = p.category_id where p.category = 'bateria';"
CHECK_DB=upgrade check "interior cae en accesorios-interior" "accesorios-interior" \
  "select c.slug from hub_parts p join product_categories c on c.id = p.category_id where p.category = 'interior';"
CHECK_DB=upgrade check "cada pieza recibe su slug y su sku, sin repetir" "17|17" \
  "select count(distinct slug) || '|' || count(distinct sku) from hub_parts;"
CHECK_DB=upgrade check "el slug lleva el id al final y el sku el relleno de ceros" "t" \
  "select slug = 'alfombras-all-weather-' || id and sku = 'XAH-' || lpad(id::text, 6, '0') from hub_parts where category = 'interior';"
CHECK_DB=upgrade check "la categoria de texto se conserva" "17" \
  "select count(*) from hub_parts where category is not null;"
CHECK_DB=upgrade check "las piezas existentes quedan como especificas: no se promete compatibilidad" "0" \
  "select count(*) from hub_parts where fitment_type <> 'specific';"
CHECK_DB=upgrade check "y como de inventario propio, sin oferta ni instalacion" "0" \
  "select count(*) from hub_parts where fulfillment <> 'stock' or compare_at_price is not null or installable;"
CHECK_DB=upgrade check "la busqueda de texto queda lista para todas" "17" \
  "select count(*) from hub_parts where search_vector is not null;"
CHECK_DB=upgrade check "y busca sin acentos sobre lo que ya habia" "Batería AGM 70Ah" \
  "select name from search_products(p_query := 'bateria');"

# --- Resumen ------------------------------------------------------------------

echo
if [ "$FAILED" -eq 0 ]; then
  echo "✓ Todo en verde: migraciones aplicadas desde cero y $CHECKS_OK/$CHECKS comprobaciones."
  echo
  echo "  Ojo: esto NO reproduce PostgREST. El PGRST201 de la ronda 14 era SQL"
  echo "  valido con un embed ambiguo, y solo se vio en el sitio real. El humo"
  echo "  contra produccion despues de desplegar sigue haciendo falta."
  exit 0
else
  echo "✗ $FAILED problema(s). Los registros quedaron en $WORKDIR (se borran al salir)."
  exit 1
fi
