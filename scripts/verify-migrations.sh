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
-- Supabase da acceso a la tabla a los tres roles y es RLS quien decide. Sin este
-- grant, las politicas de payment-proofs (0018) no se ejercitarian: un insert de
-- anon fallaria antes, por permisos de tabla, y la comprobacion no probaria nada.
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
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
  "$(as_anon "select count(*) from create_order('invitado@correo.com','Cliente Invitado','Calle 1','standard','transfer','[{\"part_id\": 1, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"
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


echo "→ Pedidos: estado, stock y reglas de entrega (migracion 0018)"
# Cuatro piezas con comportamiento conocido. Se prepara por encima de RLS: es el
# escenario, no lo que se comprueba.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update hub_parts set fulfillment = 'stock',    stock = 3,  installable = false where id = 2;
update hub_parts set fulfillment = 'on_order', stock = 0,  lead_time_days = 10, installable = false, installation_service_id = null where id = 3;
update hub_parts set fulfillment = 'stock',    stock = 0                       where id = 4;
update hub_parts set fulfillment = 'stock',    stock = 10, installable = true  where id = 5;
SQL

# Un valor suelto de una consulta (lo que `check` hace por dentro, pero devuelto).
scalar() {
  $PSQL -d "${SCALAR_DB:-postgres}" -t -A -c "$1" 2>&1 | tr -d '\r' \
    | awk '/^(SET|RESET|INSERT|UPDATE|DELETE)/ { next } NF { ultima = $0 } END { print ultima }'
}

NAME2="$(scalar 'select name from hub_parts where id = 2;')"
NAME4="$(scalar 'select name from hub_parts where id = 4;')"
I2x2='[{"part_id": 2, "quantity": 2}]'
I2x1x2='[{"part_id": 2, "quantity": 1}, {"part_id": 2, "quantity": 1}]'
I3x2='[{"part_id": 3, "quantity": 2}]'
I4x1='[{"part_id": 4, "quantity": 1}]'
I5x1='[{"part_id": 5, "quantity": 1}]'
I5x4='[{"part_id": 5, "quantity": 4}]'

# create_order(items, pago, entrega, opcion de envio [, extras con nombre])
mk_order() {
  echo "select * from create_order('c@x.com', 'Cliente', 'Calle 1', '$4', '$2', '$1'::jsonb, p_contact_phone => '8095550000', p_fulfillment_type => '$3', p_province => 'Santiago'${5:-});"
}

ORD1="$(scalar "$(as_anon "$(mk_order "$I2x2" transfer shipping standard | sed 's/select \*/select id/')")")"
check "un pedido nuevo nace en awaiting_payment" "awaiting_payment" \
  "select status from orders where id = '$ORD1';"
check "con su numero legible" "t" "select order_number >= 1001 from orders where id = '$ORD1';"
check "descuenta el stock de lo de inventario propio (3 - 2)" "1" "select stock from hub_parts where id = 2;"
check "y lo anota en la linea, para poder devolverlo" "2" \
  "select stock_deducted from order_items where order_id = '$ORD1';"
check "el historial nace con su primera fila" "1|awaiting_payment" \
  "select count(*) || '|' || min(to_status::text) from order_status_history where order_id = '$ORD1';"

check "rechaza el stock insuficiente, y dice cuanto queda" \
  "ERROR:  De \"$NAME2\" solo quedan 1 y pediste 2. Ajusta la cantidad." \
  "$(as_anon "$(mk_order "$I2x2" transfer shipping standard)")"
check "la misma pieza en dos lineas se suma" \
  "ERROR:  De \"$NAME2\" solo quedan 1 y pediste 2. Ajusta la cantidad." \
  "$(as_anon "$(mk_order "$I2x1x2" transfer shipping standard)")"
check "no vende lo agotado" "ERROR:  Se agoto \"$NAME4\". Quitala del carrito para continuar." \
  "$(as_anon "$(mk_order "$I4x1" transfer shipping standard)")"
check "el rechazo no descuenta nada" "1" "select stock from hub_parts where id = 2;"

ORD_OO="$(scalar "$(as_anon "$(mk_order "$I3x2" transfer shipping standard | sed 's/select \*/select id/')")")"
check "lo bajo pedido se vende aunque no haya stock" "awaiting_payment" \
  "select status from orders where id = '$ORD_OO';"
check "y no descuenta nada (ni pone el stock en negativo)" "0|0" \
  "select (select stock from hub_parts where id = 3) || '|' || (select stock_deducted from order_items where order_id = '$ORD_OO');"

echo "   (entrega: envio o retiro)"
ORD_R="$(scalar "$(as_anon "select id from create_order('c@x.com', 'Cliente', '', 'pickup', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_fulfillment_type => 'pickup');")")"
check "un retiro no pide direccion ni provincia" "Retiro en el taller|-|pickup" \
  "select address_line1 || '|' || coalesce(province, '-') || '|' || fulfillment_type from orders where id = '$ORD_R';"
check "un envio sin provincia se rechaza" "ERROR:  Elige la provincia de entrega." \
  "$(as_anon "select * from create_order('c@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000');")"
check "un envio sin direccion tambien" "ERROR:  Escribe la direccion de entrega." \
  "$(as_anon "select * from create_order('c@x.com', 'Cliente', ' ', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"
check "el telefono es obligatorio" "ERROR:  Escribe tu telefono: lo usamos para coordinar la entrega." \
  "$(as_anon "select * from create_order('c@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_province => 'Santiago');")"
check "un retiro con la opcion de envio estandar no cuadra" \
  "ERROR:  La opcion de envio no corresponde al tipo de entrega." \
  "$(as_anon "$(mk_order "$I5x1" transfer pickup standard)")"
check "ni un envio con la opcion de retiro" \
  "ERROR:  La opcion de envio no corresponde al tipo de entrega." \
  "$(as_anon "$(mk_order "$I5x1" transfer shipping pickup)")"
check "un tipo de entrega inventado se rechaza" "ERROR:  Tipo de entrega no valido." \
  "$(as_anon "$(mk_order "$I5x1" transfer volando standard)")"
check "y uno nulo no cae en la rama de retiro" "ERROR:  Tipo de entrega no valido." \
  "$(as_anon "select * from create_order('c@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_fulfillment_type => null);")"
check "el envio express suma 450 y el total lo calcula Postgres" "450.00|0.00" \
  "$(as_anon "select shipping_price || '|' || (total - subtotal - shipping_price) from create_order('c@x.com', 'Cliente', 'Calle 1', 'express', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"

echo "   (instalacion y metodos de pago)"
ORD_I1="$(scalar "$(as_anon "select id from create_order('c@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_wants_installation => true);")")"
ORD_I0="$(scalar "$(as_anon "select id from create_order('c@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I3x2'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_wants_installation => true);")")"
check "pide instalacion de algo instalable: queda marcada" "t" \
  "select wants_installation from orders where id = '$ORD_I1';"
check "pide instalacion de algo que no se instala: se ignora" "f" \
  "select wants_installation from orders where id = '$ORD_I0';"
check "los metodos de pago que ve un visitante: transferencia y WhatsApp" "transfer,whatsapp" \
  "$(as_anon "select string_agg(id, ',' order by sort_order) from payment_methods;")"
check "la tarjeta ya no se acepta" "ERROR:  Metodo de pago no valido." \
  "$(as_anon "$(mk_order "$I5x1" card shipping standard)")"
check "pero la fila de la tarjeta sigue existiendo (desactivada, no borrada)" "card|false" \
  "select id || '|' || is_active::text from payment_methods where id = 'card';"

echo "   (leer pedidos: cada quien los suyos)"
ORD_A="$(scalar "$(as_user "$USER_A" "$(mk_order "$I5x1" transfer shipping standard | sed 's/select \*/select id/')")")"
check "el pedido de un usuario con cuenta queda a su nombre" "$USER_A" "select user_id from orders where id = '$ORD_A';"
check "my_orders trae los suyos" "1" "$(as_user "$USER_A" 'select count(*) from my_orders();')"
check "otro usuario no ve los ajenos" "0" "$(as_user "$USER_B" 'select count(*) from my_orders();')"
check "anon no invoca my_orders" "$(denied my_orders)" "$(as_anon 'select count(*) from my_orders();')"
check "anon no lee la tabla de pedidos" "0" "$(as_anon 'select count(*) from orders;')"
NUM1="$(scalar "select order_number from orders where id = '$ORD1';")"
check "get_order devuelve el pedido a quien tiene el enlace" "$NUM1" \
  "$(as_anon "select get_order('$ORD1')->>'order_number';")"
check "con sus lineas" "1" "$(as_anon "select jsonb_array_length(get_order('$ORD1')->'items');")"
check "y sin un solo dato personal" "f" \
  "$(as_anon "select get_order('$ORD1') ?| array['contact_email','contact_phone','address_line1','full_name','province','user_id'];")"
check "un id que no existe devuelve nulo, no un error" "" \
  "$(as_anon "select get_order('00000000-0000-0000-0000-000000000000');")"

echo "   (estados: solo set_order_status(), solo un admin, en orden)"
check "ni un admin cambia el estado a mano" \
  "ERROR:  El estado y el pago de un pedido solo cambian con las funciones del sistema." \
  "$(as_user "$ADMIN" "update orders set status = 'paid' where id = '$ORD1';")"
check "un usuario normal ni lo intenta: no toca ninguna fila" "awaiting_payment" \
  "$(as_user "$USER_A" "update orders set status = 'paid' where id = '$ORD_A'; select status from orders where id = '$ORD_A';")"
check "ni se marca el comprobante a mano" \
  "ERROR:  El estado y el pago de un pedido solo cambian con las funciones del sistema." \
  "$(as_user "$ADMIN" "update orders set payment_proof_url = '$ORD1/x.jpg' where id = '$ORD1';")"
check "un usuario normal recibe 42501 en set_order_status" \
  "ERROR:  Solo un administrador puede cambiar el estado de los pedidos." \
  "$(as_user "$USER_A" "select * from set_order_status('$ORD_A', 'paid');")"
check "anon no invoca set_order_status" "$(denied set_order_status)" \
  "$(as_anon "select * from set_order_status('$ORD_A', 'paid');")"
check "de awaiting_payment no se salta a shipped" \
  "ERROR:  Un pedido awaiting_payment no puede pasar a shipped." \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD1', 'shipped');")"
check "un estado inventado se rechaza" "ERROR:  Estado no valido: volando." \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD1', 'volando');")"
check "un pedido que no existe tambien" "ERROR:  Ese pedido no existe." \
  "$(as_user "$ADMIN" "select * from set_order_status('00000000-0000-0000-0000-000000000000', 'paid');")"
check "un admin lo marca pagado" "paid" \
  "$(as_user "$ADMIN" "select status from set_order_status('$ORD1', 'paid', 'Transferencia verificada');")"
check "y queda anotado cuando se confirmo el pago" "t" \
  "select payment_confirmed_at is not null from orders where id = '$ORD1';"
check "con su nota en el historial" "Transferencia verificada" \
  "select note from order_status_history where order_id = '$ORD1' and to_status = 'paid';"
check "de paid tampoco se salta preparing (el orden es estricto)" \
  "ERROR:  Un pedido paid no puede pasar a shipped." \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD1', 'shipped');")"
check "un envio sigue paid → preparing → shipped → delivered" "delivered" \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD1', 'preparing'); select * from set_order_status('$ORD1', 'shipped'); select status from set_order_status('$ORD1', 'delivered');")"
check "un pedido entregado ya no se mueve" "ERROR:  Un pedido delivered no puede pasar a cancelled." \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD1', 'cancelled');")"
check "el historial cuenta toda la vida del pedido" "5" \
  "select count(*) from order_status_history where order_id = '$ORD1';"

ORD_P="$(scalar "$(as_anon "select id from create_order('c@x.com', 'Cliente', '', 'pickup', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_fulfillment_type => 'pickup');")")"
check "un retiro llega a preparing" "preparing" \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD_P', 'paid'); select status from set_order_status('$ORD_P', 'preparing');")"
check "pero no puede pasar a shipped" "ERROR:  Un pedido preparing no puede pasar a shipped." \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD_P', 'shipped');")"
check "sino a ready_for_pickup" "ready_for_pickup" \
  "$(as_user "$ADMIN" "select status from set_order_status('$ORD_P', 'ready_for_pickup');")"

echo "   (cancelar devuelve el stock, una sola vez)"
STOCK5_BEFORE="$(scalar 'select stock from hub_parts where id = 5;')"
ORD_C="$(scalar "$(as_anon "$(mk_order "$I5x4" transfer shipping standard | sed 's/select \*/select id/')")")"
check "el pedido descuenta 4" "$((STOCK5_BEFORE - 4))" "select stock from hub_parts where id = 5;"
# Dos statements: un select dentro del mismo statement que el update no ve su
# efecto (una sola instantanea).
check "cancelarlo lo devuelve" "$STOCK5_BEFORE" \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD_C', 'cancelled'); select stock from hub_parts where id = 5;")"
check "y queda cancelado" "cancelled" "select status from orders where id = '$ORD_C';"
check "y la linea queda en cero" "0" "select stock_deducted from order_items where order_id = '$ORD_C';"
check "cancelar dos veces se rechaza" "ERROR:  Un pedido cancelled no puede pasar a cancelled." \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD_C', 'cancelled');")"
check "y el stock no se devolvio de nuevo" "$STOCK5_BEFORE" "select stock from hub_parts where id = 5;"
check "cancelar un pedido bajo pedido no toca el stock" "0" \
  "$(as_user "$ADMIN" "select * from set_order_status('$ORD_OO', 'cancelled'); select stock from hub_parts where id = 3;")"

echo "   (comprobantes: bucket privado, cada pedido en su carpeta)"
check "el bucket es privado, de 10 MB" "false|10485760" \
  "select public::text || '|' || file_size_limit from storage.buckets where id = 'payment-proofs';"
ORD_T="$(scalar "$(as_anon "$(mk_order "$I5x1" transfer shipping standard | sed 's/select \*/select id/')")")"
ORD_W="$(scalar "$(as_anon "$(mk_order "$I5x1" whatsapp shipping standard | sed 's/select \*/select id/')")")"
ORD_U="$(scalar "$(as_user "$USER_A" "$(mk_order "$I5x1" transfer shipping standard | sed 's/select \*/select id/')")")"
check "un pedido por transferencia acepta comprobante" "t" "$(as_anon "select order_accepts_proof('$ORD_T');")"
check "uno por WhatsApp no" "f" "$(as_anon "select order_accepts_proof('$ORD_W');")"
check "una carpeta que no es un uuid dice que no, sin romper la politica" "f" \
  "$(as_anon "select order_accepts_proof('no-es-un-uuid');")"
check "un invitado sube a la carpeta de su pedido" "" \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('payment-proofs', '$ORD_T/comprobante.jpg');")"
check "pero no a la de un pedido que no existe" \
  'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('payment-proofs', '00000000-0000-0000-0000-000000000000/x.jpg');")"
check "ni a la de un pedido por WhatsApp" \
  'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('payment-proofs', '$ORD_W/x.jpg');")"
check "ni a la de un pedido que tiene dueño, sin ser el dueño" \
  'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('payment-proofs', '$ORD_U/x.jpg');")"
check "ni otro usuario con cuenta" \
  'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_user "$USER_B" "insert into storage.objects (bucket_id, name) values ('payment-proofs', '$ORD_U/x.jpg');")"
check "el dueño si sube a su pedido" "" \
  "$(as_user "$USER_A" "insert into storage.objects (bucket_id, name) values ('payment-proofs', '$ORD_U/comprobante.pdf');")"
check "anon no lee ningun comprobante" "0" \
  "$(as_anon "select count(*) from storage.objects where bucket_id = 'payment-proofs';")"
check "otro usuario tampoco" "0" \
  "$(as_user "$USER_B" "select count(*) from storage.objects where bucket_id = 'payment-proofs';")"
check "el dueño lee el suyo" "1" \
  "$(as_user "$USER_A" "select count(*) from storage.objects where bucket_id = 'payment-proofs';")"
check "un admin lee los de todos" "2" \
  "$(as_user "$ADMIN" "select count(*) from storage.objects where bucket_id = 'payment-proofs';")"

echo "   (registrar el comprobante en el pedido)"
check "el invitado apunta su pedido a su archivo" "true" \
  "$(as_anon "select attach_payment_proof('$ORD_T', '$ORD_T/comprobante.jpg'); select get_order('$ORD_T')->>'has_proof';")"
check "no puede apuntarlo al archivo de otro pedido" "ERROR:  Ese archivo no pertenece a este pedido." \
  "$(as_anon "select attach_payment_proof('$ORD_T', '$ORD_U/comprobante.pdf');")"
check "ni a un archivo que no subio" "ERROR:  No encontramos el archivo subido. Intenta de nuevo." \
  "$(as_anon "select attach_payment_proof('$ORD_T', '$ORD_T/fantasma.jpg');")"
check "un pedido por WhatsApp no recibe comprobantes" "ERROR:  Este pedido ya no recibe comprobantes." \
  "$(as_anon "select attach_payment_proof('$ORD_W', '$ORD_W/x.jpg');")"
check "la columna no acepta la ruta de otro pedido" \
  'ERROR:  new row for relation "orders" violates check constraint "orders_proof_path_matches_order"' \
  "update orders set payment_proof_url = '$ORD_U/comprobante.pdf' where id = '$ORD_T';"
check "un admin confirma el pago del pedido con comprobante" "paid" \
  "$(as_user "$ADMIN" "select status from set_order_status('$ORD_T', 'paid');")"
check "ya pagado, no se aceptan mas comprobantes" "ERROR:  Este pedido ya no recibe comprobantes." \
  "$(as_anon "select attach_payment_proof('$ORD_T', '$ORD_T/comprobante.jpg');")"
check "ni subir archivos" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('payment-proofs', '$ORD_T/otro.jpg');")"

echo "   (WhatsApp y ajustes)"
WA1="$(scalar "$(as_anon "select mark_whatsapp_opened('$ORD_W'); select whatsapp_opened_at::text from orders where id = '$ORD_W';")")"
check "abrir WhatsApp deja constancia" "t" "select whatsapp_opened_at is not null from orders where id = '$ORD_W';"
check "y solo la primera vez" "$WA1" \
  "$(as_anon "select mark_whatsapp_opened('$ORD_W'); select whatsapp_opened_at::text from orders where id = '$ORD_W';")"
check "las cuentas bancarias nacen como ejemplo" "true" \
  "select value->0->>'is_example' from site_settings where key = 'bank_accounts';"
check "y la direccion de retiro tambien" "true" \
  "select value->>'is_example' from site_settings where key = 'pickup_address';"
check "anon las lee (el sitio las muestra)" "2" \
  "$(as_anon "select count(*) from site_settings where key in ('bank_accounts', 'pickup_address');")"
check "las cuentas tienen que ser una lista" \
  'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_value_valid"' \
  "$(as_user "$ADMIN" "select * from set_site_setting('bank_accounts', '\"no soy una lista\"');")"
check "la direccion tiene que ser un objeto" \
  'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_value_valid"' \
  "$(as_user "$ADMIN" "select * from set_site_setting('pickup_address', '[]');")"
check "un admin si guarda sus cuentas" "bank_accounts" \
  "$(as_user "$ADMIN" "select key from set_site_setting('bank_accounts', '[{\"bank\":\"Banco Real\",\"holder\":\"X AutoHub\",\"number\":\"123\",\"type\":\"Corriente\"}]');")"
check "los numeros de pedido no se repiten" "t" "select count(*) = count(distinct order_number) from orders;"
check "todo pedido tiene su primera fila de historial" "t" \
  "select count(*) = (select count(distinct order_id) from order_status_history) from orders;"


echo "→ Servicios y citas: catalogo, horario, agenda y trabajos (migracion 0019)"
check "el catalogo inicial trae 10 servicios activos, todos a cotizar" "10|10" \
  "select count(*) || '|' || count(*) filter (where price_from is null) from services where is_active;"
check "cubre las seis categorias" "6" "select count(distinct category) from services;"
check "anon lee el catalogo activo" "10" "$(as_anon 'select count(*) from services;')"
check "anon no escribe servicios" 'ERROR:  new row violates row-level security policy for table "services"' \
  "$(as_anon "insert into services (icon, title, description) values ('x', 'Hackeado', 'x');")"
check "un update de anon no cambia nada" "0" \
  "$(as_anon "update services set title = 'Hackeado'; select count(*) from services where title = 'Hackeado';")"
check "un servicio nuevo sin slug lo recibe del titulo" "servicio-nuevo-de-prueba" \
  "$(as_user "$ADMIN" "insert into services (icon, title, description) values ('x', 'Servicio nuevo de prueba', 'x') returning slug;")"
check "el slug no se repite" 'ERROR:  duplicate key value violates unique constraint "services_slug_key"' \
  "$(as_user "$ADMIN" "insert into services (icon, title, description, slug) values ('x', 'Otro', 'x', 'frenos');")"
check "un precio negativo se rechaza" \
  'ERROR:  new row for relation "services" violates check constraint "services_price_from_check"' \
  "$(as_user "$ADMIN" "update services set price_from = -1 where id = 1;")"

echo "   (horario del taller)"
check "anon lee el horario: seis dias, todos de ejemplo" "6|6" \
  "$(as_anon "select count(*) || '|' || count(*) filter (where is_example) from service_availability;")"
check "anon no cambia el horario" 'ERROR:  new row violates row-level security policy for table "service_availability"' \
  "$(as_anon "insert into service_availability (weekday, opens_at, closes_at) values (0, '00:00', '23:00');")"
check "ni los cierres" 'ERROR:  new row violates row-level security policy for table "service_blackouts"' \
  "$(as_anon "insert into service_blackouts (starts_at, ends_at) values (now(), now() + interval '1 day');")"
check "un horario que cierra antes de abrir se rechaza" \
  'ERROR:  new row for relation "service_availability" violates check constraint "service_availability_hours"' \
  "$(as_user "$ADMIN" "insert into service_availability (weekday, opens_at, closes_at) values (0, '10:00', '09:00');")"

echo "   (available_slots: las horas libres, en hora de Santo Domingo)"
MONDAY="$(scalar "select (current_date + 7 + ((1 - extract(dow from current_date)::int + 7) % 7))::date;")"
TUESDAY="$(scalar "select ('$MONDAY'::date + 1);")"
SATURDAY="$(scalar "select ('$MONDAY'::date + 5);")"
SUNDAY="$(scalar "select ('$MONDAY'::date + 6);")"
check "un lunes tiene 9 franjas (8:00 a 16:00), con 2 cupos cada una" "9|2" \
  "$(as_anon "select count(*) || '|' || min(remaining) from available_slots(1, '$MONDAY');")"
check "la primera abre a las 8:00 de Santo Domingo, que son las 12:00 UTC" "12:00" \
  "$(as_anon "select to_char(min(slot_at) at time zone 'UTC', 'HH24:MI') from available_slots(1, '$MONDAY');")"
check "el sabado cierra a la 1: 5 franjas" "5" "$(as_anon "select count(*) from available_slots(1, '$SATURDAY');")"
check "el domingo el taller no abre" "0" "$(as_anon "select count(*) from available_slots(1, '$SUNDAY');")"
check "nunca devuelve horas que ya pasaron" "0" \
  "$(as_anon "select count(*) from available_slots(1, (now() at time zone 'America/Santo_Domingo')::date - 1);")"
check "ni un dia mas alla de 90 dias" "0" "$(as_anon "select count(*) from available_slots(1, current_date + 200);")"
check "un servicio que no existe no tiene horas" "0" "$(as_anon "select count(*) from available_slots(99999, '$MONDAY');")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update services set is_bookable = false where id = 2;
SQL
check "uno que no se agenda tampoco" "0" "$(as_anon "select count(*) from available_slots(2, '$MONDAY');")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update services set is_bookable = true where id = 2;
SQL
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into service_blackouts (starts_at, ends_at, reason)
values (('$TUESDAY 08:00')::timestamp at time zone 'America/Santo_Domingo',
        ('$TUESDAY 10:00')::timestamp at time zone 'America/Santo_Domingo', 'Cierre de prueba');
SQL
check "un cierre quita las franjas que cubre (2 de 9)" "7" "$(as_anon "select count(*) from available_slots(1, '$TUESDAY');")"

echo "   (book_appointment: valida todo dentro de Postgres)"
slot() { scalar "select slot_at from available_slots(1, '$MONDAY') order by slot_at offset $1 limit 1;"; }
SLOT0="$(slot 0)"; SLOT1="$(slot 1)"; SLOT2="$(slot 2)"; SLOT3="$(slot 3)"; SLOT4="$(slot 4)"
book() { echo "select * from book_appointment(1, '$1', '$2', '$3', p_vehicle_text => 'Toyota Corolla 2015'${4:-});"; }

APPT1="$(scalar "$(as_anon "select id from book_appointment(1, '$SLOT0', 'Cliente Uno', '809-555-0134', p_vehicle_text => 'Toyota Corolla 2015');")")"
check "un invitado agenda: la cita nace requested" "requested" "select status from service_appointments where id = '$APPT1';"
check "con su numero legible, desde 2001" "t" "select appointment_number >= 2001 from service_appointments where id = '$APPT1';"
check "guarda el vehiculo como texto" "Toyota Corolla 2015" "select vehicle_text from service_appointments where id = '$APPT1';"
check "un invitado no tiene user_id" "" "select coalesce(user_id::text, '') from service_appointments where id = '$APPT1';"
check "la franja pasa de 2 cupos a 1" "1" \
  "$(as_anon "select remaining from available_slots(1, '$MONDAY') where slot_at = '$SLOT0';")"
APPT2="$(scalar "$(as_anon "select id from book_appointment(1, '$SLOT0', 'Cliente Dos', '829-555-0199');")")"
check "con capacidad 2, una segunda persona entra a la misma hora" "requested" "select status from service_appointments where id = '$APPT2';"
check "una tercera ya no: la franja esta llena" "ERROR:  Esa hora ya no esta disponible. Elige otra." \
  "$(as_anon "$(book "$SLOT0" 'Cliente Tres' '849-555-0111')")"
check "y la franja llena deja de aparecer" "0" \
  "$(as_anon "select count(*) from available_slots(1, '$MONDAY') where slot_at = '$SLOT0';")"
check "una hora que ya paso se rechaza" "ERROR:  Esa hora ya no esta disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select date_trunc('hour', now()) - interval '1 day';")" 'Cliente' '809-555-0134')")"
check "una hora que no es una franja (8:30) tambien" "ERROR:  Esa hora ya no esta disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select '$SLOT0'::timestamptz + interval '30 minutes';")" 'Cliente' '809-555-0134')")"
check "un domingo no abre" "ERROR:  Esa hora ya no esta disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select ('$SUNDAY 10:00')::timestamp at time zone 'America/Santo_Domingo';")" 'Cliente' '809-555-0134')")"
check "dentro de un cierre tampoco" "ERROR:  Esa hora ya no esta disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select ('$TUESDAY 08:00')::timestamp at time zone 'America/Santo_Domingo';")" 'Cliente' '809-555-0134')")"
check "un servicio que no se agenda se rechaza" "ERROR:  Esa hora ya no esta disponible. Elige otra." \
  "$(as_anon "select * from book_appointment(99999, '$SLOT1', 'Cliente', '809-555-0134');")"
check "sin nombre no se agenda" "ERROR:  Escribe tu nombre." "$(as_anon "$(book "$SLOT1" ' ' '809-555-0134')")"
check "un telefono corto tampoco" "ERROR:  Escribe un telefono valido: lo usamos para confirmar tu cita." \
  "$(as_anon "$(book "$SLOT1" 'Cliente' '12345')")"
check "un pedido que no existe se rechaza" "ERROR:  Ese pedido no existe." \
  "$(as_anon "$(book "$SLOT1" 'Cliente' '809-555-0134' ", p_order_id => '00000000-0000-0000-0000-000000000000'")")"

echo "   (tope por telefono)"
as_anon_book() { scalar "$(as_anon "select id from book_appointment(1, '$1', 'Cliente Uno', '809-555-0134');")" >/dev/null; }
as_anon_book "$SLOT1"; as_anon_book "$SLOT2"
check "con 3 citas abiertas, la cuarta se rechaza" \
  "ERROR:  Ya tienes 3 citas abiertas con este telefono. Escribenos por WhatsApp para cambiarlas." \
  "$(as_anon "$(book "$SLOT3" 'Cliente Uno' '(809) 555-0134')")"
check "el tope cuenta el telefono, no como lo escribieron" "3" \
  "select count(*) from service_appointments where right(regexp_replace(contact_phone, '\D', '', 'g'), 10) = '8095550134';"
check "ni con el codigo de pais por delante" \
  "ERROR:  Ya tienes 3 citas abiertas con este telefono. Escribenos por WhatsApp para cambiarlas." \
  "$(as_anon "$(book "$SLOT3" 'Cliente Uno' '+1 809 555 0134')")"

echo "   (quien ve y quien escribe las citas)"
check "anon no lee citas" "0" "$(as_anon 'select count(*) from service_appointments;')"
check "anon no inserta una cita a mano" 'ERROR:  new row violates row-level security policy for table "service_appointments"' \
  "$(as_anon "insert into service_appointments (service_id, contact_name, contact_phone, scheduled_at) values (1, 'x', '8095550000', now() + interval '3 days');")"
GARAGE_A="$(scalar "select id from profile_vehicles where user_id = '$USER_A' limit 1;")"
APPT_A="$(scalar "$(as_user "$USER_A" "select id from book_appointment(1, '$SLOT4', 'Usuario A', '8095550001', p_profile_vehicle_id => $GARAGE_A, p_vehicle_text => 'Toyota Corolla 2015');")")"
check "una cita con sesion queda a nombre de su dueño" "$USER_A" "select user_id from service_appointments where id = '$APPT_A';"
check "con su vehiculo del garaje" "$GARAGE_A" "select profile_vehicle_id from service_appointments where id = '$APPT_A';"
check "el dueño ve la suya" "1" "$(as_user "$USER_A" 'select count(*) from service_appointments;')"
check "otro usuario no ve ninguna" "0" "$(as_user "$USER_B" 'select count(*) from service_appointments;')"
check "un admin las ve todas" "5" "$(as_user "$ADMIN" 'select count(*) from service_appointments;')"
check "my_appointments trae las del usuario" "1" "$(as_user "$USER_A" 'select count(*) from my_appointments();')"
check "y no las de otro" "0" "$(as_user "$USER_B" 'select count(*) from my_appointments();')"
check "anon no invoca my_appointments" "$(denied my_appointments)" "$(as_anon 'select count(*) from my_appointments();')"
check "no se agenda con el vehiculo del garaje de otro" "ERROR:  Ese vehiculo no es de tu garaje." \
  "$(as_user "$USER_B" "select * from book_appointment(1, '$SLOT4', 'Usuario B', '8095550002', p_profile_vehicle_id => $GARAGE_A);")"
check "ni un admin cambia el estado con un update directo: no hay politica" "requested" \
  "$(as_user "$ADMIN" "update service_appointments set status = 'confirmed' where id = '$APPT1'; select status from service_appointments where id = '$APPT1';")"

echo "   (estados de la cita: solo set_appointment_status(), solo un admin, en orden)"
check "anon no invoca set_appointment_status" "$(denied set_appointment_status)" \
  "$(as_anon "select * from set_appointment_status('$APPT1', 'confirmed');")"
check "un usuario normal recibe 42501" "ERROR:  Solo un administrador puede cambiar el estado de las citas." \
  "$(as_user "$USER_A" "select * from set_appointment_status('$APPT_A', 'confirmed');")"
check "de requested no se salta a done" "ERROR:  Una cita requested no puede pasar a done." \
  "$(as_user "$ADMIN" "select * from set_appointment_status('$APPT1', 'done');")"
check "un estado inventado se rechaza" "ERROR:  Estado no valido: volando." \
  "$(as_user "$ADMIN" "select * from set_appointment_status('$APPT1', 'volando');")"
check "una cita que no existe tambien" "ERROR:  Esa cita no existe." \
  "$(as_user "$ADMIN" "select * from set_appointment_status('00000000-0000-0000-0000-000000000000', 'confirmed');")"
check "un admin la confirma, con una nota que el cliente ve" "confirmed" \
  "$(as_user "$ADMIN" "select status from set_appointment_status('$APPT1', 'confirmed', 'Te esperamos');")"
check "la nota queda guardada" "Te esperamos" "select status_note from service_appointments where id = '$APPT1';"
check "confirmed → done" "done" "$(as_user "$ADMIN" "select status from set_appointment_status('$APPT1', 'done');")"
check "una cita hecha ya no se mueve" "ERROR:  Una cita done no puede pasar a cancelled." \
  "$(as_user "$ADMIN" "select * from set_appointment_status('$APPT1', 'cancelled');")"
check "una cita hecha ya no ocupa cupo: queda uno libre" "1" \
  "$(as_anon "select remaining from available_slots(1, '$MONDAY') where slot_at = '$SLOT0';")"

echo "   (cancelar: solo la propia, solo con mas de 24 horas)"
check "anon no invoca cancel_appointment" "$(denied cancel_appointment)" "$(as_anon "select cancel_appointment('$APPT_A');")"
check "otro usuario no puede cancelar la ajena" "ERROR:  Esa cita no existe." \
  "$(as_user "$USER_B" "select cancel_appointment('$APPT_A');")"
check "ni la de un invitado" "ERROR:  Esa cita no existe." \
  "$(as_user "$USER_A" "select cancel_appointment('$APPT2');")"
check "el dueño cancela la suya, con mas de 24 horas" "cancelled|Cancelada por el cliente" \
  "$(as_user "$USER_A" "select cancel_appointment('$APPT_A'); select status || '|' || status_note from service_appointments where id = '$APPT_A';")"
check "y la franja se libera" "t" \
  "$(as_anon "select exists (select 1 from available_slots(1, '$MONDAY') where slot_at = '$SLOT4');")"
check "cancelar dos veces se rechaza" "ERROR:  Esta cita ya no se puede cancelar." \
  "$(as_user "$USER_A" "select cancel_appointment('$APPT_A');")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into service_appointments (id, user_id, service_id, contact_name, contact_phone, scheduled_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '$USER_A', 1, 'Usuario A', '8095550001', now() + interval '10 hours');
SQL
check "con menos de 24 horas no se puede" \
  "ERROR:  Solo se puede cancelar con mas de 24 horas de anticipacion. Escribenos por WhatsApp." \
  "$(as_user "$USER_A" "select cancel_appointment('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');")"

echo "   (trabajos realizados y su bucket)"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into service_works (service_id, title, is_published) values (1, 'Publicado', true), (null, 'Borrador', false);
SQL
check "anon ve solo los publicados" "Publicado" "$(as_anon "select string_agg(title, ',') from service_works;")"
check "un admin ve tambien los borradores" "2" "$(as_user "$ADMIN" 'select count(*) from service_works;')"
check "anon no escribe trabajos" 'ERROR:  new row violates row-level security policy for table "service_works"' \
  "$(as_anon "insert into service_works (title, is_published) values ('Hackeado', true);")"
check "ni un usuario normal" 'ERROR:  new row violates row-level security policy for table "service_works"' \
  "$(as_user "$USER_A" "insert into service_works (title, is_published) values ('Hackeado', true);")"
check "un admin si" "" "$(as_user "$ADMIN" "insert into service_works (title) values ('Nuevo');")"
check "el bucket es publico y de 5 MB" "true|5242880" \
  "select public::text || '|' || file_size_limit from storage.buckets where id = 'service-works';"
check "anon no sube fotos de trabajos" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('service-works', 'x/a.jpg');")"
check "ni un usuario normal" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_user "$USER_A" "insert into storage.objects (bucket_id, name) values ('service-works', 'x/a.jpg');")"
check "un admin si" "" "$(as_user "$ADMIN" "insert into storage.objects (bucket_id, name) values ('service-works', 'x/a.jpg');")"
check "y las fotos las ve cualquiera" "1" "$(as_anon "select count(*) from storage.objects where bucket_id = 'service-works';")"

echo "→ Resenas: autor, compra verificada, estrellas y borrado (migracion 0020)"
# Escenario, por encima de RLS: stock de sobra para la pieza 5, y un pedido
# entregado de USER_A con esa pieza. USER_B tiene un pedido de la misma pieza **sin
# entregar**: no cuenta como compra.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update hub_parts set stock = 100, is_active = true where id = 5;
SQL
ORD_RA="$(scalar "$(as_user "$USER_A" "select id from create_order('a@x.com', 'Usuario A', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550001', p_province => 'Santiago');")")"
ORD_RB="$(scalar "$(as_user "$USER_B" "select id from create_order('b@x.com', 'Usuario B', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550002', p_province => 'Santiago');")")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
update orders set status = 'delivered' where id = '$ORD_RA';
SQL
check "los pedidos de la prueba quedaron a nombre de sus dueños" "$USER_A|$USER_B" \
  "select (select user_id from orders where id = '$ORD_RA') || '|' || (select user_id from orders where id = '$ORD_RB');"

echo "   (las estrellas sembradas)"
check "toda pieza sembrada conserva sus estrellas como stars_seed" "0" \
  "select count(*) from hub_parts where stars_seed <> stars_rating;"
check "y ninguna empieza con reseñas" "0" "select count(*) from hub_parts where review_count <> 0;"
STARS5="$(scalar 'select stars_rating from hub_parts where id = 5;')"

echo "   (quien lee y quien escribe)"
review() { echo "insert into reviews (target_type, target_id, user_id, rating, comment) values ('$1', $2, '$3', $4, '$5') returning is_verified_purchase;"; }
check "anon no escribe reseñas" "ERROR:  permission denied for table reviews" \
  "$(as_anon "$(review product 5 "$USER_A" 5 'Hackeada')")"
check "nadie escribe a nombre de otro" 'ERROR:  new row violates row-level security policy for table "reviews"' \
  "$(as_user "$USER_B" "$(review product 5 "$USER_A" 5 'Suplantada')")"
check "una calificacion de 0 se rechaza" 'ERROR:  new row for relation "reviews" violates check constraint "reviews_rating_check"' \
  "$(as_user "$USER_A" "$(review product 5 "$USER_A" 0 'x')")"
check "y una de 6 tambien" 'ERROR:  new row for relation "reviews" violates check constraint "reviews_rating_check"' \
  "$(as_user "$USER_A" "$(review product 5 "$USER_A" 6 'x')")"
LONG="$(printf 'x%.0s' $(seq 1 1001))"
check "un comentario de mas de 1000 caracteres se rechaza" 'ERROR:  new row for relation "reviews" violates check constraint "reviews_comment_check"' \
  "$(as_user "$USER_A" "$(review product 5 "$USER_A" 5 "$LONG")")"
check "un producto que no existe no se reseña" "ERROR:  Ese producto no existe." \
  "$(as_user "$USER_A" "$(review product 99999 "$USER_A" 5 'x')")"
check "ni un servicio que no existe" "ERROR:  Ese servicio no existe." \
  "$(as_user "$USER_A" "$(review service 99999 "$USER_A" 5 'x')")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update hub_parts set is_active = false where id = 5;
SQL
check "un producto apagado tampoco" "ERROR:  Ese producto no existe." \
  "$(as_user "$USER_A" "$(review product 5 "$USER_A" 5 'x')")"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update hub_parts set is_active = true where id = 5;
SQL

echo "   (compra verificada: la calcula Postgres, no el navegador)"
check "con un pedido entregado de esa pieza, la reseña sale verificada" "t" \
  "$(as_user "$USER_A" "$(review product 5 "$USER_A" 5 '  Excelente, quedo perfecto  ')")"
check "el comentario se guarda sin espacios sobrantes" "Excelente, quedo perfecto" \
  "select comment from reviews where user_id = '$USER_A' and target_type = 'product';"
check "con un pedido sin entregar, no" "f" \
  "$(as_user "$USER_B" "$(review product 5 "$USER_B" 3 'Regular')")"
check "pedir la etiqueta a mano no la da: se pisa" "f" \
  "$(as_user "$USER_B" "insert into reviews (target_type, target_id, user_id, rating, is_verified_purchase) values ('service', 1, '$USER_B', 4, true) returning is_verified_purchase;")"
check "una persona sin ningun pedido, tampoco" "0" \
  "select count(*) from reviews where user_id = '$ADMIN' and is_verified_purchase;"
check "una reseña por persona y objetivo" 'ERROR:  duplicate key value violates unique constraint "reviews_one_per_user"' \
  "$(as_user "$USER_A" "$(review product 5 "$USER_A" 1 'Otra vez')")"
check "pero la misma persona puede reseñar otro objetivo" "f" \
  "$(as_user "$USER_A" "$(review service 1 "$USER_A" 4 'Buen taller')")"

echo "   (una cita hecha verifica la reseña del servicio)"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into service_appointments (user_id, service_id, contact_name, contact_phone, scheduled_at, status)
values ('$USER_B', 2, 'Usuario B', '8095550002', now() - interval '2 days', 'done'),
       ('$USER_A', 3, 'Usuario A', '8095550001', now() + interval '3 days', 'confirmed');
SQL
check "con una cita done de ese servicio, verificada" "t" \
  "$(as_user "$USER_B" "$(review service 2 "$USER_B" 5 'Rapidos')")"
check "con una cita solo confirmada, no" "f" \
  "$(as_user "$USER_A" "$(review service 3 "$USER_A" 5 'Aun no fui')")"
check "sin ninguna cita de ese servicio, no" "f" \
  "$(as_user "$USER_A" "$(review service 4 "$USER_A" 2 'Sin cita')")"

echo "   (lectura publica y estadisticas)"
check "anon lee las reseñas" "7" "$(as_anon 'select count(*) from reviews;')"
check "y las estadisticas de un producto: total, promedio y distribucion" "2|4.0|0|0|1|0|1" \
  "$(as_anon "select total || '|' || average || '|' || c1 || '|' || c2 || '|' || c3 || '|' || c4 || '|' || c5 from review_stats('product', 5);")"
check "un objetivo sin reseñas da ceros, no un error" "0|0|0|0|0|0|0" \
  "$(as_anon "select total || '|' || average || '|' || c1 || '|' || c2 || '|' || c3 || '|' || c4 || '|' || c5 from review_stats('product', 4);")"
check "el promedio y el contador quedan en la pieza" "4.0|2" \
  "select stars_rating || '|' || review_count from hub_parts where id = 5;"
check "las estrellas sembradas no se pisan" "$STARS5" "select stars_seed from hub_parts where id = 5;"
check "las reseñas de servicio no tocan las piezas" "0" \
  "select count(*) from hub_parts where review_count <> 0 and id <> 5;"

echo "   (no hay UPDATE, y se borra poco)"
check "nadie edita una reseña, ni la suya" "ERROR:  permission denied for table reviews" \
  "$(as_user "$USER_A" "update reviews set rating = 1 where user_id = '$USER_A';")"
check "ni un admin" "ERROR:  permission denied for table reviews" \
  "$(as_user "$ADMIN" "update reviews set is_verified_purchase = true;")"
check "anon no borra" "ERROR:  permission denied for table reviews" "$(as_anon 'delete from reviews;')"
check "un usuario no borra la reseña de otro" "4" \
  "$(as_user "$USER_B" "delete from reviews where user_id = '$USER_A'; select count(*) from reviews where user_id = '$USER_A';")"
check "el autor borra la suya, y las estrellas se recalculan" "5.0|1" \
  "$(as_user "$USER_B" "delete from reviews where user_id = '$USER_B' and target_type = 'product'; select stars_rating || '|' || review_count from hub_parts where id = 5;")"
check "un admin borra cualquiera (moderacion)" "0|$STARS5" \
  "$(as_user "$ADMIN" "delete from reviews where user_id = '$USER_A' and target_type = 'product'; select review_count || '|' || stars_rating from hub_parts where id = 5;")"
check "sin reseñas, la pieza vuelve a sus estrellas sembradas" "$STARS5|0" \
  "select stars_rating || '|' || review_count from hub_parts where id = 5;"

echo "   (si se borra el producto o el servicio, se van sus reseñas)"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into hub_parts (id, category, name, brand, img_url, price, stock) values (99901, 'x', 'Pieza efimera', 'X', 'x.jpg', 100, 1);
insert into services (id, icon, title, description) values (99901, 'x', 'Servicio efimero', 'x');
insert into reviews (target_type, target_id, user_id, rating) values ('product', 99901, '$USER_A', 4), ('service', 99901, '$USER_A', 4);
SQL
check "antes de borrar hay dos" "2" "select count(*) from reviews where target_id = 99901;"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
delete from hub_parts where id = 99901;
delete from services where id = 99901;
SQL
check "despues, ninguna" "0" "select count(*) from reviews where target_id = 99901;"

echo "   (las funciones de trigger no se llaman a mano; review_stats si, desde anon)"
check "anon no invoca reviews_prepare" "$(denied reviews_prepare)" "$(as_anon 'select reviews_prepare();')"
check "ni un usuario" "$(denied reviews_sync_product)" "$(as_user "$USER_A" 'select reviews_sync_product();')"
check "anon si llama a review_stats" "0" "$(as_anon "select total from review_stats('service', 10);")"
check "ningun producto sin reseñas se aparta de sus estrellas sembradas" "0" \
  "select count(*) from hub_parts where review_count = 0 and stars_rating <> stars_seed;"

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
apply supabase/migrations/0017_store_catalog.sql upgrade
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


echo "→ Camino de actualizacion de la 0018: la base real ya tiene pedidos al migrar"
# Pedidos anteriores a la 0018, con el esquema de entonces: sin numero, sin
# entrega, sin stock descontado. Es lo que la migracion tiene que numerar,
# clasificar y dejar en paz.
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into shipping_options (id, label, description, price, eta_label) values
  ('standard', 'Estandar', 'x', 0, '5 dias'),
  ('pickup',   'Retiro',   'Coordinación por WhatsApp / correo al confirmar el pedido.', 0, 'A coordinar');
insert into payment_methods (id, label, description) values
  ('card',     'Tarjeta',       'x'),
  ('transfer', 'Transferencia', 'Recibirás los datos al confirmar el pedido.');
insert into orders (contact_email, full_name, address_line1, shipping_option_id, payment_method_id,
                    subtotal, total, status, created_at) values
  ('a@x.com', 'Antiguo Uno',  'Calle 1', 'standard', 'card',     100, 100, 'pending',   '2026-08-01'),
  ('b@x.com', 'Antiguo Dos',  'Calle 2', 'pickup',   'transfer', 200, 200, 'paid',      '2026-08-02'),
  ('c@x.com', 'Antiguo Tres', 'Calle 3', 'standard', 'card',     300, 300, 'delivered', '2026-07-30');
insert into order_items (order_id, part_id, name, unit_price, quantity)
  select id, (select min(id) from hub_parts), 'Pieza vieja', 100, 2 from orders where full_name = 'Antiguo Uno';
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'admin@x.com');
set request.jwt.claim.role = 'service_role';
update profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';
SQL
apply supabase/migrations/0018_orders_payment_flow.sql upgrade
apply supabase/migrations/0018_orders_payment_flow.sql upgrade
echo "   (aplicada dos veces, con pedidos dentro)"
CHECK_DB=upgrade check "los pedidos viejos reciben su numero en el orden en que se hicieron" \
  "Antiguo Tres=1001,Antiguo Uno=1002,Antiguo Dos=1003" \
  "select string_agg(full_name || '=' || order_number, ',' order by order_number) from orders;"
CHECK_DB=upgrade check "volver a aplicar no los renumera" "3" \
  "select count(*) from orders where order_number between 1001 and 1003;"
CHECK_DB=upgrade check "lo que era retiro lo sigue siendo, lo demas es envio" "pickup|2" \
  "select (select fulfillment_type::text from orders where full_name = 'Antiguo Dos') || '|' || (select count(*) from orders where fulfillment_type = 'shipping');"
CHECK_DB=upgrade check "conservan su estado" "paid,pending,delivered" \
  "select string_agg(status::text, ',' order by order_number desc) from orders;"
CHECK_DB=upgrade check "y no descontaron stock: no hay nada que devolver" "0" \
  "select coalesce(sum(stock_deducted), 0) from order_items;"
CHECK_DB=upgrade check "el historial empieza con la 0018: los pedidos viejos no lo tienen" "0" \
  "select count(*) from order_status_history;"
STOCK_MIN_BEFORE="$(SCALAR_DB=upgrade scalar 'select stock from hub_parts where id = (select min(id) from hub_parts);')"
CHECK_DB=upgrade check "cancelar un pedido viejo no inventa existencias" "cancelled|$STOCK_MIN_BEFORE" \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select status || '|' || (select stock from hub_parts where id = (select min(id) from hub_parts)) from set_order_status((select id from orders where full_name = 'Antiguo Uno'), 'cancelled');")"
CHECK_DB=upgrade check "y queda en el historial desde ahi" "1" \
  "select count(*) from order_status_history;"
CHECK_DB=upgrade check "el siguiente pedido es el 1004" "1004" \
  "$(as_anon "select order_number from create_order('n@x.com', 'Nuevo', 'Calle', 'standard', 'transfer', '[{\"part_id\": 1, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"


echo "→ Camino de actualizacion de la 0019: la base real ya tiene los cuatro servicios de antes"
# La base real tiene cuatro servicios genericos (icono, titulo, descripcion) y ningun
# slug. La migracion les pone slug y categoria, los desactiva (el catalogo nuevo los
# cubre) y agrega el resto, sin tocar sus ids: una pieza puede apuntar a uno.
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into services (icon, title, description, sort_order) values
  ('assets/icons/maintenance-hub-icon.svg', 'Mantenimiento', 'Preventivo y correctivo para tu vehiculo.', 0),
  ('assets/icons/repair-hub-icon.svg', 'Reparacion', 'Especialistas en mecanica avanzada y Performance.', 1),
  ('assets/icons/medical-scanner-hub-icon.svg', 'Chequeo y Diagnostico', 'Analisis computarizado.', 2),
  ('assets/icons/search-check-hub-icon.svg', 'Busqueda y Revision', 'Te ayudamos a encontrar y verificar tu proximo vehiculo.', 3);
update hub_parts set installable = true, installation_service_id = 1 where id = (select min(id) from hub_parts);
SQL
apply supabase/migrations/0019_services_booking.sql upgrade
apply supabase/migrations/0019_services_booking.sql upgrade
echo "   (aplicada dos veces, con servicios dentro)"
CHECK_DB=upgrade check "los cuatro de antes conservan su id y reciben slug y categoria" \
  "mantenimiento:mantenimiento,reparacion:mecanica,chequeo-y-diagnostico:diagnostico,busqueda-y-revision:diagnostico" \
  "select string_agg(slug || ':' || category, ',' order by id) from services where id <= 4;"
CHECK_DB=upgrade check "y se desactivan: el catalogo nuevo los cubre" "0" \
  "select count(*) from services where id <= 4 and is_active;"
CHECK_DB=upgrade check "el catalogo nuevo queda activo, sin duplicarse al volver a aplicar" "10|14" \
  "select count(*) filter (where is_active) || '|' || count(*) from services;"
CHECK_DB=upgrade check "una pieza que apuntaba a un servicio viejo sigue apuntandole" "Mantenimiento" \
  "select s.title from hub_parts p join services s on s.id = p.installation_service_id where p.installable;"
CHECK_DB=upgrade check "el horario de ejemplo no se duplica al volver a aplicar" "6" "select count(*) from service_availability;"

echo "→ Camino de actualizacion de la 0020: la base real ya tiene piezas con estrellas sembradas"
# Antes de la 0020, `stars_rating` era el dato sembrado. La migracion lo copia a
# `stars_seed` una sola vez; si se volviera a aplicar con reseñas reales ya dentro, no
# puede tomar un promedio por sembrado.
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update hub_parts set stars_rating = case when id % 2 = 0 then 4.5 else 0 end;
SQL
apply "$LAST_MIGRATION" upgrade
CHECK_DB=upgrade check "las piezas con estrellas las copian a stars_seed, las demas quedan en 0" "4.5|0.0" \
  "select (select max(stars_seed) from hub_parts where id % 2 = 0) || '|' || (select max(stars_seed) from hub_parts where id % 2 = 1);"
CHECK_DB=upgrade check "todas empiezan con 0 reseñas" "0" "select count(*) from hub_parts where review_count <> 0;"
UP_PART="$(SCALAR_DB=upgrade scalar 'select min(id) from hub_parts where id % 2 = 0;')"
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into reviews (target_type, target_id, user_id, rating) values ('product', $UP_PART, '11111111-1111-1111-1111-111111111111', 2);
SQL
CHECK_DB=upgrade check "una reseña real reemplaza a las estrellas sembradas por el promedio" "2.0|1|4.5" \
  "select stars_rating || '|' || review_count || '|' || stars_seed from hub_parts where id = $UP_PART;"
apply "$LAST_MIGRATION" upgrade
echo "   (aplicada otra vez, con una reseña real dentro)"
CHECK_DB=upgrade check "el promedio real no se toma por sembrado" "2.0|1|4.5" \
  "select stars_rating || '|' || review_count || '|' || stars_seed from hub_parts where id = $UP_PART;"
CHECK_DB=upgrade check "y al quedarse sin reseñas, vuelve a las sembradas" "4.5|0" \
  "delete from reviews; select stars_rating || '|' || review_count from hub_parts where id = $UP_PART;"

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
