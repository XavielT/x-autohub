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
# Ni el build, ni `tsc`, ni las 304 pruebas ven un solo error de SQL: las
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

# --- Migraciones y seed -------------------------------------------------------

FAILED=0
LAST_MIGRATION=""

apply() {
  local file="$1" name
  name="$(basename "$file")"
  if $PSQL -v ON_ERROR_STOP=1 --single-transaction -f "$file" >"$WORKDIR/$name.log" 2>&1; then
    printf '   OK    %s\n' "$name"
  else
    printf '   FALLA %s\n' "$name"
    sed 's/^/         /' "$WORKDIR/$name.log" | head -8
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
  raw="$($PSQL -t -A -c "$sql" 2>&1)"
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
