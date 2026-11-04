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

# VERIFY_PGBIN apunta a un Postgres instalado fuera del PATH (en Windows: el zip de binarios,
# p. ej. VERIFY_PGBIN=C:/dev/pgsql/bin). Ahi no hay sockets Unix, y se usa TCP en 127.0.0.1.
PGBIN="${VERIFY_PGBIN:-}"
for candidate in $(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -rV) ""; do
  if [ -n "$PGBIN" ]; then break; fi
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
if [ -n "${VERIFY_PGBIN:-}" ]; then HOST=127.0.0.1; LISTEN=127.0.0.1; SOCKET_OPT=""; else HOST="$SOCKET"; LISTEN=""; SOCKET_OPT="-k $SOCKET"; fi
PSQL="$PGBIN/psql -h $HOST -p $PORT -U postgres -X -q"

cleanup() {
  "$PGBIN/pg_ctl" -D "$WORKDIR/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
[ -n "${VERIFY_KEEP:-}" ] || trap cleanup EXIT

mkdir -p "$SOCKET"
echo "→ Cluster temporal en $WORKDIR (puerto $PORT)"
export PGCLIENTENCODING=UTF8   # en Windows el valor por defecto es WIN1252 y las tildes de las pruebas no coinciden
"$PGBIN/initdb" -D "$WORKDIR/data" -U postgres -E UTF8 --auth=trust >"$WORKDIR/initdb.log" 2>&1
"$PGBIN/pg_ctl" -D "$WORKDIR/data" \
  -o "${SOCKET_OPT} -p $PORT -c listen_addresses=${LISTEN:-''} -c lc_messages=C" \
  -l "$WORKDIR/postgres.log" start >/dev/null 2>&1

for _ in $(seq 1 20); do
  $PSQL -c 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

# --- Andamio ------------------------------------------------------------------

$PSQL -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create role anon nologin;
create role authenticated nologin;
-- Como en Supabase, `service_role` se salta RLS: asi lo usan las Edge Functions con la clave de servicio.
create role service_role nologin bypassrls;
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

-- pg_net, pg_cron y Vault (0026). En Supabase vienen instalados; aqui se reemplazan por
-- lo minimo que la migracion usa, y las llamadas quedan anotadas para poder comprobarlas:
--   · net.http_post() guarda la URL en net.calls en vez de salir a la red;
--   · cron.schedule() hace upsert por nombre, como el de verdad;
--   · vault.decrypted_secrets es una tabla simple.
create schema net;
create table net.calls (id bigserial primary key, url text not null, body jsonb, headers jsonb);
create function net.http_post(
  url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.calls (url, body, headers) values (url, body, headers) returning id;
$$;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid;
$$;
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
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
  if [ -n "${VERIFY_PGBIN:-}" ] && printf '%s' "$sql" | LC_ALL=C grep -q '[^ -~[:space:]]'; then
    # Windows: un `-c` con tildes pierde la codificacion al pasar por la linea de comandos; por archivo no.
    printf '%s' "$sql" > "$WORKDIR/check.sql"
    raw="$($PSQL -d "${CHECK_DB:-postgres}" -t -A -v ON_ERROR_STOP=1 -f "$WORKDIR/check.sql" 2>&1 | sed -E 's/^psql:[^ ]*: //')"
  else
    raw="$($PSQL -d "${CHECK_DB:-postgres}" -t -A -c "$sql" 2>&1)"
  fi
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
check "anon lee los ajustes (cuentas y retiro)" "array|object" \
  "$(as_anon "select (select jsonb_typeof(value) from site_settings where key='bank_accounts') || '|' || (select jsonb_typeof(value) from site_settings where key='pickup_address');")"

echo "→ Contenido de prueba (migracion 0013)"
check "anon no ve piezas de prueba"      "0" "$(as_anon 'select count(*) from hub_parts where is_test;')"
check "anon no ve vehiculos de prueba"   "0" "$(as_anon 'select count(*) from auto_hub_vehicles where is_test;')"
check "un usuario de prueba si las ve"   "1" \
  "$(as_user '33333333-3333-3333-3333-333333333333' 'select count(*) from hub_parts where is_test;')"

echo "→ El contador del home ya no existe (migracion 0021)"
check "get_site_stats() se borro" 'ERROR:  function get_site_stats() does not exist' \
  "$(as_anon 'select * from get_site_stats();')"
check "y la fila stats_mode tampoco esta" "0" "select count(*) from site_settings where key = 'stats_mode';"

# Una publicacion de prueba y una pendiente, las dos de vehiculos. Ya nadie las cuenta,
# pero los conteos de Hub Market de mas abajo parten de que existen.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_market_items
  (title, description, images, price, location, seller_name, category, spec_year, status, is_active, is_test)
values
  ('PRUEBA vehiculo',    'x', '{}', 1, 'Santiago', 'x', 'vehiculos', 2020, 'aprobado',  true, true),
  ('Pendiente vehiculo', 'x', '{}', 1, 'Santiago', 'x', 'vehiculos', 2020, 'pendiente', true, false);
SQL

echo "→ Ajustes del sitio: escritura solo por set_site_setting() (0014)"
# Ojo con lo que se comprueba aqui: el update de `anon` **no da error**, se queda
# en cero filas. Los default privileges de Supabase le dan UPDATE sobre la tabla
# (se verifico en la base en vivo: `anon` tiene INSERT/UPDATE/DELETE en todo lo
# nuevo del esquema public), asi que lo unico que lo detiene es que no hay
# politica de escritura. Lo que importa no es el error, es que el valor no
# cambie: es exactamente lo que responde PostgREST en produccion — HTTP 200 con
# `[]`.
check "un update de anon deja el ajuste como estaba" "1" \
  "$(as_anon "update site_settings set value='[]' where key='bank_accounts';
              select jsonb_array_length(value) from site_settings where key='bank_accounts';")"
check "anon no puede invocar set_site_setting" "$(denied set_site_setting)" \
  "$(as_anon "select * from set_site_setting('pickup_address','{}');")"
check "un usuario normal recibe 42501" \
  "ERROR:  Solo un administrador puede cambiar los ajustes del sitio." \
  "$(as_user '22222222-2222-2222-2222-222222222222' "select * from set_site_setting('pickup_address','{}');")"
check "un admin si lo cambia" "Horario de prueba" \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select value ->> 'hours' from set_site_setting('pickup_address', jsonb_set((select value from site_settings where key = 'pickup_address'), '{hours}', '\"Horario de prueba\"'));")"
# Se deja el valor de ejemplo como estaba: lo que sigue (pedidos, 0018) parte de el.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update site_settings set value = jsonb_set(value, '{hours}', '"Horario de ejemplo"') where key = 'pickup_address';
SQL
check "un valor con la forma equivocada lo rechaza el check" \
  "ERROR:  new row for relation \"site_settings\" violates check constraint \"site_settings_value_valid\"" \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select * from set_site_setting('bank_accounts','\"no-es-un-arreglo\"');")"
check "stats_mode ya no es un ajuste que se pueda cambiar" "ERROR:  Ese ajuste no existe: stats_mode." \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select * from set_site_setting('stats_mode','\"real\"');")"
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
check "la busqueda de la tienda sin sesion" "35" "$(as_anon 'select total_count from search_products(p_limit => 1);')"

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
  "ERROR:  Las categorías admiten dos niveles como máximo." \
  "$(as_user "$ADMIN" "insert into product_categories (slug, name, parent_id) select 'x3', 'X3', id from product_categories where slug='discos';")"
check "ni una categoria con hijas puede pasar a ser hija" \
  "ERROR:  Una categoría con subcategorías no puede ser subcategoría." \
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
check "una pieza nueva solo con category_id queda clasificada (0021: ya no hay texto de categoria)" "discos" \
  "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, category_id) select 'QQ Hija', 'M', 'x.jpg', 100, id from product_categories where slug='discos' returning (select slug from product_categories c where c.id = category_id);")"
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

echo "→ Modelo escrito a mano en el garaje (migracion 0040)"
check "model_id nulo con model_text entra, para el dueno" ""   "$(as_user "$USER_A" "insert into profile_vehicles (user_id, make_id, model_text, year) select auth.uid(), mk.id, 'Impreza', 2012 from vehicle_makes mk where mk.slug='subaru';")"
check "un usuario no escribe model_text en el garaje de otro"   'ERROR:  new row violates row-level security policy for table "profile_vehicles"'   "$(as_user "$USER_B" "insert into profile_vehicles (user_id, make_id, model_text, year) select '$USER_A', mk.id, 'Impreza', 2013 from vehicle_makes mk where mk.slug='subaru';")"
check "ni lo cambia en una fila ajena (no ve la fila: 0 actualizadas)" "0"   "$(as_user "$USER_B" "with u as (update profile_vehicles set model_text = 'Hackeado' where user_id = '$USER_A' returning 1) select count(*) from u;")"
check "model_id y model_text a la vez, no"   'ERROR:  new row for relation "profile_vehicles" violates check constraint "profile_vehicles_model_or_text"'   "$(as_user "$USER_A" "insert into profile_vehicles (user_id, make_id, model_id, model_text, year) select auth.uid(), mk.id, vm.id, 'Corolla', 2020 from vehicle_makes mk join vehicle_models vm on vm.make_id = mk.id where mk.slug='toyota' and vm.slug='corolla';")"
check "un usuario normal no puede crear modelos"   'ERROR:  Solo un administrador puede crear modelos'   "$(as_user "$USER_A" "select * from admin_create_vehicle_model((select id from vehicle_makes where slug='subaru'), 'Impreza');")"
check "anon no ejecuta admin_create_vehicle_model"   'ERROR:  permission denied for function admin_create_vehicle_model'   "$(as_anon "select * from admin_create_vehicle_model(1, 'X');")"
check "el admin crea el modelo y migra 1 garaje" "1"   "$(as_user "$ADMIN" "select migrated from admin_create_vehicle_model((select id from vehicle_makes where slug='subaru'), 'impreza');")"
check "el garaje ahora apunta al modelo y sin texto" "1"   "select count(*) from profile_vehicles pv join vehicle_models vm on vm.id = pv.model_id where pv.user_id = '$USER_A' and vm.slug = 'impreza' and pv.model_text is null;"


echo "→ Sugerencias del buscador y alias (migracion 0042)"
check "un usuario normal no escribe alias"   'ERROR:  new row violates row-level security policy for table "product_aliases"'   "$(as_user "$USER_A" "insert into product_aliases (product_id, alias) values (2, 'zzbumper');")"
check "el admin agrega un alias" "" "$(as_user "$ADMIN" "insert into product_aliases (product_id, alias) values (2, 'zzbumper');")"
check "el mismo alias (sin tildes ni mayusculas) no se repite"   'ERROR:  duplicate key value violates unique constraint "product_aliases_unique"'   "$(as_user "$ADMIN" "insert into product_aliases (product_id, alias) values (2, 'ZZBUMPER');")"
check "anon encuentra el producto por su alias y la sugerencia lo dice" "zzbumper"   "$(as_anon "select matched_alias from suggest_products('zzbump') limit 1;")"
check "una busqueda de un caracter no devuelve nada" "0"   "$(as_anon "select count(*) from suggest_products('a');")"
check "anon no escribe alias"   'ERROR:  permission denied for table product_aliases'   "$(as_anon "insert into product_aliases (product_id, alias) values (2, 'otro');")"
check "el limite se recorta a 20" "t"   "$(as_anon "select count(*) <= 20 from suggest_products('de', 500);")"
check "un error de tecleo en la marca (migracion 0048) tambien encuentra" "t"   "$(as_anon "select count(*) > 0 from suggest_products('brenbo');")"

echo "→ Comunidad: me gusta, comentarios y contadores (migracion 0045)"
POST1=90001
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into social_posts (id, author_id, author_name, text) values ($POST1, '$USER_A', 'A', 'hola');
SQL
check "sin sesion no hay me gusta"   'ERROR:  permission denied for table social_post_likes'   "$(as_anon "insert into social_post_likes (post_id, user_id) values ($POST1, '$USER_A');")"
check "no se da un me gusta a nombre de otro"   'ERROR:  new row violates row-level security policy for table "social_post_likes"'   "$(as_user "$USER_B" "insert into social_post_likes (post_id, user_id) values ($POST1, '$USER_A');")"
check "dar un me gusta" "" "$(as_user "$USER_B" "insert into social_post_likes (post_id, user_id) values ($POST1, auth.uid());")"
check "el contador sube solo" "1" "select likes from social_posts where id = $POST1;"
check "el mismo me gusta dos veces, no"   'ERROR:  duplicate key value violates unique constraint "social_post_likes_pkey"'   "$(as_user "$USER_B" "insert into social_post_likes (post_id, user_id) values ($POST1, auth.uid());")"
check "cada quien ve solo sus me gusta" "0" "$(as_user "$USER_A" "select count(*) from social_post_likes;")"
check "quitar el me gusta" "" "$(as_user "$USER_B" "delete from social_post_likes where post_id = $POST1;")"
check "el contador baja" "0" "select likes from social_posts where id = $POST1;"
check "el autor no se escribe sus propios me gusta"   'ERROR:  permission denied for table social_posts'   "$(as_user "$USER_A" "update social_posts set likes = 999 where id = $POST1;")"
check "pero si edita su texto" "" "$(as_user "$USER_A" "update social_posts set text = 'hola otra vez' where id = $POST1;")"
check "anon lee comentarios pero no escribe" "0" "$(as_anon "select count(*) from social_post_comments;")"
check "anon no comenta"   'ERROR:  permission denied for table social_post_comments'   "$(as_anon "insert into social_post_comments (post_id, author_id, text) values ($POST1, '$USER_A', 'x');")"
check "comentar" "" "$(as_user "$USER_B" "insert into social_post_comments (post_id, author_id, text) values ($POST1, auth.uid(), 'buen carro');")"
check "el contador de comentarios sube" "1" "select comments from social_posts where id = $POST1;"
check "un comentario vacio, no"   'ERROR:  new row for relation "social_post_comments" violates check constraint "social_post_comments_text_check"'   "$(as_user "$USER_B" "insert into social_post_comments (post_id, author_id, text) values ($POST1, auth.uid(), '');")"
check "otro usuario no borra el comentario (0 filas)" "0" "$(as_user "$USER_A" "with d as (delete from social_post_comments where post_id = $POST1 returning 1) select count(*) from d;")"
check "el admin si lo borra" "1" "$(as_user "$ADMIN" "with d as (delete from social_post_comments where post_id = $POST1 returning 1) select count(*) from d;")"
check "y el contador baja" "0" "select comments from social_posts where id = $POST1;"
check "mas de 4 archivos en una publicacion, no"   'ERROR:  new row for relation "social_posts" violates check constraint "social_posts_media_check"'   "$(as_user "$USER_A" "insert into social_posts (author_id, author_name, text, media) values (auth.uid(), 'A', 'x', '[{},{},{},{},{}]');")"

echo "→ Tildes en el contenido ya cargado (migracion 0049)"
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into social_posts (id, author_id, author_name, text) values (90002, '$USER_A', 'A', 'Instalacion RAPIDA y bateria nueva, mas barata: cumplio 20 anos. Slug: bateria-agm');
SQL
$PSQL -v ON_ERROR_STOP=1 -q -f supabase/migrations/0049_content_accents.sql >/dev/null
check "las palabras sin tilde se corrigen, conservando mayusculas y sin tocar lo demas"   "Instalación RÁPIDA y batería nueva, más barata: cumplió 20 años. Slug: bateria-agm"   "select text from social_posts where id = 90002;"
$PSQL -v ON_ERROR_STOP=1 -q -f supabase/migrations/0049_content_accents.sql >/dev/null
check "ejecutarla otra vez no cambia nada" "Instalación RÁPIDA y batería nueva, más barata: cumplió 20 años. Slug: bateria-agm"   "select text from social_posts where id = 90002;"

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
check "no vende lo agotado" "ERROR:  Se agotó \"$NAME4\". Quítala del carrito para continuar." \
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
check "un envio sin direccion tambien" "ERROR:  Escribe la dirección de entrega." \
  "$(as_anon "select * from create_order('c@x.com', 'Cliente', ' ', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"
check "el telefono es obligatorio" "ERROR:  Escribe tu teléfono: lo usamos para coordinar la entrega." \
  "$(as_anon "select * from create_order('c@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_province => 'Santiago');")"
check "un retiro con la opcion de envio estandar no cuadra" \
  "ERROR:  La opción de envío no corresponde al tipo de entrega." \
  "$(as_anon "$(mk_order "$I5x1" transfer pickup standard)")"
check "ni un envio con la opcion de retiro" \
  "ERROR:  La opción de envío no corresponde al tipo de entrega." \
  "$(as_anon "$(mk_order "$I5x1" transfer shipping pickup)")"
check "un tipo de entrega inventado se rechaza" "ERROR:  Tipo de entrega no válido." \
  "$(as_anon "$(mk_order "$I5x1" transfer volando standard)")"
check "y uno nulo no cae en la rama de retiro" "ERROR:  Tipo de entrega no válido." \
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
check "la tarjeta ya no se acepta" "ERROR:  Método de pago no válido." \
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
check "un estado inventado se rechaza" "ERROR:  Estado no válido: volando." \
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
check "una tercera ya no: la franja esta llena" "ERROR:  Esa hora ya no está disponible. Elige otra." \
  "$(as_anon "$(book "$SLOT0" 'Cliente Tres' '849-555-0111')")"
check "y la franja llena deja de aparecer" "0" \
  "$(as_anon "select count(*) from available_slots(1, '$MONDAY') where slot_at = '$SLOT0';")"
check "una hora que ya paso se rechaza" "ERROR:  Esa hora ya no está disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select date_trunc('hour', now()) - interval '1 day';")" 'Cliente' '809-555-0134')")"
check "una hora que no es una franja (8:30) tambien" "ERROR:  Esa hora ya no está disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select '$SLOT0'::timestamptz + interval '30 minutes';")" 'Cliente' '809-555-0134')")"
check "un domingo no abre" "ERROR:  Esa hora ya no está disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select ('$SUNDAY 10:00')::timestamp at time zone 'America/Santo_Domingo';")" 'Cliente' '809-555-0134')")"
check "dentro de un cierre tampoco" "ERROR:  Esa hora ya no está disponible. Elige otra." \
  "$(as_anon "$(book "$(scalar "select ('$TUESDAY 08:00')::timestamp at time zone 'America/Santo_Domingo';")" 'Cliente' '809-555-0134')")"
check "un servicio que no se agenda se rechaza" "ERROR:  Esa hora ya no está disponible. Elige otra." \
  "$(as_anon "select * from book_appointment(99999, '$SLOT1', 'Cliente', '809-555-0134');")"
check "sin nombre no se agenda" "ERROR:  Escribe tu nombre." "$(as_anon "$(book "$SLOT1" ' ' '809-555-0134')")"
check "un telefono corto tampoco" "ERROR:  Escribe un teléfono válido: lo usamos para confirmar tu cita." \
  "$(as_anon "$(book "$SLOT1" 'Cliente' '12345')")"
check "un pedido que no existe se rechaza" "ERROR:  Ese pedido no existe." \
  "$(as_anon "$(book "$SLOT1" 'Cliente' '809-555-0134' ", p_order_id => '00000000-0000-0000-0000-000000000000'")")"

echo "   (tope por telefono)"
as_anon_book() { scalar "$(as_anon "select id from book_appointment(1, '$1', 'Cliente Uno', '809-555-0134');")" >/dev/null; }
as_anon_book "$SLOT1"; as_anon_book "$SLOT2"
check "con 3 citas abiertas, la cuarta se rechaza" \
  "ERROR:  Ya tienes 3 citas abiertas con este teléfono. Escríbenos por WhatsApp para cambiarlas." \
  "$(as_anon "$(book "$SLOT3" 'Cliente Uno' '(809) 555-0134')")"
check "el tope cuenta el telefono, no como lo escribieron" "3" \
  "select count(*) from service_appointments where right(regexp_replace(contact_phone, '\D', '', 'g'), 10) = '8095550134';"
check "ni con el codigo de pais por delante" \
  "ERROR:  Ya tienes 3 citas abiertas con este teléfono. Escríbenos por WhatsApp para cambiarlas." \
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
check "no se agenda con el vehiculo del garaje de otro" "ERROR:  Ese vehículo no es de tu garaje." \
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
check "un estado inventado se rechaza" "ERROR:  Estado no válido: volando." \
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
  "ERROR:  Solo se puede cancelar con más de 24 horas de anticipación. Escríbenos por WhatsApp." \
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
insert into hub_parts (id, name, brand, img_url, price, stock) values (99901, 'Pieza efimera', 'X', 'x.jpg', 100, 1);
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

echo "→ Cupones y descuentos (migracion 0022)"

echo "   (quien ve y quien escribe los cupones)"
check "anon no lee la tabla de cupones: nadie descarga los codigos" "ERROR:  permission denied for table coupons" \
  "$(as_anon 'select count(*) from coupons;')"
check "un usuario normal tampoco ve ninguno" "0" "$(as_user "$USER_A" 'select count(*) from coupons;')"
check "ni crea uno" 'ERROR:  new row violates row-level security policy for table "coupons"' \
  "$(as_user "$USER_A" "insert into coupons (code, discount_type, discount_value) values ('HACKEADO', 'percent', 99);")"
check "un admin crea los de la prueba" "10" "$(as_user "$ADMIN" "
  insert into coupons (code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, ends_at, max_uses, max_uses_per_customer, is_active) values
   ('PCT10',     '10 por ciento',          'percent',       10,   0,    null, null, null, null, null, true),
   ('PCT50CAP',  '50 con tope de 100',     'percent',       50,   0,    100,  null, null, null, null, true),
   ('FIJO500',   '500 desde 3000',         'fixed',         500,  3000, null, null, null, null, null, true),
   ('FIJO9999',  'fijo enorme',            'fixed',         9999, 0,    null, null, null, null, null, true),
   ('ENVIOFREE', 'envio gratis',           'free_shipping', null, 0,    null, null, null, null, null, true),
   ('UNICO',     'un solo uso',            'percent',       10,   0,    null, null, null, 1,    null, true),
   ('UNAVEZ',    'una vez por cliente',    'percent',       10,   0,    null, null, null, null, 1,    true),
   ('VENCIDO',   'ya vencio',              'percent',       10,   0,    null, null, now() - interval '1 day', null, null, true),
   ('FUTURO',    'todavia no empieza',     'percent',       10,   0,    null, now() + interval '1 day', null, null, null, true),
   ('MINALTO',   'minimo inalcanzable',    'fixed',         100,  1000000, null, null, null, null, null, true);
  insert into coupons (code, discount_type, discount_value, is_active) values ('APAGADO', 'percent', 10, false);
  select count(*) from coupons where code <> 'APAGADO';")"
check "un admin los lee todos" "11" "$(as_user "$ADMIN" 'select count(*) from coupons;')"

echo "   (la forma de un cupon la exige la base)"
check "el codigo va en mayusculas" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_code_check"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value) values ('minuscula', 'percent', 10);")"
check "y con al menos 4 caracteres" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_code_check"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value) values ('AB', 'percent', 10);")"
check "el codigo no se repite" 'ERROR:  duplicate key value violates unique constraint "coupons_code_key"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value) values ('PCT10', 'percent', 5);")"
check "un porcentaje de mas de 100 se rechaza" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_value_matches_type"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value) values ('MASDE100', 'percent', 101);")"
check "el envio gratis no lleva monto" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_value_matches_type"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value) values ('ENVIO2', 'free_shipping', 100);")"
check "un monto fijo necesita monto" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_value_matches_type"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type) values ('SINMONTO', 'fixed');")"
check "no puede vencer antes de empezar" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_dates_in_order"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value, starts_at, ends_at) values ('FECHAS', 'percent', 10, now() + interval '2 days', now() + interval '1 day');")"
check "el minimo de compra no es negativo" 'ERROR:  new row for relation "coupons" violates check constraint "coupons_min_subtotal_check"' \
  "$(as_user "$ADMIN" "insert into coupons (code, discount_type, discount_value, min_subtotal) values ('NEGATIVO', 'percent', 10, -1);")"

echo "   (validate_coupon: lo puede llamar un invitado, y solo calcula)"
vc() { echo "select discount_amount from validate_coupon('$1', $2, ${3:-0}${4:-});"; }
check "10 por ciento de 1000 son 100" "100.00" "$(as_anon "$(vc PCT10 1000 450)")"
check "el codigo se acepta en minusculas y con espacios" "100.00" "$(as_anon "$(vc ' pct10 ' 1000 450)")"
check "un porcentaje respeta su tope: 50% de 1000 es 100, no 500" "100.00" "$(as_anon "$(vc PCT50CAP 1000)")"
check "y sin llegar al tope descuenta lo que toca" "50.00" "$(as_anon "$(vc PCT50CAP 100)")"
check "un monto fijo descuenta el monto" "500.00" "$(as_anon "$(vc FIJO500 5000)")"
check "y respeta la compra minima, diciendo cuanto falta pedir" "ERROR:  Este cupón pide una compra de al menos RD$ 3,000." \
  "$(as_anon "$(vc FIJO500 2000)")"
check "un monto fijo nunca pasa del subtotal: el total no queda en negativo" "1000.00" "$(as_anon "$(vc FIJO9999 1000)")"
check "el envio gratis descuenta el envio" "450.00" "$(as_anon "$(vc ENVIOFREE 1000 450)")"
check "pero si el envio ya es gratis (un retiro) no aplica" "ERROR:  Este cupón no aplica a tu pedido." \
  "$(as_anon "$(vc ENVIOFREE 1000 0)")"
check "uno vencido" "ERROR:  Ese cupón no existe o ya no está disponible." "$(as_anon "$(vc VENCIDO 1000)")"
check "uno que todavia no empieza dice lo mismo" "ERROR:  Ese cupón no existe o ya no está disponible." "$(as_anon "$(vc FUTURO 1000)")"
check "uno apagado tambien" "ERROR:  Ese cupón no existe o ya no está disponible." "$(as_anon "$(vc APAGADO 1000)")"
check "y uno que no existe: nadie aprende cuales existen" "ERROR:  Ese cupón no existe o ya no está disponible." "$(as_anon "$(vc NOEXISTE 1000)")"
check "sin codigo se pide el codigo" "ERROR:  Escribe el código del cupón." "$(as_anon "$(vc '   ' 1000)")"
check "un subtotal negativo se rechaza" "ERROR:  El subtotal no es válido." "$(as_anon "$(vc PCT10 -5)")"
check "validar no gasta un uso: UNICO sigue disponible tras validarlo dos veces" "100.00" \
  "$(as_anon "$(vc UNICO 1000)")"

echo "   (create_order: el descuento lo calcula Postgres y queda en el pedido)"
# Todos con la pieza 5 (hay stock de sobra). Devuelve: descuento correcto | codigo guardado | el total cuadra.
corder() {
  echo "select (discount = round(subtotal * $4 / 100, 2))::text || '|' || coalesce(coupon_code, '-') || '|' || (total = subtotal + shipping_price - discount)::text from create_order('$1', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_coupon_code => '$2');"
}
check "un pedido con PCT10: descuenta el 10% del subtotal, guarda el codigo y el total cuadra" "true|PCT10|true" \
  "$(as_anon "$(corder invitado@x.com PCT10 x 10)")"
check "el codigo en minusculas se guarda en mayusculas" "true|PCT10|true" \
  "$(as_anon "$(corder invitado@x.com ' pct10' x 10)")"
check "un codigo en blanco es 'sin cupon': descuento 0" "true|-|true" \
  "$(as_anon "$(corder invitado@x.com '' x 0)")"
STOCK5_BEFORE="$(scalar 'select stock from hub_parts where id = 5;')"
check "un codigo que no existe rechaza el pedido entero" "ERROR:  Ese cupón no existe o ya no está disponible." \
  "$(as_anon "$(corder invitado@x.com NOEXISTE x 0)")"
check "y no descuenta stock" "$STOCK5_BEFORE" "select stock from hub_parts where id = 5;"
check "la compra minima tambien se exige al crear el pedido" "ERROR:  Este cupón pide una compra de al menos RD$ 1,000,000." \
  "$(as_anon "$(corder invitado@x.com MINALTO x 0)")"
check "un monto enorme deja el total en el envio, nunca en negativo" "t" \
  "$(as_anon "select (discount = subtotal and total = shipping_price and total >= 0) from create_order('invitado@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_coupon_code => 'FIJO9999');")"
check "el envio gratis deja el total en el subtotal" "t" \
  "$(as_anon "select (discount = shipping_price and total = subtotal) from create_order('invitado@x.com', 'Cliente', 'Calle 1', 'express', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_coupon_code => 'ENVIOFREE');")"
check "un retiro con envio gratis no aplica" "ERROR:  Este cupón no aplica a tu pedido." \
  "$(as_anon "select * from create_order('invitado@x.com', 'Cliente', '', 'pickup', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_fulfillment_type => 'pickup', p_coupon_code => 'ENVIOFREE');")"
check "un cupon vencido no pasa al crear el pedido" "ERROR:  Ese cupón no existe o ya no está disponible." \
  "$(as_anon "$(corder invitado@x.com VENCIDO x 0)")"

echo "   (cuantas veces se puede usar)"
ORD_UNICO="$(scalar "$(as_anon "select id from create_order('u1@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_coupon_code => 'UNICO');")")"
check "UNICO se usa una vez" "UNICO" "select coupon_code from orders where id = '$ORD_UNICO';"
check "la segunda vez ya se agoto" "ERROR:  Este cupón ya se agotó." "$(as_anon "$(corder u2@x.com UNICO x 10)")"
check "y validarlo tambien lo dice" "ERROR:  Este cupón ya se agotó." "$(as_anon "$(vc UNICO 1000)")"
check "cancelar el pedido devuelve el uso" "cancelled" \
  "$(as_user "$ADMIN" "select status from set_order_status('$ORD_UNICO', 'cancelled');")"
check "y entonces otro cliente lo puede usar" "true|UNICO|true" "$(as_anon "$(corder u2@x.com UNICO x 10)")"
ORD_UNAVEZ="$(scalar "$(as_user "$USER_A" "select id from create_order('a@x.com', 'Usuario A', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550001', p_province => 'Santiago', p_coupon_code => 'UNAVEZ');")")"
check "UNAVEZ queda a nombre de su dueño" "$USER_A" "select user_id from orders where id = '$ORD_UNAVEZ';"
check "el mismo cliente no lo repite" "ERROR:  Ya usaste este cupón." \
  "$(as_user "$USER_A" "$(corder a@x.com UNAVEZ x 10)")"
check "ni validandolo (la sesion lo identifica)" "ERROR:  Ya usaste este cupón." "$(as_user "$USER_A" "$(vc UNAVEZ 1000)")"
check "otra persona si" "true|UNAVEZ|true" "$(as_user "$USER_B" "$(corder b@x.com UNAVEZ x 10)")"
check "un invitado con el mismo correo que ya lo uso, tampoco" "ERROR:  Ya usaste este cupón." \
  "$(as_anon "$(corder A@X.com UNAVEZ x 10)")"
check "y uno con otro correo si" "true|UNAVEZ|true" "$(as_anon "$(corder otro@x.com UNAVEZ x 10)")"

echo "   (el pedido lo cuenta y el cupon se puede borrar)"
# Los ids se resuelven por encima de RLS: anon no lee `orders`, y lo que se prueba es get_order().
ORD_PCT="$(scalar "select id from orders where coupon_code = 'PCT10' order by created_at limit 1;")"
ORD_SIN="$(scalar "select id from orders where coupon_code is null order by created_at limit 1;")"
UNAVEZ_ID="$(scalar "select id from coupons where code = 'UNAVEZ';")"
check "get_order dice el descuento y el cupon" "true|PCT10" \
  "$(as_anon "select ((get_order('$ORD_PCT')->>'discount')::numeric > 0)::text || '|' || (get_order('$ORD_PCT')->>'coupon_code');")"
check "un pedido sin cupon dice descuento 0 y cupon nulo" "0.00|" \
  "$(as_anon "select (get_order('$ORD_SIN')->>'discount') || '|' || coalesce(get_order('$ORD_SIN')->>'coupon_code', '');")"
check "admin_coupon_usage cuenta los usos que no estan cancelados" "2" \
  "$(as_user "$ADMIN" "select uses from admin_coupon_usage() where coupon_id = (select id from coupons where code = 'PCT10');")"
check "anon no invoca admin_coupon_usage" "$(denied admin_coupon_usage)" "$(as_anon 'select * from admin_coupon_usage();')"
check "un cliente solo ve el uso de lo suyo" "1" \
  "$(as_user "$USER_A" "select uses from admin_coupon_usage() where coupon_id = $UNAVEZ_ID;")"
check "borrar un cupon no borra el pedido ni el codigo que quedo anotado" "UNAVEZ|true" \
  "$(as_user "$ADMIN" "delete from coupons where code = 'UNAVEZ'; select o.coupon_code || '|' || (o.coupon_id is null)::text from orders o where o.id = '$ORD_UNAVEZ';")"

echo "   (las puertas: una sola create_order, y la regla interna no se llama a mano)"
check "queda una sola create_order (dos firmas harian PGRST203)" "1" \
  "select count(*) from pg_proc where proname = 'create_order';"
check "anon no invoca coupon_check" "$(denied coupon_check)" "$(as_anon "select * from coupon_check('PCT10', 1000, 0, null, null, false);")"
check "ni un usuario" "$(denied coupon_check)" "$(as_user "$USER_A" "select * from coupon_check('PCT10', 1000, 0, null, null, false);")"
check "anon si valida y si crea pedidos (el checkout de invitado)" "true|true" \
  "select has_function_privilege('anon', 'public.validate_coupon(text,numeric,numeric,text)', 'execute')::text || '|' || has_function_privilege('anon', 'public.create_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,boolean,text)', 'execute')::text;"

echo "→ Variantes de producto (migracion 0023)"

# Un producto efimero con tres opciones; lo creo por encima de RLS y las opciones como admin.
$PSQL -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_parts (id, name, brand, img_url, price, stock, installable) values
  (99911, 'Alfombra con opciones', 'X', 'x.jpg', 1000, 7, false),
  (99912, 'Otro producto',         'X', 'x.jpg', 500,  4, false);
SQL

echo "   (quien ve y quien escribe las opciones)"
check "un admin crea las opciones" "3" "$(as_user "$ADMIN" "
  insert into product_variants (product_id, name, stock, sort_order) values
    (99911, 'Negro', 3, 1), (99911, 'Gris', 2, 2), (99911, 'Beige', 0, 3);
  select count(*) from product_variants where product_id = 99911;")"
check "anon no inserta opciones" 'ERROR:  permission denied for table product_variants' \
  "$(as_anon "insert into product_variants (product_id, name, stock) values (99911, 'Hack', 1);")"
check "un usuario normal tampoco" 'ERROR:  new row violates row-level security policy for table "product_variants"' \
  "$(as_user "$USER_A" "insert into product_variants (product_id, name, stock) values (99911, 'Hack', 1);")"
check "anon lee las opciones activas" "3" "$(as_anon 'select count(*) from product_variants where product_id = 99911;')"
check "un usuario no cambia el stock de una opcion (0 filas)" "0" \
  "$(as_user "$USER_A" "with u as (update product_variants set stock = 999 where name = 'Negro' and product_id = 99911 returning 1) select count(*) from u;")"

echo "   (la forma de una opcion la exige la base)"
check "el nombre no se repite en un producto (sin importar mayusculas)" 'ERROR:  duplicate key value violates unique constraint "product_variants_name_key"' \
  "$(as_user "$ADMIN" "insert into product_variants (product_id, name) values (99911, 'NEGRO');")"
check "pero si en otro producto" "1" \
  "$(as_user "$ADMIN" "insert into product_variants (product_id, name, stock) values (99912, 'Negro', 4); select count(*) from product_variants where product_id = 99912;")"
check "sin espacios a los lados" 'ERROR:  new row for relation "product_variants" violates check constraint "product_variants_name_check"' \
  "$(as_user "$ADMIN" "insert into product_variants (product_id, name) values (99911, ' Rojo ');")"
check "el stock no es negativo" 'ERROR:  new row for relation "product_variants" violates check constraint "product_variants_stock_check"' \
  "$(as_user "$ADMIN" "insert into product_variants (product_id, name, stock) values (99911, 'Rojo', -1);")"
check "el sku no se repite" 'ERROR:  duplicate key value violates unique constraint "product_variants_sku_key"' \
  "$(as_user "$ADMIN" "insert into product_variants (product_id, name, sku) values (99911, 'Azul', 'SKU-A'), (99911, 'Verde', 'SKU-A');")"

echo "   (el stock del producto es la suma de sus opciones activas)"
check "el producto pasa a tener opciones y su stock es la suma (3+2+0)" "true|5" \
  "select has_variants::text || '|' || stock from hub_parts where id = 99911;"
check "un producto con otra opcion no se mezcla" "true|4" \
  "select has_variants::text || '|' || stock from hub_parts where id = 99912;"
check "apagar una opcion la saca de la suma" "true|3" \
  "$(as_user "$ADMIN" "update product_variants set is_active = false where product_id = 99911 and name = 'Gris'; select has_variants::text || '|' || stock from hub_parts where id = 99911;")"
check "anon ya no ve la apagada" "2" "$(as_anon 'select count(*) from product_variants where product_id = 99911;')"
check "un admin si" "3" "$(as_user "$ADMIN" 'select count(*) from product_variants where product_id = 99911;')"
check "volver a encenderla la suma otra vez" "5" \
  "$(as_user "$ADMIN" "update product_variants set is_active = true where product_id = 99911 and name = 'Gris'; select stock from hub_parts where id = 99911;")"
check "mover una opcion de producto recalcula los dos (Gris 2 se va: 3 y 6)" "3|6" \
  "$(as_user "$ADMIN" "update product_variants set product_id = 99912 where product_id = 99911 and name = 'Gris'; select (select stock from hub_parts where id = 99911) || '|' || (select stock from hub_parts where id = 99912);")"
check "y al devolverla vuelven a 5 y 4" "5|4" \
  "$(as_user "$ADMIN" "update product_variants set product_id = 99911 where name = 'Gris' and product_id = 99912; select (select stock from hub_parts where id = 99911) || '|' || (select stock from hub_parts where id = 99912);")"

echo "   (create_order con opciones)"
VAR_NEGRO="$(scalar "select id from product_variants where product_id = 99911 and name = 'Negro';")"
VAR_GRIS="$(scalar "select id from product_variants where product_id = 99911 and name = 'Gris';")"
VAR_BEIGE="$(scalar "select id from product_variants where product_id = 99911 and name = 'Beige';")"
VAR_OTRO="$(scalar "select id from product_variants where product_id = 99912 and name = 'Negro';")"
vorder() { echo "select * from create_order('v@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');"; }
check "sin elegir opcion se rechaza, diciendo cual producto" 'ERROR:  Elige una opción de "Alfombra con opciones" antes de comprarlo.' \
  "$(as_anon "$(vorder '[{"part_id": 99911, "quantity": 1}]')")"
check "una opcion de otro producto se rechaza" 'ERROR:  La opción elegida de "Alfombra con opciones" ya no está disponible.' \
  "$(as_anon "$(vorder "[{\"part_id\": 99911, \"quantity\": 1, \"variant_id\": $VAR_OTRO}]")")"
check "una opcion inexistente tambien" 'ERROR:  La opción elegida de "Alfombra con opciones" ya no está disponible.' \
  "$(as_anon "$(vorder '[{"part_id": 99911, "quantity": 1, "variant_id": 987654}]')")"
P5NAME="$(scalar 'select name from hub_parts where id = 5;')"
check "un producto sin opciones no acepta ninguna" "ERROR:  La opción elegida de \"$P5NAME\" ya no está disponible." \
  "$(as_anon "$(vorder "[{\"part_id\": 5, \"quantity\": 1, \"variant_id\": $VAR_NEGRO}]")")"
check "pedir mas de lo que tiene la opcion" 'ERROR:  De "Alfombra con opciones (Negro)" solo quedan 3 y pediste 4. Ajusta la cantidad.' \
  "$(as_anon "$(vorder "[{\"part_id\": 99911, \"quantity\": 4, \"variant_id\": $VAR_NEGRO}]")")"
check "una opcion agotada se dice por su nombre" 'ERROR:  Se agotó "Alfombra con opciones (Beige)". Quítala del carrito para continuar.' \
  "$(as_anon "$(vorder "[{\"part_id\": 99911, \"quantity\": 1, \"variant_id\": $VAR_BEIGE}]")")"
check "el stock se suma si la misma opcion viene dos veces" 'ERROR:  De "Alfombra con opciones (Negro)" solo quedan 3 y pediste 4. Ajusta la cantidad.' \
  "$(as_anon "$(vorder "[{\"part_id\": 99911, \"quantity\": 2, \"variant_id\": $VAR_NEGRO}, {\"part_id\": 99911, \"quantity\": 2, \"variant_id\": $VAR_NEGRO}]")")"
check "los rechazos no descuentan nada" "3|5" \
  "select (select stock from product_variants where id = $VAR_NEGRO) || '|' || (select stock from hub_parts where id = 99911);"

ORD_VAR="$(scalar "$(as_anon "select id from create_order('v@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 99911, \"quantity\": 2, \"variant_id\": $VAR_NEGRO}, {\"part_id\": 99911, \"quantity\": 1, \"variant_id\": $VAR_GRIS}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")")"
check "un pedido con dos opciones: el stock baja en cada una" "1|1" \
  "select (select stock from product_variants where id = $VAR_NEGRO) || '|' || (select stock from product_variants where id = $VAR_GRIS);"
check "y el del producto es la suma de lo que queda (1+1+0)" "2" "select stock from hub_parts where id = 99911;"
check "las lineas guardan la opcion y el nombre congelado 'Producto · Opcion'" "Alfombra con opciones · Gris,Alfombra con opciones · Negro" \
  "select string_agg(name, ',' order by name) from order_items where order_id = '$ORD_VAR';"
check "el precio es el del producto" "3000.00" "select subtotal from orders where id = '$ORD_VAR';"
check "cada linea guarda variant_id y lo descontado" "2|1" \
  "select (select stock_deducted from order_items where order_id = '$ORD_VAR' and variant_id = $VAR_NEGRO) || '|' || (select stock_deducted from order_items where order_id = '$ORD_VAR' and variant_id = $VAR_GRIS);"

echo "   (cancelar devuelve el stock a la opcion)"
check "cancelar el pedido" "cancelled" "$(as_user "$ADMIN" "select status from set_order_status('$ORD_VAR', 'cancelled');")"
check "las opciones recuperan lo suyo" "3|2" \
  "select (select stock from product_variants where id = $VAR_NEGRO) || '|' || (select stock from product_variants where id = $VAR_GRIS);"
check "y el producto vuelve a la suma" "5" "select stock from hub_parts where id = 99911;"
P5_BEFORE="$(scalar 'select stock from hub_parts where id = 5;')"
ORD_P5="$(scalar "$(as_anon "select id from create_order('v@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '$I5x1'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")")"
check "una pieza sin opciones sigue descontandose del producto" "$((P5_BEFORE - 1))" "select stock from hub_parts where id = 5;"
check "y al cancelar se devuelve al producto" "$P5_BEFORE" \
  "$(as_user "$ADMIN" "select status from set_order_status('$ORD_P5', 'cancelled'); select stock from hub_parts where id = 5;")"

echo "   (una opcion con pedidos no se borra; sin pedidos si)"
ORD_VAR2="$(scalar "$(as_anon "select id from create_order('v2@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 99911, \"quantity\": 1, \"variant_id\": $VAR_NEGRO}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")")"
check "borrar una opcion con pedidos se rechaza" 'ERROR:  update or delete on table "product_variants" violates foreign key constraint "order_items_variant_id_fkey" on table "order_items"' \
  "$(as_user "$ADMIN" "delete from product_variants where id = $VAR_NEGRO;")"
check "borrar una sin pedidos si, y el producto sigue sumando (Negro 2 + Gris 2 = 4)" "4" \
  "$(as_user "$ADMIN" "delete from product_variants where id = $VAR_BEIGE; select stock from hub_parts where id = 99911;")"
check "sin ninguna opcion activa deja de tener opciones y conserva el stock (se recalcula por sentencia, no fila a fila)" "false|4" \
  "$(as_user "$ADMIN" "update product_variants set is_active = false where product_id = 99911; select has_variants::text || '|' || stock from hub_parts where id = 99911;")"
check "apagadas todas, un pedido ya no pide opcion" "1" \
  "$(as_anon "select count(*) from create_order('v3@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 99911, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"
check "borrar un producto con pedidos de opciones se rechaza (la opcion lo impide)" 'ERROR:  update or delete on table "product_variants" violates foreign key constraint "order_items_variant_id_fkey" on table "order_items"' \
  "$(as_user "$ADMIN" "delete from hub_parts where id = 99911;")"

echo "   (search_products devuelve has_variants y variant_label)"
check "un producto con opciones lo dice" "true|Color" \
  "$(as_user "$ADMIN" "update product_variants set is_active = true where id = $VAR_NEGRO; update hub_parts set variant_label = 'Color' where id = 99911; select has_variants::text || '|' || variant_label from search_products(p_query => 'Alfombra con opciones');")"
check "y uno sin opciones, no" "false|" \
  "$(as_anon "select has_variants::text || '|' || variant_label from search_products(p_query => '$P5NAME') where id = 5;")"
check "el filtro 'solo en stock' usa la suma de las opciones" "1" \
  "$(as_anon "select count(*) from search_products(p_query => 'Alfombra con opciones', p_in_stock_only => true);")"
check "las columnas nuevas no son un hueco: la etiqueta se acota a 30" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_variant_label_check"' \
  "$(as_user "$ADMIN" "update hub_parts set variant_label = repeat('x', 31) where id = 99911;")"

echo "   (las puertas)"
check "queda una sola create_order" "1" "select count(*) from pg_proc where proname = 'create_order';"
check "queda una sola search_products" "1" "select count(*) from pg_proc where proname = 'search_products';"
check "anon no invoca el trigger de sincronizacion" "$(denied product_variants_sync)" "$(as_anon 'select product_variants_sync();')"
check "ni un usuario" "$(denied product_variants_sync)" "$(as_user "$USER_A" 'select product_variants_sync();')"
check "anon sigue pudiendo crear pedidos y buscar" "true|true" \
  "select has_function_privilege('anon', 'public.create_order(text,text,text,text,text,jsonb,text,text,text,text,text,text,boolean,text)', 'execute')::text || '|' || has_function_privilege('anon', 'public.search_products(text,text,bigint,bigint,integer,numeric,numeric,boolean,text,integer,integer)', 'execute')::text;"
check "anon no invoca set_order_status" "$(denied set_order_status)" "$(as_anon "select * from set_order_status('$ORD_VAR', 'paid');")"

echo "→ Notificaciones push (migracion 0024)"

# Una suscripcion de mentira con el largo de las de verdad (p256dh de 87 caracteres, auth de 22).
PUSH_P256DH="$(printf 'B%.0s' $(seq 1 87))"
PUSH_AUTH="$(printf 'a%.0s' $(seq 1 22))"
reg() { echo "select register_push_subscription('$1', '$PUSH_P256DH', '$PUSH_AUTH', '${2:-test}');"; }

echo "   (quien guarda y quien ve)"
check "anon no puede guardar un dispositivo" "$(denied register_push_subscription)" "$(as_anon "$(reg https://fcm.googleapis.com/fcm/send/a)")"
check "anon ni siquiera lee la tabla" "ERROR:  permission denied for table push_subscriptions" \
  "$(as_anon 'select count(*) from push_subscriptions;')"
check "un usuario guarda su dispositivo" "1" \
  "$(as_user "$USER_A" "$(reg https://fcm.googleapis.com/fcm/send/a)") select count(*) from push_subscriptions;"
check "no inserta directo en la tabla (no hay permiso)" "ERROR:  permission denied for table push_subscriptions" \
  "$(as_user "$USER_A" "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('$USER_A', 'https://fcm.googleapis.com/fcm/send/x', '$PUSH_P256DH', '$PUSH_AUTH');")"
check "ni actualiza (no hay permiso)" "ERROR:  permission denied for table push_subscriptions" \
  "$(as_user "$USER_A" "update push_subscriptions set user_agent = 'x';")"
check "otro usuario no ve los dispositivos ajenos" "0" "$(as_user "$USER_B" 'select count(*) from push_subscriptions;')"
check "ni un admin los lee con la clave del navegador (los lee la funcion con service_role)" "0" \
  "$(as_user "$ADMIN" 'select count(*) from push_subscriptions;')"

echo "   (un dispositivo, una cuenta)"
check "si otra cuenta registra el mismo dispositivo, se lo queda" "0|1" \
  "$(as_user "$USER_B" "$(reg https://fcm.googleapis.com/fcm/send/a)") select (select count(*) from push_subscriptions where user_id = '$USER_A') || '|' || (select count(*) from push_subscriptions where user_id = '$USER_B');"
check "registrar dos veces el mismo no duplica" "1" \
  "$(as_user "$USER_B" "$(reg https://fcm.googleapis.com/fcm/send/a)") select count(*) from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/a';"
check "el tope es de 10 dispositivos por cuenta, y se quedan los mas recientes" "10|true" \
  "$(as_user "$USER_A" "$(for n in $(seq 1 12); do reg https://fcm.googleapis.com/fcm/send/m$n; done)") select count(*) || '|' || bool_and(endpoint <> 'https://fcm.googleapis.com/fcm/send/m1' and endpoint <> 'https://fcm.googleapis.com/fcm/send/m2') from push_subscriptions where user_id = '$USER_A';"

echo "   (desactivar los avisos)"
check "cada quien borra los suyos" "9" \
  "$(as_user "$USER_A" "delete from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/m3'; select count(*) from push_subscriptions;")"
check "y no los ajenos (0 filas)" "0" \
  "$(as_user "$USER_A" "with d as (delete from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/a' returning 1) select count(*) from d;")"

echo "   (la forma de una suscripcion la exige la base)"
check "el endpoint tiene que ser https (desde la 0037 lo rechaza primero is_push_endpoint; el check de la tabla queda como segunda barrera)" 'ERROR:  Este navegador no usa un servicio de avisos compatible.' \
  "$(as_user "$USER_A" "$(reg http://push.example/inseguro)")"
check "las claves no pueden venir vacias o cortas" 'ERROR:  new row for relation "push_subscriptions" violates check constraint "push_subscriptions_p256dh_check"' \
  "$(as_user "$USER_A" "select register_push_subscription('https://fcm.googleapis.com/fcm/send/corta', 'abc', '$PUSH_AUTH');")"
check "borrar la cuenta borra sus dispositivos" "0" \
  "insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'tmp@x.com'); $(as_user 99999999-9999-9999-9999-999999999999 "$(reg https://fcm.googleapis.com/fcm/send/tmp)") reset role; delete from profiles where id = '99999999-9999-9999-9999-999999999999'; select count(*) from push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/tmp';"
check "la funcion no la invoca anon, y si un usuario con sesion" "false|true" \
  "select has_function_privilege('anon', 'public.register_push_subscription(text,text,text,text)', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.register_push_subscription(text,text,text,text)', 'execute')::text;"

echo "→ Foto por opcion (migracion 0025)"
check "una opcion nace sin foto" "t" \
  "select (image_url is null) from product_variants limit 1;"
check "un admin le pone una foto" "assets/imgs/hub-parts/a.jpg" \
  "$(as_user "$ADMIN" "update product_variants set image_url = 'assets/imgs/hub-parts/a.jpg' where id = $VAR_NEGRO returning image_url;")"
check "la foto no cambia el stock del producto ni de la opcion (el trigger sigue sumando)" "t" \
  "select (stock = (select coalesce(sum(v.stock), 0) from product_variants v where v.product_id = hub_parts.id and v.is_active)) from hub_parts where id = 99911;"
check "anon la lee con el resto de la opcion" "assets/imgs/hub-parts/a.jpg" \
  "$(as_anon "select image_url from product_variants where id = $VAR_NEGRO;")"
check "un usuario normal no la cambia (0 filas)" "0" \
  "$(as_user "$USER_A" "with u as (update product_variants set image_url = 'x' where id = $VAR_NEGRO returning 1) select count(*) from u;")"
check "una foto vacia no vale: es nula o es una URL" 'ERROR:  new row for relation "product_variants" violates check constraint "product_variants_image_url_check"' \
  "$(as_user "$ADMIN" "update product_variants set image_url = '' where id = $VAR_NEGRO;")"
check "ni una de mas de 2048 caracteres" 'ERROR:  new row for relation "product_variants" violates check constraint "product_variants_image_url_check"' \
  "$(as_user "$ADMIN" "update product_variants set image_url = repeat('x', 2049) where id = $VAR_NEGRO;")"
check "quitarla la deja nula" "t" \
  "$(as_user "$ADMIN" "update product_variants set image_url = null where id = $VAR_NEGRO returning (image_url is null);")"

echo "→ Republicar el sitio cuando cambia el catalogo (migracion 0026)"
RB_RESET="update site_rebuild set dirty_since = null, last_change_at = null, last_fired_at = null, fired_count = 0;"
RB_DIRTY="select (dirty_since is not null)::text from site_rebuild;"
# Lo que se ve en las paginas prerenderizadas marca el sitio como pendiente; lo que cambia con cada
# compra (stock, ventas) no.
check "hay una sola fila de estado" "1" "select count(*) from site_rebuild;"
$PSQL -d postgres -c "$RB_RESET" >/dev/null
check "una compra (stock y ventas) no marca nada" "false" \
  "$(as_anon "select discount from create_order('v@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 1, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');") reset role; $RB_DIRTY"
check "cambiar el stock sin cruzar el cero no marca nada" "false" \
  "update hub_parts set stock = 20 where id = 1; $RB_RESET update hub_parts set stock = 21, sold_count = sold_count + 1 where id = 1; $RB_DIRTY"
check "cambiar el precio si marca" "true" \
  "$RB_RESET update hub_parts set price = price + 1 where id = 1; $RB_DIRTY"
check "agotar una pieza (cruzar el cero) si marca" "true" \
  "$RB_RESET update hub_parts set stock = 0 where id = 1; $RB_DIRTY"
check "y volver a tener stock tambien" "true" \
  "$RB_RESET update hub_parts set stock = 5 where id = 1; $RB_DIRTY"
check "el stock de una opcion sin cruzar el cero no marca nada (ni el que suma al producto)" "false" \
  "update product_variants set stock = 50 where id = $VAR_NEGRO; $RB_RESET update product_variants set stock = 51 where id = $VAR_NEGRO; $RB_DIRTY"
check "la foto de una opcion si marca" "true" \
  "$RB_RESET update product_variants set image_url = 'assets/imgs/x.jpg' where id = $VAR_NEGRO; $RB_DIRTY"
check "un servicio nuevo o editado marca" "true" \
  "$RB_RESET update services set title = title || ' ' where id = (select min(id) from services); $RB_DIRTY"
check "una categoria marca" "true" \
  "$RB_RESET update product_categories set name = name || ' ' where id = (select min(id) from product_categories); $RB_DIRTY"
check "un ajuste del sitio marca" "true" \
  "insert into site_settings (key, value) values ('tmp_rebuild', '\"a\"'); $RB_RESET update site_settings set value = '\"b\"' where key = 'tmp_rebuild'; $RB_DIRTY"
check "pero tocar solo su marca de tiempo no" "false" \
  "$RB_RESET update site_settings set updated_at = now() where key = 'tmp_rebuild'; $RB_DIRTY; delete from site_settings where key = 'tmp_rebuild';"
check "borrar una fila tambien marca" "true" \
  "$RB_RESET insert into product_categories (slug, name) values ('tmp-rebuild', 'Temporal'); $RB_RESET delete from product_categories where slug = 'tmp-rebuild'; $RB_DIRTY"
check "marcar no pisa el primer cambio: dirty_since se queda" "true" \
  "$RB_RESET update site_rebuild set dirty_since = now() - interval '2 minutes'; update hub_parts set price = price where id = 1; update hub_parts set price = price + 1 where id = 1; select (dirty_since < now() - interval '1 minute' and last_change_at > now() - interval '1 minute')::text from site_rebuild;"

# fire_site_rebuild(): cuando toca, y que pasa sin enlace.
check "sin cambios, no hay nada que publicar" "nada que publicar" \
  "$RB_RESET select public.fire_site_rebuild();"
check "con cambios recien hechos espera a que el panel se calle" "esperando a que terminen los cambios" \
  "$RB_RESET update site_rebuild set dirty_since = now() - interval '1 minute', last_change_at = now() - interval '30 seconds'; select public.fire_site_rebuild();"
check "pasado el silencio pero sin enlace en el Vault, no hace nada" "sin enlace de despliegue en el Vault" \
  "$RB_RESET update site_rebuild set dirty_since = now() - interval '10 minutes', last_change_at = now() - interval '4 minutes'; select public.fire_site_rebuild();"
check "y lo pendiente sigue anotado (no se pierde)" "true|0" \
  "select (dirty_since is not null)::text || '|' || (select count(*) from net.calls) from site_rebuild;"
check "con el enlace cargado, pide el despliegue" "despliegue pedido" \
  "insert into vault.decrypted_secrets (name, decrypted_secret) values ('vercel_deploy_hook', 'https://hook.example/deploy/abc'); select public.fire_site_rebuild();"
check "llamo una vez, a ese enlace" "1|https://hook.example/deploy/abc" \
  "select count(*) || '|' || min(url) from net.calls;"
check "y deja el estado limpio, con el despliegue contado" "true|1" \
  "select (dirty_since is null and last_fired_at is not null)::text || '|' || fired_count from site_rebuild;"
check "otro cambio enseguida no despliega otra vez (minimo 10 minutos entre uno y otro)" "muy pronto despues del ultimo despliegue" \
  "update site_rebuild set dirty_since = now() - interval '10 minutes', last_change_at = now() - interval '4 minutes'; select public.fire_site_rebuild();"
check "no hubo una segunda llamada" "1" "select count(*) from net.calls;"
check "pasados los 10 minutos, si" "despliegue pedido" \
  "update site_rebuild set last_fired_at = now() - interval '11 minutes'; select public.fire_site_rebuild();"
check "si el panel no se calla nunca, a los 30 minutos se despliega igual" "despliegue pedido" \
  "update site_rebuild set dirty_since = now() - interval '31 minutes', last_change_at = now(), last_fired_at = now() - interval '11 minutes'; select public.fire_site_rebuild();"
check "tres llamadas en total" "3" "select count(*) from net.calls;"
check "el enlace no queda en ninguna tabla del esquema public" "0" \
  "select count(*) from site_rebuild t where t::text like '%hook.example%';"

# El cron y los permisos.
check "el trabajo de cron esta programado, una sola vez, cada 5 minutos" "1|*/5 * * * *" \
  "select count(*) || '|' || min(schedule) from cron.job where jobname = 'site-rebuild' and command like '%fire_site_rebuild%';"
check "anon no lee el estado" 'ERROR:  permission denied for table site_rebuild' \
  "$(as_anon 'select count(*) from site_rebuild;')"
check "ni un usuario con sesion" 'ERROR:  permission denied for table site_rebuild' \
  "$(as_user "$ADMIN" 'select count(*) from site_rebuild;')"
check "ni un admin escribe en el: el estado lo llevan el trigger y el cron" 'ERROR:  permission denied for table site_rebuild' \
  "$(as_user "$ADMIN" 'update site_rebuild set dirty_since = null;')"
check "anon no pide un despliegue" "$(denied fire_site_rebuild)" \
  "$(as_anon 'select public.fire_site_rebuild();')"
check "un admin tampoco: es del cron" "$(denied fire_site_rebuild)" \
  "$(as_user "$ADMIN" 'select public.fire_site_rebuild();')"
check "ni invoca el trigger por rpc" "false|false|false|false" \
  "select has_function_privilege('anon', 'public.mark_site_dirty()', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.mark_site_dirty()', 'execute')::text || '|' || has_function_privilege('anon', 'public.fire_site_rebuild()', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.fire_site_rebuild()', 'execute')::text;"
check "un admin sigue editando el catalogo (el trigger escribe como definer, no como el)" "1" \
  "$(as_user "$ADMIN" "with u as (update hub_parts set price = price where id = 1 returning 1) select count(*) from u;")"

echo "→ Publicar ahora desde el panel (migracion 0027)"
check "una resena nueva marca el sitio (tambien la de un servicio, que no toca hub_parts)" "true" \
  "$RB_RESET insert into reviews (target_type, target_id, user_id, rating) select 'service', min(id), '$ADMIN', 5 from services; $RB_DIRTY"
check "y borrarla tambien" "true" \
  "$RB_RESET delete from reviews where target_type = 'service' and user_id = '$ADMIN'; $RB_DIRTY"
check "un admin lee el estado, con el enlace cargado" "true|0" \
  "$(as_user "$ADMIN" "select hook_configured::text || '|' || fired_count from site_rebuild_status();")"
check "el estado no devuelve el enlace, solo si existe" "false" \
  "$(as_user "$ADMIN" "select (to_jsonb(s)::text like '%hook.example%')::text from site_rebuild_status() s;")"
check "un usuario normal no lo lee" "ERROR:  Solo un administrador puede ver el estado de la publicación." \
  "$(as_user "$USER_A" 'select * from site_rebuild_status();')"
check "anon no lo invoca" "$(denied site_rebuild_status)" "$(as_anon 'select * from site_rebuild_status();')"
check "un usuario normal no publica" "ERROR:  Solo un administrador puede publicar el sitio." \
  "$(as_user "$USER_A" 'select public.request_site_rebuild();')"
check "anon no publica" "$(denied request_site_rebuild)" "$(as_anon 'select public.request_site_rebuild();')"
check "un admin no publica si ya se pidio hace menos de un minuto" "too_soon" \
  "update site_rebuild set last_fired_at = now() - interval '20 seconds'; $(as_user "$ADMIN" 'select public.request_site_rebuild();')"
check "no hubo otra llamada" "3" "select count(*) from net.calls;"
check "pasado el minuto, publica aunque no haya nada pendiente" "requested" \
  "update site_rebuild set last_fired_at = now() - interval '2 minutes', dirty_since = null; $(as_user "$ADMIN" 'select public.request_site_rebuild();')"
check "llamo al enlace, dejo el estado limpio y lo conto" "4|true|1" \
  "select (select count(*) from net.calls) || '|' || (dirty_since is null and last_fired_at > now() - interval '1 minute')::text || '|' || fired_count from site_rebuild;"
check "publicar tambien limpia lo que estaba pendiente" "false" \
  "update site_rebuild set dirty_since = now() - interval '1 minute', last_change_at = now(), last_fired_at = now() - interval '2 minutes'; $(as_user "$ADMIN" 'select public.request_site_rebuild();') reset role; select (dirty_since is not null)::text from site_rebuild;"
check "sin el enlace en el Vault, lo dice" "no_hook" \
  "delete from vault.decrypted_secrets where name = 'vercel_deploy_hook'; update site_rebuild set last_fired_at = now() - interval '2 minutes'; $(as_user "$ADMIN" 'select public.request_site_rebuild();')"
check "y no pidio nada (la llamada de arriba fue la quinta)" "5" \
  "select count(*) from net.calls;"
check "y el estado lo dice para que el panel lo avise" "false" \
  "$(as_user "$ADMIN" 'select hook_configured::text from site_rebuild_status();')"
check "las dos funciones: anon no, un usuario con sesion si (y por dentro piden admin)" "false|true|false|true" \
  "select has_function_privilege('anon', 'public.site_rebuild_status()', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.site_rebuild_status()', 'execute')::text || '|' || has_function_privilege('anon', 'public.request_site_rebuild()', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.request_site_rebuild()', 'execute')::text;"

echo "→ Los avisos push salen de la base (migracion 0028)"
# El trigger no mira quien manda el cambio por el rol, sino por `auth.uid()`: aqui se finge con los
# claims de la sesion (como PostgREST) sin cambiar de rol, para no depender de las reglas de
# cada funcion de estado (ya comprobadas arriba).
OW_ORDER="$(scalar "select id from orders where user_id = '$USER_A' limit 1;")"
GUEST_ORDER="$(scalar "select id from orders where user_id is null limit 1;")"
OW_APPT="$(scalar "select id from service_appointments where user_id = '$USER_A' limit 1;")"
PN_COUNT0="create temp table if not exists pn0 (c bigint); truncate pn0; insert into pn0 select count(*) from net.calls;"
PN_DELTA="select ((select count(*) from net.calls) - (select c from pn0))::text;"
as_claims() { echo "set request.jwt.claim.sub = '$1';"; }
check "hay un pedido de USER_A, uno de invitado y una cita de USER_A para probar" "1|1|1" \
  "select (select least(count(*), 1) from orders where user_id = '$USER_A') || '|' || (select least(count(*), 1) from orders where user_id is null) || '|' || (select least(count(*), 1) from service_appointments where user_id = '$USER_A');"
check "sin los secretos en el Vault, cambiar el estado funciona y no avisa" "0" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'paid' where id = '$OW_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"
check "y el estado cambio" "paid" "select status from orders where id = '$OW_ORDER';"

$PSQL -d postgres -c "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
check "un admin cambia el estado de un pedido con dueño: se pide un aviso" "1" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'preparing' where id = '$OW_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"
check "va a la funcion, con kind, id, el JWT anon y el secreto" "https://f.example/functions/v1/send-push|order|true|Bearer anon-key|s3cr3t" \
  "select url || '|' || (body->>'kind') || '|' || (body->>'id' = '$OW_ORDER')::text || '|' || (headers->>'Authorization') || '|' || (headers->>'x-push-secret') from net.calls order by id desc limit 1;"
check "el cuerpo lleva solo el tipo y el id: el texto no sale de aqui" "2" \
  "select count(*) from jsonb_object_keys((select body from net.calls order by id desc limit 1));"
check "un update que no cambia el estado no avisa" "0" \
  "$PN_COUNT0 update orders set status = status where id = '$OW_ORDER'; $PN_DELTA"
check "un pedido de invitado no tiene a quien avisar: no se pide nada" "0" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'paid' where id = '$GUEST_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"
check "un cliente que cambia lo suyo no se avisa a si mismo" "0" \
  "$PN_COUNT0 $(as_claims "$USER_A") update orders set status = 'cancelled' where id = '$OW_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"
check "una cita con dueño avisa como cita" "1|appointment" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update service_appointments set status = 'confirmed' where id = '$OW_APPT'; reset request.jwt.claim.sub; select (select count(*) from net.calls) - (select c from pn0) || '|' || (select body->>'kind' from net.calls order by id desc limit 1);"
check "el dueño que cancela su cita no se avisa a si mismo" "0" \
  "$PN_COUNT0 $(as_claims "$USER_A") update service_appointments set status = 'cancelled' where id = '$OW_APPT'; reset request.jwt.claim.sub; $PN_DELTA"
check "si pg_net falla, el cambio de estado sigue adelante" "preparing" \
  "alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_ok; create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'pg_net caido'; end; \$\$; update orders set status = 'paid' where id = '$OW_ORDER'; update orders set status = 'preparing' where id = '$OW_ORDER'; select status from orders where id = '$OW_ORDER';"
$PSQL -d postgres -c "drop function net.http_post(text, jsonb, jsonb, jsonb, integer); alter function net.http_post_ok(text, jsonb, jsonb, jsonb, integer) rename to http_post;" >/dev/null
check "las dos funciones de pg_net quedaron como estaban" "1" "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post';"
check "el trigger no se invoca por rpc" "false|false" \
  "select has_function_privilege('anon', 'public.notify_status_change()', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.notify_status_change()', 'execute')::text;"
check "hay un trigger en pedidos y otro en citas, solo por el estado" "1|1" \
  "select (select count(*) from pg_trigger where tgname = 'orders_notify_status') || '|' || (select count(*) from pg_trigger where tgname = 'service_appointments_notify_status');"
$PSQL -d postgres -c "delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');" >/dev/null

echo "→ Avisos push para quien compro sin cuenta (migracion 0034)"
KEY_A="$(printf 'B%.0s' $(seq 1 87))"
KEY_B="$(printf 'a%.0s' $(seq 1 22))"
reg() { echo "select register_order_push('$1', '$2', '$KEY_A', '$KEY_B', 'prueba');"; }
unreg() { echo "select unregister_order_push('$1', '$2');"; }
devices() { echo "select count(*) from order_push_subscriptions where order_id = '$1';"; }

check "la tabla de dispositivos de pedido tiene RLS" "true" \
  "select relrowsecurity::text from pg_class where relname = 'order_push_subscriptions';"
check "anon no la lee" 'ERROR:  permission denied for table order_push_subscriptions' \
  "$(as_anon 'select * from order_push_subscriptions;')"
check "ni un usuario con sesion" 'ERROR:  permission denied for table order_push_subscriptions' \
  "$(as_user "$USER_A" 'select * from order_push_subscriptions;')"
check "ni escribe en ella" 'ERROR:  permission denied for table order_push_subscriptions' \
  "$(as_anon "insert into order_push_subscriptions (order_id, endpoint, p256dh, auth) values ('$GUEST_ORDER', 'https://x.example/1', '$KEY_A', '$KEY_B');")"
check "las dos funciones las pueden llamar anon y authenticated" "true|true|true|true" \
  "select has_function_privilege('anon', 'public.register_order_push(uuid,text,text,text,text)', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.register_order_push(uuid,text,text,text,text)', 'execute')::text || '|' || has_function_privilege('anon', 'public.unregister_order_push(uuid,text)', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.unregister_order_push(uuid,text)', 'execute')::text;"
check "los dispositivos se borran con el pedido" "c" \
  "select confdeltype::text from pg_constraint where conrelid = 'public.order_push_subscriptions'::regclass and contype = 'f';"

check "un invitado activa los avisos de su pedido" "" "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/uno)")"
check "y queda un dispositivo" "1" "$(devices "$GUEST_ORDER")"
check "registrar el mismo dispositivo otra vez no lo duplica" "" "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/uno)")"
check "sigue siendo uno" "1" "$(devices "$GUEST_ORDER")"
check "la tabla no se puede leer despues desde el navegador (la lee send-push)" 'ERROR:  permission denied for table order_push_subscriptions' \
  "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/uno) select count(*) from order_push_subscriptions;")"
check "un pedido con dueño rechaza el aviso de invitado" 'ERROR:  Este pedido es de una cuenta: inicia sesión y activa los avisos desde tu perfil.' \
  "$(as_anon "$(reg "$OW_ORDER" https://fcm.googleapis.com/fcm/send/uno)")"
check "un pedido que no existe, tambien" 'ERROR:  Ese pedido no existe.' \
  "$(as_anon "$(reg 99999999-9999-4999-8999-999999999999 https://fcm.googleapis.com/fcm/send/uno)")"

check "dos dispositivos mas caben" "" "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/dos) $(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/tres)")"
check "son 3, el tope" "3" "$(devices "$GUEST_ORDER")"
check "el cuarto no" 'ERROR:  Este pedido ya avisa a 3 dispositivos.' \
  "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/cuatro)")"
check "pero un dispositivo que ya estaba puede volver a registrarse" "" "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/tres)")"
check "un endpoint que no es https se rechaza" 'ERROR:  new row for relation "order_push_subscriptions" violates check constraint "order_push_subscriptions_endpoint_check"' \
  "insert into order_push_subscriptions (order_id, endpoint, p256dh, auth) values ('$GUEST_ORDER', 'http://x.example/1', '$KEY_A', '$KEY_B');"

check "quitar un dispositivo" "" "$(as_anon "$(unreg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/uno)")"
check "borra solo ese" "2" "$(devices "$GUEST_ORDER")"
check "con el endpoint de otro pedido no se borra nada" "" "$(as_anon "$(unreg "$OW_ORDER" https://fcm.googleapis.com/fcm/send/dos)")"
check "los dos que quedan siguen" "2" "$(devices "$GUEST_ORDER")"

# Un pedido de invitado ya terminado.
$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
select create_order('final@correo.com','Cliente Final','Calle 2','standard','transfer','[{"part_id": 1, "quantity": 1}]'::jsonb, p_contact_phone => '8095550001', p_province => 'Santiago');
SQL
DONE_ORDER="$(scalar "select id from orders where contact_email = 'final@correo.com' limit 1;")"
$PSQL -d postgres -c "set request.jwt.claim.role='service_role'; update orders set status = 'delivered' where id = '$DONE_ORDER';" >/dev/null
check "un pedido ya entregado no admite avisos: no va a cambiar" 'ERROR:  Este pedido ya terminó: no va a cambiar de estado.' \
  "$(as_anon "$(reg "$DONE_ORDER" https://fcm.googleapis.com/fcm/send/uno)")"

echo "   (el trigger: ya no ignora los pedidos sin dueño)"
$PSQL -d postgres -c "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
check "un pedido de invitado CON dispositivos pide un aviso al cambiar de estado" "1" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'preparing' where id = '$GUEST_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"
check "con el id del pedido y de tipo order, como cualquier otro" "order|true" \
  "select (body->>'kind') || '|' || (body->>'id' = '$GUEST_ORDER')::text from net.calls order by id desc limit 1;"
$PSQL -d postgres -c "delete from order_push_subscriptions where order_id = '$GUEST_ORDER';" >/dev/null
check "sin dispositivos no llama a nadie: no hay a quien avisar" "0" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'shipped' where id = '$GUEST_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"
check "una cita de invitado sigue sin avisar" "0" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update service_appointments set status = 'confirmed' where id = '$APPT1'; update service_appointments set status = 'in_progress' where id = '$APPT1'; reset request.jwt.claim.sub; $PN_DELTA"
check "un pedido con dueño sigue avisando a su cuenta" "1" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'shipped' where id = '$OW_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"

$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from order_push_subscriptions;
delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
SQL

echo "→ Avisos push para quien agendo una cita sin cuenta (migracion 0035)"
areg() { echo "select register_appointment_push('$1', '$2', '$KEY_A', '$KEY_B', 'prueba');"; }
aunreg() { echo "select unregister_appointment_push('$1', '$2');"; }
adevices() { echo "select count(*) from appointment_push_subscriptions where appointment_id = '$1';"; }

check "la tabla de dispositivos de cita tiene RLS" "true" \
  "select relrowsecurity::text from pg_class where relname = 'appointment_push_subscriptions';"
check "anon no la lee" 'ERROR:  permission denied for table appointment_push_subscriptions' \
  "$(as_anon 'select * from appointment_push_subscriptions;')"
check "ni un usuario con sesion" 'ERROR:  permission denied for table appointment_push_subscriptions' \
  "$(as_user "$USER_A" 'select * from appointment_push_subscriptions;')"
check "ni escribe en ella" 'ERROR:  permission denied for table appointment_push_subscriptions' \
  "$(as_anon "insert into appointment_push_subscriptions (appointment_id, endpoint, p256dh, auth) values ('$APPT1', 'https://x.example/1', '$KEY_A', '$KEY_B');")"
check "las dos funciones las pueden llamar anon y authenticated" "true|true|true|true" \
  "select has_function_privilege('anon', 'public.register_appointment_push(uuid,text,text,text,text)', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.register_appointment_push(uuid,text,text,text,text)', 'execute')::text || '|' || has_function_privilege('anon', 'public.unregister_appointment_push(uuid,text)', 'execute')::text || '|' || has_function_privilege('authenticated', 'public.unregister_appointment_push(uuid,text)', 'execute')::text;"
check "los dispositivos se borran con la cita" "c" \
  "select confdeltype::text from pg_constraint where conrelid = 'public.appointment_push_subscriptions'::regclass and contype = 'f';"

check "quien agendo sin cuenta activa los avisos de su cita" "" "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/uno)")"
check "y queda un dispositivo" "1" "$(adevices "$APPT1")"
check "el mismo dispositivo otra vez no se duplica" "" "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/uno)")"
check "sigue siendo uno" "1" "$(adevices "$APPT1")"
check "la tabla no se lee despues desde el navegador" 'ERROR:  permission denied for table appointment_push_subscriptions' \
  "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/uno) select count(*) from appointment_push_subscriptions;")"
check "una cita con dueno rechaza el aviso de invitado" 'ERROR:  Esta cita es de una cuenta: inicia sesión y activa los avisos desde tu perfil.' \
  "$(as_anon "$(areg "$OW_APPT" https://fcm.googleapis.com/fcm/send/uno)")"
check "una cita que no existe, tambien" 'ERROR:  Esa cita no existe.' \
  "$(as_anon "$(areg 99999999-9999-4999-8999-999999999999 https://fcm.googleapis.com/fcm/send/uno)")"

check "dos dispositivos mas caben" "" "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/dos) $(areg "$APPT1" https://fcm.googleapis.com/fcm/send/tres)")"
check "son 3, el tope" "3" "$(adevices "$APPT1")"
check "el cuarto no" 'ERROR:  Esta cita ya avisa a 3 dispositivos.' "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/cuatro)")"
check "pero uno que ya estaba puede volver a registrarse" "" "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/tres)")"
check "un endpoint que no es https se rechaza" 'ERROR:  new row for relation "appointment_push_subscriptions" violates check constraint "appointment_push_subscriptions_endpoint_check"' \
  "insert into appointment_push_subscriptions (appointment_id, endpoint, p256dh, auth) values ('$APPT1', 'http://x.example/1', '$KEY_A', '$KEY_B');"

check "quitar un dispositivo" "" "$(as_anon "$(aunreg "$APPT1" https://fcm.googleapis.com/fcm/send/uno)")"
check "borra solo ese" "2" "$(adevices "$APPT1")"
check "con el endpoint de otra cita no se borra nada" "" "$(as_anon "$(aunreg "$OW_APPT" https://fcm.googleapis.com/fcm/send/dos)")"
check "los dos que quedan siguen" "2" "$(adevices "$APPT1")"

# Una cita ya terminada no admite avisos. Se termina la de prueba un momento y se devuelve a como estaba.
$PSQL -d postgres -c "update service_appointments set status = 'done' where id = '$APPT1';" >/dev/null
check "una cita ya hecha no admite avisos: no va a cambiar" 'ERROR:  Esta cita ya terminó: no va a cambiar de estado.' \
  "$(as_anon "$(areg "$APPT1" https://fcm.googleapis.com/fcm/send/cinco)")"
$PSQL -d postgres -c "update service_appointments set status = 'in_progress' where id = '$APPT1';" >/dev/null

echo "   (el trigger: ahora tambien las citas sin dueno con dispositivos)"
$PSQL -d postgres -c "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
check "una cita de invitado CON dispositivos pide un aviso al cambiar de estado" "1" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update service_appointments set status = 'confirmed' where id = '$APPT1'; reset request.jwt.claim.sub; $PN_DELTA"
check "con el id de la cita y de tipo appointment" "appointment|true" \
  "select (body->>'kind') || '|' || (body->>'id' = '$APPT1')::text from net.calls order by id desc limit 1;"
$PSQL -d postgres -c "delete from appointment_push_subscriptions where appointment_id = '$APPT1';" >/dev/null
check "sin dispositivos no llama a nadie" "0" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update service_appointments set status = 'in_progress' where id = '$APPT1'; reset request.jwt.claim.sub; $PN_DELTA"
check "una cita con dueno sigue avisando a su cuenta" "true" \
  "$PN_COUNT0 $(as_claims "$ADMIN") update service_appointments set status = 'confirmed' where id = '$OW_APPT'; update service_appointments set status = 'in_progress' where id = '$OW_APPT'; reset request.jwt.claim.sub; select (((select count(*) from net.calls) - (select c from pn0)) >= 1)::text;"
check "y un pedido de invitado con dispositivos sigue avisando (lo de la 0034 no se rompio)" "1" \
  "insert into order_push_subscriptions (order_id, endpoint, p256dh, auth) values ('$GUEST_ORDER', 'https://fcm.googleapis.com/fcm/send/pedido', '$KEY_A', '$KEY_B'); $PN_COUNT0 $(as_claims "$ADMIN") update orders set status = 'paid' where id = '$GUEST_ORDER'; reset request.jwt.claim.sub; $PN_DELTA"

$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from order_push_subscriptions;
delete from appointment_push_subscriptions;
delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
SQL

echo "→ Recordatorio de una cita, el dia antes (migracion 0036)"
RM_CLEAR="delete from appointment_reminders;"
# Las dos citas de prueba: la de invitado (APPT1) y la de USER_A (OW_APPT), confirmadas y para dentro de 10 horas.
rm_set() { echo "update service_appointments set status = '$2', scheduled_at = now() + interval '$3' where id = '$1';"; }

check "la tabla de recordatorios tiene RLS" "true" \
  "select relrowsecurity::text from pg_class where relname = 'appointment_reminders';"
check "anon no la lee" 'ERROR:  permission denied for table appointment_reminders' "$(as_anon 'select * from appointment_reminders;')"
check "ni un usuario con sesion" 'ERROR:  permission denied for table appointment_reminders' "$(as_user "$USER_A" 'select * from appointment_reminders;')"
check "los recordatorios se borran con la cita" "c" \
  "select confdeltype::text from pg_constraint where conrelid = 'public.appointment_reminders'::regclass and contype = 'f';"

check "sin los secretos del Vault no recuerda nada" "sin enlace de avisos: no se recordo nada" "select send_appointment_reminders();"
check "y no deja nada marcado" "0" "select count(*) from appointment_reminders;"

$PSQL -d postgres -c "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
$(rm_set "$APPT1" confirmed '10 hours')
$(rm_set "$OW_APPT" confirmed '10 hours')
insert into appointment_push_subscriptions (appointment_id, endpoint, p256dh, auth) values ('$APPT1', 'https://fcm.googleapis.com/fcm/send/cita', '$KEY_A', '$KEY_B');
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('$USER_A', 'https://fcm.googleapis.com/fcm/send/cuenta', '$KEY_A', '$KEY_B');
delete from net.calls;
SQL

check "pide un recordatorio por la cita de invitado con dispositivos y otro por la de la cuenta con dispositivos" "2 recordatorios pedidos" "select send_appointment_reminders();"
check "con el tipo appointment_reminder y solo el id (el texto lo arma send-push)" "2|appointment_reminder|true" \
  "select count(*) || '|' || min(body->>'kind') || '|' || (bool_and((body - 'kind' - 'id') = '{}'::jsonb))::text from net.calls;"
check "con el secreto y la clave anon, como los demas avisos desde la base" "s3cr3t|Bearer anon-key" \
  "select min(headers->>'x-push-secret') || '|' || min(headers->>'Authorization') from net.calls;"
check "quedaron anotados para que hora se recordo" "2" \
  "select count(*) from appointment_reminders r join service_appointments a on a.id = r.appointment_id and r.remind_for = a.scheduled_at;"
check "a la hora siguiente no repite" "0 recordatorios pedidos" "select send_appointment_reminders();"
check "si se reprograma (cambia la hora), puede recordar otra vez" "1 recordatorios pedidos" \
  "update service_appointments set scheduled_at = scheduled_at + interval '1 hour' where id = '$APPT1'; select send_appointment_reminders();"

echo "   (a quien NO se le recuerda: se aparta la cita de la cuenta para que no sume)"
RM_SOLO_INVITADO="update service_appointments set status = 'cancelled' where id = '$OW_APPT';"
for estado in requested in_progress done cancelled no_show; do
  check "una cita $estado no se recuerda" "0 recordatorios pedidos" \
    "$RM_SOLO_INVITADO $RM_CLEAR $(rm_set "$APPT1" "$estado" '10 hours') select send_appointment_reminders();"
done
check "una cita para dentro de 1 hora ya no (ya la confirmaron, y viene en camino)" "0 recordatorios pedidos" \
  "$RM_SOLO_INVITADO $RM_CLEAR $(rm_set "$APPT1" confirmed '1 hour') select send_appointment_reminders();"
check "una de dentro de 30 horas todavia no toca" "0 recordatorios pedidos" \
  "$RM_SOLO_INVITADO $RM_CLEAR $(rm_set "$APPT1" confirmed '30 hours') select send_appointment_reminders();"
check "una que ya paso, tampoco" "0 recordatorios pedidos" \
  "$RM_SOLO_INVITADO $RM_CLEAR $(rm_set "$APPT1" confirmed '-1 hour') select send_appointment_reminders();"
check "una cita de invitado sin dispositivos no tiene a quien recordar" "0 recordatorios pedidos" \
  "$RM_CLEAR $(rm_set "$APPT1" confirmed '10 hours') delete from appointment_push_subscriptions where appointment_id = '$APPT1'; update service_appointments set status = 'cancelled' where id = '$OW_APPT'; select send_appointment_reminders();"
check "una cita de una cuenta sin ningun dispositivo, tampoco" "0 recordatorios pedidos" \
  "$RM_CLEAR $(rm_set "$OW_APPT" confirmed '10 hours') delete from push_subscriptions where user_id = '$USER_A'; select send_appointment_reminders();"

check "si pg_net falla no se cae, y esa cita queda sin marcar para reintentar" "0 recordatorios pedidos|0" \
  "insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('$USER_A', 'https://fcm.googleapis.com/fcm/send/cuenta', '$KEY_A', '$KEY_B'); $RM_CLEAR alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_ok; create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'pg_net caido'; end; \$\$; select send_appointment_reminders() || '|' || (select count(*) from appointment_reminders);"
$PSQL -d postgres -c "drop function net.http_post(text, jsonb, jsonb, jsonb, integer); alter function net.http_post_ok(text, jsonb, jsonb, jsonb, integer) rename to http_post;" >/dev/null
check "arreglado pg_net, a la hora siguiente si se manda" "1 recordatorios pedidos" "select send_appointment_reminders();"

check "el cron corre cada hora, una sola vez" "1|5 * * * *" \
  "select count(*) || '|' || min(schedule) from cron.job where jobname = 'appointment-reminders' and command like '%send_appointment_reminders%';"
check "anon no invoca send_appointment_reminders" "$(denied send_appointment_reminders)" "$(as_anon 'select send_appointment_reminders();')"
check "ni un usuario con sesion" "$(denied send_appointment_reminders)" "$(as_user "$USER_A" 'select send_appointment_reminders();')"

$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from appointment_reminders;
delete from appointment_push_subscriptions;
delete from push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/%';
delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
SQL

echo "→ Endurecer los avisos push (migracion 0037)"
check "is_push_endpoint acepta los servicios de push conocidos" "true|true|true|true|true" \
  "select is_push_endpoint('https://fcm.googleapis.com/fcm/send/abc')::text || '|' || is_push_endpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')::text || '|' || is_push_endpoint('https://web.push.apple.com/abc')::text || '|' || is_push_endpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')::text || '|' || is_push_endpoint('https://android.googleapis.com/gcm/send/abc')::text;"
check "y rechaza lo demas: http, el truco de la arroba, otros hosts de Google, direcciones internas, vacio y nulo" "false|false|false|false|false|false|false|false|false" \
  "select is_push_endpoint('http://fcm.googleapis.com/fcm/send/abc')::text || '|' || is_push_endpoint('https://fcm.googleapis.com@servidor-ajeno.example/x')::text || '|' || is_push_endpoint('https://storage.googleapis.com/x')::text || '|' || is_push_endpoint('https://fcm.googleapis.com.servidor-ajeno.example/x')::text || '|' || is_push_endpoint('https://push.services.mozilla.com.evil.example/x')::text || '|' || is_push_endpoint('https://169.254.169.254/latest/meta-data/')::text || '|' || is_push_endpoint('https://localhost/x')::text || '|' || is_push_endpoint('')::text || '|' || is_push_endpoint(null)::text;"

BAD_ENDPOINT='https://servidor-ajeno.example/x'
check "un invitado no puede registrar un endpoint ajeno en su pedido (SSRF)" 'ERROR:  Este navegador no usa un servicio de avisos compatible.' \
  "$(as_anon "$(reg "$GUEST_ORDER" "$BAD_ENDPOINT")")"
$PSQL -d postgres -c "update service_appointments set status = 'confirmed' where id = '$APPT1';" >/dev/null
check "ni en su cita" 'ERROR:  Este navegador no usa un servicio de avisos compatible.' \
  "$(as_anon "$(areg "$APPT1" "$BAD_ENDPOINT")")"
check "ni quien tiene cuenta, en su perfil" 'ERROR:  Este navegador no usa un servicio de avisos compatible.' \
  "$(as_user "$USER_A" "select register_push_subscription('$BAD_ENDPOINT', '$KEY_A', '$KEY_B', 'x');")"
check "no queda ninguna fila con ese endpoint" "0" \
  "select (select count(*) from push_subscriptions where endpoint = '$BAD_ENDPOINT') + (select count(*) from order_push_subscriptions where endpoint = '$BAD_ENDPOINT') + (select count(*) from appointment_push_subscriptions where endpoint = '$BAD_ENDPOINT');"
check "uno conocido sigue entrando (pedido, cita y cuenta)" "" \
  "$(as_anon "$(reg "$GUEST_ORDER" https://fcm.googleapis.com/fcm/send/valido) $(areg "$APPT1" https://fcm.googleapis.com/fcm/send/valido)")"
$PSQL -d postgres -c "delete from order_push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/valido'; delete from appointment_push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/valido';" >/dev/null

echo "   (vender y renovar: solo una publicacion aprobada)"
$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into hub_market_items (id, seller_id, seller_name, title, price, location, category, status)
values (9301, '$USER_A', 'Dueno', 'Pendiente', 1000, 'Santiago', 'piezas', 'pendiente'),
       (9302, '$USER_A', 'Dueno', 'Rechazada', 1000, 'Santiago', 'piezas', 'rechazado'),
       (9303, '$USER_A', 'Dueno', 'Aprobada',  1000, 'Santiago', 'piezas', 'aprobado');
SQL
check "una pendiente no se marca como vendida" 'ERROR:  Solo una publicación aprobada se puede marcar como vendida.' \
  "$(as_user "$USER_A" "select * from mark_publication_sold(9301);")"
check "una rechazada tampoco" 'ERROR:  Solo una publicación aprobada se puede marcar como vendida.' \
  "$(as_user "$USER_A" "select * from mark_publication_sold(9302);")"
check "ni se renueva una pendiente" 'ERROR:  Solo una publicación aprobada se puede renovar.' \
  "$(as_user "$USER_A" "select * from renew_publication(9301);")"
check "ni una rechazada" 'ERROR:  Solo una publicación aprobada se puede renovar.' \
  "$(as_user "$USER_A" "select * from renew_publication(9302);")"
check "quien modera tampoco puede (el estado manda)" 'ERROR:  Solo una publicación aprobada se puede renovar.' \
  "$(as_user "$ADMIN" "select * from renew_publication(9302);")"
check "y no cambio nada de ellas" "0" \
  "select count(*) from hub_market_items where id in (9301, 9302) and sold_at is not null;"
check "una aprobada sigue funcionando: se vende" "true" \
  "$(as_user "$USER_A" "select (sold_at is not null)::text from mark_publication_sold(9303);")"
check "y se renueva" "true" \
  "$(as_user "$USER_A" "select (sold_at is null)::text from renew_publication(9303);")"
$PSQL -d postgres -c "set request.jwt.claim.role='service_role'; delete from hub_market_items where id between 9301 and 9303;" >/dev/null

echo "→ Auto Hub y Hub Market tambien republican el sitio (migracion 0029)"
check "un cambio en un vehiculo de Auto Hub marca el sitio" "true" \
  "$RB_RESET update auto_hub_vehicles set price = price + 1 where id = (select min(id) from auto_hub_vehicles); $RB_DIRTY"
check "un update que no cambia nada no marca" "false" \
  "$RB_RESET update auto_hub_vehicles set price = price where id = (select min(id) from auto_hub_vehicles); $RB_DIRTY"
check "un cambio en una publicacion de Hub Market marca el sitio (moderar es lo que la publica o la quita)" "true" \
  "$RB_RESET update hub_market_items set title = title || ' ' where id = (select min(id) from hub_market_items); $RB_DIRTY"
check "borrar una publicacion tambien" "true" \
  "$RB_RESET delete from hub_market_items where id = (select max(id) from hub_market_items); $RB_DIRTY"
check "hay un trigger en cada tabla" "1|1" \
  "select (select count(*) from pg_trigger where tgname = 'auto_hub_vehicles_mark_site_dirty') || '|' || (select count(*) from pg_trigger where tgname = 'hub_market_items_mark_site_dirty');"
check "un admin sigue editando un vehiculo (el trigger escribe como definer, no como el)" "1" \
  "$(as_user "$ADMIN" "with u as (update auto_hub_vehicles set price = price + 1 where id = (select min(id) from auto_hub_vehicles) returning 1) select count(*) from u;")"

echo "→ Vendida y caducidad de las publicaciones (migracion 0030)"
SVC="set request.jwt.claim.role='service_role';"
# Dos publicaciones aprobadas de USER_A para jugar con ellas (el insert sin sesion respeta lo que traiga la fila).
$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into hub_market_items (id, seller_id, seller_name, title, price, location, category, status)
values (9001, '$USER_A', 'Dueno', 'Publicacion 9001', 1000, 'Santiago', 'piezas', 'aprobado'),
       (9002, '$USER_A', 'Dueno', 'Publicacion 9002', 2000, 'Santiago', 'piezas', 'aprobado');
SQL

check "toda publicacion nace sin vender y con unos 60 dias de plazo" "0" \
  "select count(*) from hub_market_items where sold_at is not null or expires_at < now() + interval '59 days' or expires_at > now() + interval '61 days';"
check "las dos columnas existen y el plazo es obligatorio" "timestamp with time zone|NO" \
  "select data_type || '|' || is_nullable from information_schema.columns where table_name = 'hub_market_items' and column_name = 'expires_at';"

check "el dueno marca su publicacion como vendida" "true" \
  "$(as_user "$USER_A" "select (sold_at is not null)::text from mark_publication_sold(9001);")"
check "otro usuario no puede marcarla" 'ERROR:  Solo su dueño puede marcar una publicación como vendida.' \
  "$(as_user "$USER_B" "select * from mark_publication_sold(9002);")"
check "quien modera si puede" "true" \
  "$(as_user "$ADMIN" "select (sold_at is not null)::text from mark_publication_sold(9002);")"
check "anon no invoca mark_publication_sold" "$(denied mark_publication_sold)" \
  "$(as_anon "select * from mark_publication_sold(9001);")"
check "anon no invoca renew_publication" "$(denied renew_publication)" \
  "$(as_anon "select * from renew_publication(9001);")"
check "una publicacion que no existe se dice" 'ERROR:  Esa publicación no existe.' \
  "$(as_user "$USER_A" "select * from mark_publication_sold(987654);")"
check "marcarla vendida otra vez no mueve la fecha" "1" \
  "$(as_user "$ADMIN" "select count(distinct sold_at) from (select sold_at from mark_publication_sold(9002) union all select sold_at from mark_publication_sold(9002)) t;")"

echo "   (las fechas no se escriben a mano)"
check "el dueno no puede des-vender con un update normal" "true" \
  "$(as_user "$USER_A" "update hub_market_items set sold_at = null where id = 9001;") select (sold_at is not null)::text from hub_market_items where id = 9001;"
check "ni darse mas plazo" "true" \
  "$(as_user "$USER_A" "update hub_market_items set expires_at = now() + interval '5 years' where id = 9001;") select (expires_at < now() + interval '61 days')::text from hub_market_items where id = 9001;"
check "ni al publicar: nace a la venta y con 60 dias aunque mande otra cosa" "false|true" \
  "$(as_user "$USER_A" "with n as (insert into hub_market_items (seller_id, seller_name, title, price, location, category, sold_at, expires_at) values (auth.uid(), 'Dueno', 'Trampa', 10, 'Santiago', 'piezas', now(), '2099-01-01') returning sold_at, expires_at) select (sold_at is not null)::text || '|' || (expires_at < now() + interval '61 days')::text from n;")"

check "renovar la deja a la venta y con 60 dias" "true|true" \
  "$(as_user "$USER_A" "select (sold_at is null)::text || '|' || (expires_at > now() + interval '59 days')::text from renew_publication(9001);")"
check "otro usuario no puede renovar la ajena" 'ERROR:  Solo su dueño puede renovar una publicación.' \
  "$(as_user "$USER_B" "select * from renew_publication(9001);")"

echo "   (el HTML se entera)"
check "marcar vendida marca el sitio como cambiado" "true" \
  "$RB_RESET $(as_user "$USER_A" "select 1 from mark_publication_sold(9001);") reset role; $RB_DIRTY"
check "renovar tambien" "true" \
  "$RB_RESET $(as_user "$USER_A" "select 1 from renew_publication(9001);") reset role; $RB_DIRTY"

check "vencio hace 2 horas: mark_expired_publications() la cuenta" "1" \
  "$SVC update hub_market_items set expires_at = now() - interval '2 hours' where id = 9001; select mark_expired_publications();"
check "y pide un despliegue" "true" \
  "$SVC update hub_market_items set expires_at = now() - interval '2 hours' where id = 9001; $RB_RESET select mark_expired_publications() >= 0; $RB_DIRTY"
check "vencio hace 2 dias: ya no la cuenta (el HTML ya se corrigio)" "0|false" \
  "$SVC update hub_market_items set expires_at = now() - interval '2 days' where id = 9001; $RB_RESET select mark_expired_publications()::text || '|' || (select (dirty_since is not null)::text from site_rebuild);"
check "una vendida que vence no cuenta (ya salio del HTML al venderse)" "0" \
  "$SVC update hub_market_items set expires_at = now() - interval '2 hours', sold_at = now() where id = 9001; select mark_expired_publications();"
check "una pendiente que vence tampoco" "0" \
  "$SVC update hub_market_items set expires_at = now() - interval '2 hours', sold_at = null, status = 'pendiente' where id = 9001; select mark_expired_publications();"

check "el cron diario esta programado, una sola vez" "1|15 4 * * *" \
  "select count(*) || '|' || min(schedule) from cron.job where jobname = 'expire-publications' and command like '%mark_expired_publications%';"
check "anon no invoca mark_expired_publications" "$(denied mark_expired_publications)" \
  "$(as_anon 'select mark_expired_publications();')"
check "ni un usuario con sesion" "$(denied mark_expired_publications)" \
  "$(as_user "$USER_A" 'select mark_expired_publications();')"

# Se limpia lo que se creo: las publicaciones de prueba no deben contaminar los conteos de abajo.
$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
set request.jwt.claim.role='service_role';
delete from hub_market_items where id in (9001, 9002) or title = 'Trampa';
SQL

echo "→ Aviso de vencimiento de las publicaciones (migracion 0031)"
# Ocho publicaciones: solo la 9101 esta por vencer, aprobada, a la venta y con vendedor. Las demas
# fallan cada una por una razon distinta.
$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from net.calls;
insert into hub_market_items (id, seller_id, seller_name, title, price, location, category, status, expires_at, sold_at, is_test, is_active)
values
  (9101, '$USER_A', 'Dueno', 'Por vencer',         1000, 'Santiago', 'piezas', 'aprobado',  now() + interval '3 days',  null,  false, true),
  (9102, '$USER_A', 'Dueno', 'Con plazo de sobra', 1000, 'Santiago', 'piezas', 'aprobado',  now() + interval '20 days', null,  false, true),
  (9103, '$USER_A', 'Dueno', 'Vendida',            1000, 'Santiago', 'piezas', 'aprobado',  now() + interval '3 days',  now(), false, true),
  (9104, '$USER_A', 'Dueno', 'Pendiente',          1000, 'Santiago', 'piezas', 'pendiente', now() + interval '3 days',  null,  false, true),
  (9105, '$USER_A', 'Dueno', 'De prueba',          1000, 'Santiago', 'piezas', 'aprobado',  now() + interval '3 days',  null,  true,  true),
  (9106, null,      'Dueno', 'Sin vendedor',       1000, 'Santiago', 'piezas', 'aprobado',  now() + interval '3 days',  null,  false, true),
  (9107, '$USER_A', 'Dueno', 'Ya vencida',         1000, 'Santiago', 'piezas', 'aprobado',  now() - interval '1 hour',  null,  false, true),
  (9108, '$USER_A', 'Dueno', 'Desactivada',        1000, 'Santiago', 'piezas', 'aprobado',  now() + interval '3 days',  null,  false, false);
SQL

check "la tabla de avisos hechos tiene RLS" "true" \
  "select relrowsecurity::text from pg_class where relname = 'publication_expiry_notices';"
check "anon no la lee" 'ERROR:  permission denied for table publication_expiry_notices' \
  "$(as_anon 'select * from publication_expiry_notices;')"
check "ni un usuario con sesion" 'ERROR:  permission denied for table publication_expiry_notices' \
  "$(as_user "$USER_A" 'select * from publication_expiry_notices;')"

check "sin los secretos del Vault no avisa a nadie" "sin enlace de avisos: no se aviso a nadie" \
  "select warn_expiring_publications();"
check "y no deja nada marcado como avisado" "0" "select count(*) from publication_expiry_notices;"

$PSQL -d postgres -c "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null

check "avisa solo de la que esta por vencer y es visible (las otras siete fallan cada una por lo suyo)" "1 avisos pedidos" \
  "$RB_RESET select warn_expiring_publications();"
check "le pide a send-push un aviso de tipo listing, con el id" '{"id": 9101, "kind": "listing"}' \
  "select body::text from net.calls order by id desc limit 1;"
check "con el secreto y la clave anon en las cabeceras, como el trigger de la 0028" "s3cr3t|Bearer anon-key" \
  "select (headers->>'x-push-secret') || '|' || (headers->>'Authorization') from net.calls order by id desc limit 1;"
check "quedo anotado para que fecha de vencimiento se aviso" "true" \
  "select (warned_for = (select expires_at from hub_market_items where id = 9101))::text from publication_expiry_notices where item_id = 9101;"
check "avisar no marca el sitio como cambiado (no dispara un despliegue)" "false" \
  "$RB_RESET select warn_expiring_publications(); $RB_DIRTY"
check "al dia siguiente no repite el aviso" "0 avisos pedidos" "select warn_expiring_publications();"
check "y no mando otra llamada" "1" "select count(*) from net.calls;"

check "si el dueno renueva (cambia la fecha), puede volver a avisar" "1 avisos pedidos" \
  "set request.jwt.claim.role='service_role'; update hub_market_items set expires_at = now() + interval '2 days' where id = 9101; select warn_expiring_publications();"

check "si pg_net falla, no hace fallar la funcion, y esa publicacion no queda marcada" "0 avisos pedidos|1" \
  "set request.jwt.claim.role='service_role'; update hub_market_items set expires_at = now() + interval '1 day' where id = 9101; alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_ok; create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'pg_net caido'; end; \$\$; select warn_expiring_publications() || '|' || (select count(*) from publication_expiry_notices where warned_for <> (select expires_at from hub_market_items where id = 9101)) ;"
$PSQL -d postgres -c "drop function net.http_post(text, jsonb, jsonb, jsonb, integer); alter function net.http_post_ok(text, jsonb, jsonb, jsonb, integer) rename to http_post;" >/dev/null
check "arreglado pg_net, el siguiente dia si avisa" "1 avisos pedidos" "select warn_expiring_publications();"

check "borrar la publicacion borra su aviso" "0" \
  "set request.jwt.claim.role='service_role'; delete from hub_market_items where id = 9101; select count(*) from publication_expiry_notices where item_id = 9101;"

check "el cron diario esta programado, una sola vez, a las 9 de la manana de RD" "1|0 13 * * *" \
  "select count(*) || '|' || min(schedule) from cron.job where jobname = 'warn-expiring-publications' and command like '%warn_expiring_publications%';"
check "anon no invoca warn_expiring_publications" "$(denied warn_expiring_publications)" "$(as_anon 'select warn_expiring_publications();')"
check "ni un usuario con sesion" "$(denied warn_expiring_publications)" "$(as_user "$USER_A" 'select warn_expiring_publications();')"

$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
set request.jwt.claim.role='service_role';
delete from hub_market_items where id between 9101 and 9108;
delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
delete from net.calls;
SQL

echo "→ Aviso de despliegue fallido (migracion 0032)"
$PSQL -d postgres -c "delete from net.calls;" >/dev/null

check "la tabla de despliegues avisados tiene RLS" "true" \
  "select relrowsecurity::text from pg_class where relname = 'deploy_alerts';"
check "anon no la lee" 'ERROR:  permission denied for table deploy_alerts' \
  "$(as_anon 'select * from deploy_alerts;')"
check "ni un usuario con sesion" 'ERROR:  permission denied for table deploy_alerts' \
  "$(as_user "$ADMIN" 'select * from deploy_alerts;')"
check "ni escribe en ella" 'ERROR:  permission denied for table deploy_alerts' \
  "$(as_user "$ADMIN" "insert into deploy_alerts (deployment_id) values ('dpl_x');")"
check "send-push (service_role) si la lee y la escribe" "1" \
  "set role service_role; insert into deploy_alerts (deployment_id) values ('dpl_prueba'); select count(*) from deploy_alerts where deployment_id = 'dpl_prueba';"

check "sin los secretos del Vault no pregunta nada" "sin enlace de avisos: no se pregunto por el despliegue" \
  "select check_deploy_failures();"
check "y no manda ninguna llamada" "0" "select count(*) from net.calls;"

$PSQL -d postgres -c "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null

check "con los secretos le pide a send-push que mire el despliegue" "preguntado" "select check_deploy_failures();"
check "con un POST de tipo deploy, sin ningun dato mas (el texto no sale de la base)" '{"kind": "deploy"}' \
  "select body::text from net.calls order by id desc limit 1;"
check "a la URL de send-push, con el secreto y la clave anon como el trigger de la 0028" "https://f.example/functions/v1/send-push|s3cr3t|Bearer anon-key" \
  "select url || '|' || (headers->>'x-push-secret') || '|' || (headers->>'Authorization') from net.calls order by id desc limit 1;"

check "ya no borra los avisos viejos: un fallo que sigue siendo el ultimo no vuelve a avisar (0037)" "2" \
  "set role service_role; insert into deploy_alerts (deployment_id, created_at) values ('dpl_viejo', now() - interval '91 days'); reset role; select check_deploy_failures(); select count(*) from deploy_alerts;"

check "si pg_net falla no se cae, y lo dice" "no se pudo preguntar por el despliegue" \
  "alter function net.http_post(text, jsonb, jsonb, jsonb, integer) rename to http_post_ok; create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000) returns bigint language plpgsql as \$\$ begin raise exception 'pg_net caido'; end; \$\$; select check_deploy_failures();"
$PSQL -d postgres -c "drop function net.http_post(text, jsonb, jsonb, jsonb, integer); alter function net.http_post_ok(text, jsonb, jsonb, jsonb, integer) rename to http_post;" >/dev/null

check "el cron corre cada 10 minutos, una sola vez" "1|*/10 * * * *" \
  "select count(*) || '|' || min(schedule) from cron.job where jobname = 'check-deploy-failures' and command like '%check_deploy_failures%';"
check "anon no invoca check_deploy_failures" "$(denied check_deploy_failures)" "$(as_anon 'select check_deploy_failures();')"
check "ni un usuario con sesion" "$(denied check_deploy_failures)" "$(as_user "$ADMIN" 'select check_deploy_failures();')"

$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from deploy_alerts;
delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret');
delete from net.calls;
SQL

echo "→ Varias fotos por opcion (migracion 0033)"
PV_PRODUCT="$(SCALAR_DB=postgres scalar 'select min(id) from hub_parts;')"

check "la columna existe, es una lista de texto y nunca nula" "ARRAY|NO" \
  "select data_type || '|' || is_nullable from information_schema.columns where table_name = 'product_variants' and column_name = 'image_urls';"
check "en toda opcion, image_url es la primera de la lista (las dos columnas de acuerdo)" "0" \
  "select count(*) from product_variants where image_url is distinct from image_urls[1];"

check "insertar solo con image_url (frontend anterior): la lista pasa a ser esa foto" "{a.jpg}|a.jpg" \
  "insert into product_variants (product_id, name, stock, image_url) values ($PV_PRODUCT, 'Prueba A', 1, 'a.jpg'); select image_urls::text || '|' || image_url from product_variants where name = 'Prueba A';"
check "insertar con la lista: image_url es la primera" "{b.jpg,c.jpg}|b.jpg" \
  "insert into product_variants (product_id, name, stock, image_urls) values ($PV_PRODUCT, 'Prueba B', 1, array['b.jpg','c.jpg']); select image_urls::text || '|' || image_url from product_variants where name = 'Prueba B';"
check "sin fotos, las dos quedan vacias" "{}|" \
  "insert into product_variants (product_id, name, stock) values ($PV_PRODUCT, 'Prueba C', 1); select image_urls::text || '|' || coalesce(image_url, '') from product_variants where name = 'Prueba C';"

check "actualizar la lista (frontend nuevo): image_url sigue a la primera" "{d.jpg,e.jpg}|d.jpg" \
  "update product_variants set image_urls = array['d.jpg','e.jpg'] where name = 'Prueba A'; select image_urls::text || '|' || image_url from product_variants where name = 'Prueba A';"
check "actualizar solo image_url (frontend anterior): la lista pasa a ser esa foto" "{f.jpg}|f.jpg" \
  "update product_variants set image_url = 'f.jpg' where name = 'Prueba A'; select image_urls::text || '|' || image_url from product_variants where name = 'Prueba A';"
check "y quitarla (image_url nulo) vacia la lista" "{}|" \
  "update product_variants set image_url = null where name = 'Prueba A'; select image_urls::text || '|' || coalesce(image_url, '') from product_variants where name = 'Prueba A';"
check "cambiar otra cosa (el stock) no toca las fotos" "{b.jpg,c.jpg}|b.jpg|7" \
  "update product_variants set stock = 7 where name = 'Prueba B'; select image_urls::text || '|' || image_url || '|' || stock from product_variants where name = 'Prueba B';"
check "cambiar las dos a la vez: manda la lista" "{g.jpg,h.jpg}|g.jpg" \
  "update product_variants set image_url = 'z.jpg', image_urls = array['g.jpg','h.jpg'] where name = 'Prueba B'; select image_urls::text || '|' || image_url from product_variants where name = 'Prueba B';"

check "ocho fotos caben" "8" \
  "update product_variants set image_urls = array['1','2','3','4','5','6','7','8'] where name = 'Prueba B'; select cardinality(image_urls) from product_variants where name = 'Prueba B';"
check "nueve no" 'ERROR:  new row for relation "product_variants" violates check constraint "product_variants_image_urls_check"' \
  "update product_variants set image_urls = array['1','2','3','4','5','6','7','8','9'] where name = 'Prueba B';"
check "tampoco una lista nula" 'ERROR:  null value in column "image_urls" of relation "product_variants" violates not-null constraint' \
  "update product_variants set image_urls = null where name = 'Prueba B';"

check "un admin guarda las fotos de una opcion (RLS: solo admin gestiona)" "{i.jpg}" \
  "$(as_user "$ADMIN" "update product_variants set image_urls = array['i.jpg'] where name = 'Prueba C'; select image_urls::text from product_variants where name = 'Prueba C';")"
check "un usuario normal no" "0" \
  "$(as_user "$USER_A" "with u as (update product_variants set image_urls = array['mala.jpg'] where name = 'Prueba C' returning 1) select count(*) from u;")"
check "anon lee las fotos de las opciones de un producto visible" "true" \
  "$(as_anon "select (count(*) > 0)::text from product_variants where name = 'Prueba C';")"

check "cambiar las fotos de una opcion marca el sitio (el HTML las enseña)" "true" \
  "$RB_RESET update product_variants set image_urls = array['j.jpg','k.jpg'] where name = 'Prueba C'; $RB_DIRTY"
check "el trigger no toca el stock del producto (esta columna no entra en la cuenta)" "true" \
  "select (count(*) = 0)::text from hub_parts p where p.has_variants and p.stock <> (select coalesce(sum(v.stock), 0) from product_variants v where v.product_id = p.id and v.is_active);"

$PSQL -d postgres -v ON_ERROR_STOP=1 >/dev/null <<SQL
delete from product_variants where name in ('Prueba A', 'Prueba B', 'Prueba C');
SQL

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
apply supabase/migrations/0020_reviews.sql upgrade
CHECK_DB=upgrade check "las piezas con estrellas las copian a stars_seed, las demas quedan en 0" "4.5|0.0" \
  "select (select max(stars_seed) from hub_parts where id % 2 = 0) || '|' || (select max(stars_seed) from hub_parts where id % 2 = 1);"
CHECK_DB=upgrade check "todas empiezan con 0 reseñas" "0" "select count(*) from hub_parts where review_count <> 0;"
UP_PART="$(SCALAR_DB=upgrade scalar 'select min(id) from hub_parts where id % 2 = 0;')"
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into reviews (target_type, target_id, user_id, rating) values ('product', $UP_PART, '11111111-1111-1111-1111-111111111111', 2);
SQL
CHECK_DB=upgrade check "una reseña real reemplaza a las estrellas sembradas por el promedio" "2.0|1|4.5" \
  "select stars_rating || '|' || review_count || '|' || stars_seed from hub_parts where id = $UP_PART;"
apply supabase/migrations/0020_reviews.sql upgrade
echo "   (aplicada otra vez, con una reseña real dentro)"
CHECK_DB=upgrade check "el promedio real no se toma por sembrado" "2.0|1|4.5" \
  "select stars_rating || '|' || review_count || '|' || stars_seed from hub_parts where id = $UP_PART;"
CHECK_DB=upgrade check "y al quedarse sin reseñas, vuelve a las sembradas" "4.5|0" \
  "delete from reviews; select stars_rating || '|' || review_count from hub_parts where id = $UP_PART;"

echo "→ Camino de actualizacion de la 0021: la base real ya tiene piezas con categoria de texto"
# La base real tiene 35 piezas con `category` y `category_id`. Antes de borrar la columna
# la migracion comprueba que ninguna dependa de ella, y despues deja la busqueda, el
# trigger y los ajustes funcionando sin ella.
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_parts (category, name, brand, img_url, price, stock) values ('zzz', 'Sin clasificar', 'X', 'x.jpg', 1, 1);
SQL
CHECK_DB=upgrade check "una pieza con texto pero sin category_id detiene la migracion" \
  "ERROR:  No se puede borrar hub_parts.category: 1 pieza(s) tienen texto pero no category_id. Clasifícalas primero." \
  "$(cat supabase/migrations/0021_drop_legacy.sql)"
CHECK_DB=upgrade check "y no se borro nada: la columna sigue ahi" "1" \
  "select count(*) from information_schema.columns where table_name = 'hub_parts' and column_name = 'category';"
CHECK_DB=upgrade check "ni la funcion de contadores ni su ajuste" "1|1" \
  "select (select count(*) from pg_proc where proname = 'get_site_stats') || '|' || (select count(*) from site_settings where key = 'stats_mode');"
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update hub_parts set category_id = (select id from product_categories order by id limit 1) where name = 'Sin clasificar';
SQL
apply supabase/migrations/0021_drop_legacy.sql upgrade
apply supabase/migrations/0021_drop_legacy.sql upgrade
echo "   (aplicada dos veces, con piezas dentro)"
CHECK_DB=upgrade check "la columna category ya no existe" "0" \
  "select count(*) from information_schema.columns where table_name = 'hub_parts' and column_name = 'category';"
CHECK_DB=upgrade check "ni su indice" "0" "select count(*) from pg_indexes where indexname = 'hub_parts_category_idx';"
CHECK_DB=upgrade check "las piezas siguen clasificadas por category_id" "18" "select count(category_id) from hub_parts;"
CHECK_DB=upgrade check "search_products() ya no devuelve la columna category" "0" \
  "select count(*) from information_schema.parameters where specific_name like 'search_products%' and parameter_name = 'category';"
CHECK_DB=upgrade check "y sigue buscando sin acentos, con permiso para anon" "Batería AGM 70Ah" \
  "$(as_anon "select name from search_products(p_query := 'bateria');")"
CHECK_DB=upgrade check "anon sigue viendo el total de la busqueda" "18" \
  "$(as_anon 'select total_count from search_products(p_limit => 1);')"
CHECK_DB=upgrade check "una pieza nueva solo con category_id recibe su slug y su sku" "t" \
  "insert into hub_parts (category_id, name, brand, img_url, price, stock) values ((select id from product_categories order by id limit 1), 'Pieza nueva', 'X', 'x.jpg', 1, 1) returning slug = 'pieza-nueva-' || id and sku = 'XAH-' || lpad(id::text, 6, '0');"
CHECK_DB=upgrade check "get_site_stats() se borro" "0" "select count(*) from pg_proc where proname = 'get_site_stats';"
CHECK_DB=upgrade check "y la fila stats_mode, pero las cuentas y el retiro siguen" "0|2" \
  "select (select count(*) from site_settings where key = 'stats_mode') || '|' || (select count(*) from site_settings where key in ('bank_accounts', 'pickup_address'));"
CHECK_DB=upgrade check "el check de site_settings ya no menciona stats_mode" "0" \
  "select count(*) from pg_constraint where conname = 'site_settings_value_valid' and pg_get_constraintdef(oid) like '%stats_mode%';"
CHECK_DB=upgrade check "set_site_setting ya no acepta stats_mode" "ERROR:  Ese ajuste no existe: stats_mode." \
  "$(as_user '11111111-1111-1111-1111-111111111111' "select * from set_site_setting('stats_mode','\"real\"');")"

echo "→ Camino de actualizacion de la 0022: la base real ya tiene pedidos al migrar"
# Los pedidos anteriores no tienen cupon ni descuento: tienen que quedar igual, con
# descuento 0 y el total que ya tenian. Y create_order() tiene que seguir funcionando
# con la llamada de antes (sin el parametro nuevo), que es lo que hace un frontend que
# todavia no se ha actualizado.
CHECK_DB=upgrade check "antes de migrar hay pedidos y ninguna columna de descuento" "true|0" \
  "select ((select count(*) from orders) > 0)::text || '|' || (select count(*) from information_schema.columns where table_name = 'orders' and column_name = 'discount');"
UP_TOTALS="$(SCALAR_DB=upgrade scalar "select string_agg(order_number || '=' || total, ',' order by order_number) from orders;")"
apply supabase/migrations/0022_coupons.sql upgrade
apply supabase/migrations/0022_coupons.sql upgrade
echo "   (aplicada dos veces, con pedidos dentro)"
CHECK_DB=upgrade check "los pedidos viejos conservan su total" "$UP_TOTALS" \
  "select string_agg(order_number || '=' || total, ',' order by order_number) from orders;"
CHECK_DB=upgrade check "con descuento 0 y sin cupon" "0|0" \
  "select (select count(*) from orders where discount <> 0) || '|' || (select count(*) from orders where coupon_id is not null or coupon_code is not null);"
CHECK_DB=upgrade check "queda una sola create_order" "1" "select count(*) from pg_proc where proname = 'create_order';"
CHECK_DB=upgrade check "la llamada de antes (sin cupon) sigue funcionando y no descuenta" "0.00|-" \
  "$(as_anon "select discount || '|' || coalesce(coupon_code, '-') from create_order('v@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 1, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"
CHECK_DB=upgrade check "la tabla de cupones existe y anon no la lee" "ERROR:  permission denied for table coupons" \
  "$(as_anon 'select count(*) from coupons;')"
CHECK_DB=upgrade check "un cupon creado despues de migrar se aplica al pedido" "true" \
  "insert into coupons (code, discount_type, discount_value) values ('ACTUALIZA', 'percent', 10); $(as_anon "select (discount > 0)::text from create_order('w@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 1, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago', p_coupon_code => 'ACTUALIZA');")"

echo "→ Camino de actualizacion de la 0023: la base real ya tiene piezas y pedidos al migrar"
# Las piezas y los pedidos anteriores no tienen opciones: tienen que quedar igual (sin
# opciones, con el mismo stock) y create_order() tiene que seguir aceptando la llamada de
# antes, que es lo que hace un frontend que todavia no se ha actualizado.
CHECK_DB=upgrade check "antes de migrar no existe product_variants" "0" \
  "select count(*) from information_schema.tables where table_name = 'product_variants';"
UP_STOCK="$(SCALAR_DB=upgrade scalar "select string_agg(id || '=' || stock, ',' order by id) from hub_parts;")"
UP_TOTALS23="$(SCALAR_DB=upgrade scalar "select string_agg(order_number || '=' || total, ',' order by order_number) from orders;")"
apply supabase/migrations/0023_product_variants.sql upgrade
apply supabase/migrations/0023_product_variants.sql upgrade
echo "   (aplicada dos veces, con piezas y pedidos dentro)"
CHECK_DB=upgrade check "ninguna pieza tiene opciones y el stock no se movio" "0|$UP_STOCK" \
  "select (select count(*) from hub_parts where has_variants) || '|' || (select string_agg(id || '=' || stock, ',' order by id) from hub_parts);"
CHECK_DB=upgrade check "los pedidos viejos conservan su total y sus lineas no tienen opcion" "$UP_TOTALS23|0" \
  "select (select string_agg(order_number || '=' || total, ',' order by order_number) from orders) || '|' || (select count(*) from order_items where variant_id is not null);"
CHECK_DB=upgrade check "queda una sola create_order y una sola search_products" "1|1" \
  "select (select count(*) from pg_proc where proname = 'create_order') || '|' || (select count(*) from pg_proc where proname = 'search_products');"
CHECK_DB=upgrade check "la llamada de antes (sin opciones) sigue funcionando" "0.00" \
  "$(as_anon "select discount from create_order('v@x.com', 'Cliente', 'Calle 1', 'standard', 'transfer', '[{\"part_id\": 1, \"quantity\": 1}]'::jsonb, p_contact_phone => '8095550000', p_province => 'Santiago');")"
CHECK_DB=upgrade check "search_products ya devuelve has_variants" "false" \
  "$(as_anon "select has_variants::text from search_products(p_limit => 1);")"
CHECK_DB=upgrade check "una opcion creada despues de migrar suma al producto" "true|3" \
  "insert into product_variants (product_id, name, stock) values (1, 'Unica', 3); select has_variants::text || '|' || stock from hub_parts where id = 1;"

echo "→ Camino de actualizacion de la 0024: la base real ya tiene usuarios al migrar"
CHECK_DB=upgrade check "antes de migrar no existe push_subscriptions" "0" \
  "select count(*) from information_schema.tables where table_name = 'push_subscriptions';"
apply supabase/migrations/0024_push_subscriptions.sql upgrade
apply supabase/migrations/0024_push_subscriptions.sql upgrade
echo "   (aplicada dos veces, con usuarios dentro)"
CHECK_DB=upgrade check "la tabla queda vacia y la funcion existe una sola vez" "0|1" \
  "select (select count(*) from push_subscriptions) || '|' || (select count(*) from pg_proc where proname = 'register_push_subscription');"

echo "→ Camino de actualizacion de la 0025: la base real ya tiene opciones al migrar"
# Las opciones que ya existian no tienen foto: tienen que quedar igual, con image_url nulo.
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into product_variants (product_id, name, stock) values (1, 'Anterior', 2) on conflict do nothing;
SQL
CHECK_DB=upgrade check "antes de migrar no existe image_url" "0" \
  "select count(*) from information_schema.columns where table_name = 'product_variants' and column_name = 'image_url';"
apply supabase/migrations/0025_variant_images.sql upgrade
apply supabase/migrations/0025_variant_images.sql upgrade
echo "   (aplicada dos veces, con opciones dentro)"
CHECK_DB=upgrade check "las opciones de antes siguen ahi, sin foto" "true|0" \
  "select (count(*) > 0)::text || '|' || count(image_url) from product_variants;"
CHECK_DB=upgrade check "y una foto se guarda despues de migrar" "assets/imgs/x.jpg" \
  "update product_variants set image_url = 'assets/imgs/x.jpg' where name = 'Anterior'; select image_url from product_variants where name = 'Anterior';"

echo "→ Camino de actualizacion de la 0026: la base real ya tiene catalogo, pedidos y cuentas al migrar"
CHECK_DB=upgrade check "antes de migrar no existe site_rebuild" "0"   "select count(*) from information_schema.tables where table_name = 'site_rebuild';"
apply supabase/migrations/0026_site_rebuild.sql upgrade
apply supabase/migrations/0026_site_rebuild.sql upgrade
echo "   (aplicada dos veces, con catalogo dentro)"
CHECK_DB=upgrade check "queda una sola fila de estado, sin nada pendiente, y la migracion no la marco" "1|false"   "select (select count(*) from site_rebuild) || '|' || (select (dirty_since is not null)::text from site_rebuild);"
CHECK_DB=upgrade check "un solo trabajo de cron y una sola fire_site_rebuild" "1|1"   "select (select count(*) from cron.job where jobname = 'site-rebuild') || '|' || (select count(*) from pg_proc where proname = 'fire_site_rebuild');"
CHECK_DB=upgrade check "cambiar un precio despues de migrar si marca" "true"   "update hub_parts set price = price + 1 where id = 1; select (dirty_since is not null)::text from site_rebuild;"

echo "→ Camino de actualizacion de la 0027: la base real ya tiene la 0026 y resenas al migrar"
apply supabase/migrations/0027_site_rebuild_panel.sql upgrade
apply supabase/migrations/0027_site_rebuild_panel.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "queda un solo trigger de resenas y una sola de cada funcion" "1|1|1" \
  "select (select count(*) from pg_trigger where tgname = 'reviews_mark_site_dirty') || '|' || (select count(*) from pg_proc where proname = 'site_rebuild_status') || '|' || (select count(*) from pg_proc where proname = 'request_site_rebuild');"

echo "→ Camino de actualizacion de la 0028: la base real ya tiene pedidos y citas al migrar"
apply supabase/migrations/0028_push_from_database.sql upgrade
apply supabase/migrations/0028_push_from_database.sql upgrade
echo "   (aplicada dos veces, con pedidos dentro)"
CHECK_DB=upgrade check "un trigger en pedidos, uno en citas y una sola funcion" "1|1|1" \
  "select (select count(*) from pg_trigger where tgname = 'orders_notify_status') || '|' || (select count(*) from pg_trigger where tgname = 'service_appointments_notify_status') || '|' || (select count(*) from pg_proc where proname = 'notify_status_change');"
CHECK_DB=upgrade check "los pedidos de antes siguen ahi y migrar no los toco" "true" \
  "select (count(*) > 0)::text from orders;"

echo "→ Camino de actualizacion de la 0029: la base real ya tiene vehiculos y publicaciones al migrar"
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into auto_hub_vehicles (brand, model, year, price, color, mileage, chasis_type, doors, traction, fuel, cylinders, location, contact)
values ('Toyota', 'Corolla', 2020, 1000000, 'Gris', 40000, 'sedan', 4, 'fwd', 'gasoline', 4, 'Santo Domingo', '8095550134');
SQL
apply supabase/migrations/0029_site_rebuild_community.sql upgrade
apply supabase/migrations/0029_site_rebuild_community.sql upgrade
echo "   (aplicada dos veces, con vehiculos y publicaciones dentro)"
CHECK_DB=upgrade check "un trigger en cada tabla, sin duplicar" "1|1" \
  "select (select count(*) from pg_trigger where tgname = 'auto_hub_vehicles_mark_site_dirty') || '|' || (select count(*) from pg_trigger where tgname = 'hub_market_items_mark_site_dirty');"
CHECK_DB=upgrade check "el vehiculo de antes sigue ahi, y migrar no lo toco" "1" "select count(*) from auto_hub_vehicles;"
CHECK_DB=upgrade check "un cambio en un vehiculo despues de migrar marca el sitio" "true" \
  "update site_rebuild set dirty_since = null; update auto_hub_vehicles set price = price + 1 where id = (select min(id) from auto_hub_vehicles); select (dirty_since is not null)::text from site_rebuild;"

echo "→ Camino de actualizacion de la 0030: la base real ya tiene publicaciones al migrar"
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into hub_market_items (seller_name, title, price, location, category, status)
values ('Dueno', 'Publicacion de antes', 1500, 'Santiago', 'piezas', 'aprobado');
SQL
apply supabase/migrations/0030_publication_lifecycle.sql upgrade
apply supabase/migrations/0030_publication_lifecycle.sql upgrade
echo "   (aplicada dos veces, con publicaciones dentro)"
CHECK_DB=upgrade check "la publicacion de antes recibe 60 dias desde la migracion y sigue a la venta" "true|true"   "select (expires_at > now() + interval '59 days')::text || '|' || (sold_at is null)::text from hub_market_items where title = 'Publicacion de antes';"
CHECK_DB=upgrade check "el cron de caducidad queda una sola vez" "1"   "select count(*) from cron.job where jobname = 'expire-publications';"
CHECK_DB=upgrade check "marcar vendida funciona sobre lo que ya habia" "true"   "set request.jwt.claim.role='service_role'; update hub_market_items set sold_at = now() where title = 'Publicacion de antes'; select (sold_at is not null)::text from hub_market_items where title = 'Publicacion de antes';"

echo "→ Camino de actualizacion de la 0031: la base real ya tiene publicaciones con plazo al migrar"
apply supabase/migrations/0031_publication_expiry_notice.sql upgrade
apply supabase/migrations/0031_publication_expiry_notice.sql upgrade
echo "   (aplicada dos veces, con publicaciones dentro)"
CHECK_DB=upgrade check "la tabla de avisos queda vacia y el cron una sola vez" "0|1"   "select (select count(*) from publication_expiry_notices) || '|' || (select count(*) from cron.job where jobname = 'warn-expiring-publications');"
CHECK_DB=upgrade check "sin secretos del Vault no avisa, y la publicacion de antes sigue ahi" "sin enlace de avisos: no se aviso a nadie|1"   "select warn_expiring_publications() || '|' || (select count(*) from hub_market_items where title = 'Publicacion de antes');"

echo "→ Camino de actualizacion de la 0032"
apply supabase/migrations/0032_deploy_failure_notice.sql upgrade
apply supabase/migrations/0032_deploy_failure_notice.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y el cron una sola vez" "0|1"   "select (select count(*) from deploy_alerts) || '|' || (select count(*) from cron.job where jobname = 'check-deploy-failures');"
CHECK_DB=upgrade check "sin secretos del Vault no pregunta" "sin enlace de avisos: no se pregunto por el despliegue"   "select check_deploy_failures();"

echo "→ Camino de actualizacion de la 0033: la base real ya tiene opciones con una foto"
$PSQL -d upgrade -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into product_variants (product_id, name, stock, image_url)
values ((select min(id) from hub_parts), 'Opcion de antes', 2, 'assets/imgs/antes.jpg'),
       ((select min(id) from hub_parts), 'Opcion sin foto', 1, null);
SQL
apply supabase/migrations/0033_variant_photos.sql upgrade
apply supabase/migrations/0033_variant_photos.sql upgrade
echo "   (aplicada dos veces, con opciones dentro)"
CHECK_DB=upgrade check "la foto de antes pasa a ser la primera de la lista, y la portada sigue igual" "{assets/imgs/antes.jpg}|assets/imgs/antes.jpg"   "select image_urls::text || '|' || image_url from product_variants where name = 'Opcion de antes';"
CHECK_DB=upgrade check "la opcion sin foto queda con la lista vacia" "{}"   "select image_urls::text from product_variants where name = 'Opcion sin foto';"
CHECK_DB=upgrade check "volver a aplicar no pisa lo que el panel guardo despues" "{x.jpg,y.jpg}"   "update product_variants set image_urls = array['x.jpg','y.jpg'] where name = 'Opcion de antes'; select image_urls::text from product_variants where name = 'Opcion de antes';"
CHECK_DB=upgrade check "y un solo trigger de fotos" "1"   "select count(*) from pg_trigger where tgname = 'product_variants_photos_sync';"

echo "→ Camino de actualizacion de la 0034"
apply supabase/migrations/0034_guest_order_push.sql upgrade
apply supabase/migrations/0034_guest_order_push.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y el trigger de avisos sigue una sola vez por tabla" "0|1|1" \
  "select (select count(*) from order_push_subscriptions) || '|' || (select count(*) from pg_trigger where tgname = 'orders_notify_status') || '|' || (select count(*) from pg_trigger where tgname = 'service_appointments_notify_status');"

echo "→ Camino de actualizacion de la 0035"
apply supabase/migrations/0035_guest_appointment_push.sql upgrade
apply supabase/migrations/0035_guest_appointment_push.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla de citas queda vacia y el trigger de avisos sigue una sola vez por tabla" "0|1|1" \
  "select (select count(*) from appointment_push_subscriptions) || '|' || (select count(*) from pg_trigger where tgname = 'orders_notify_status') || '|' || (select count(*) from pg_trigger where tgname = 'service_appointments_notify_status');"

echo "→ Camino de actualizacion de la 0036"
apply supabase/migrations/0036_appointment_reminders.sql upgrade
apply supabase/migrations/0036_appointment_reminders.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia, el cron una sola vez y sin secretos no recuerda" "0|1|sin enlace de avisos: no se recordo nada" \
  "select (select count(*) from appointment_reminders) || '|' || (select count(*) from cron.job where jobname = 'appointment-reminders') || '|' || send_appointment_reminders();"

echo "→ Camino de actualizacion de la 0037"
apply supabase/migrations/0037_push_hardening.sql upgrade
apply supabase/migrations/0037_push_hardening.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "is_push_endpoint existe y distingue" "true|false" \
  "select is_push_endpoint('https://fcm.googleapis.com/fcm/send/abc')::text || '|' || is_push_endpoint('https://servidor-ajeno.example/x')::text;"

echo "→ Favoritos (migracion 0038): cada quien los suyos"
PART_1="$(scalar "select id from hub_parts where not is_test order by id limit 1;")"
PART_2="$(scalar "select id from hub_parts where not is_test order by id offset 1 limit 1;")"
check "anon no tiene acceso a favoritos" 'ERROR:  permission denied for table favorites' \
  "$(as_anon 'select count(*) from favorites;')"
check "un usuario guarda un producto" "" \
  "$(as_user "$USER_A" "insert into favorites (user_id, part_id) values (auth.uid(), $PART_1);")"
check "y lo ve" "1" "$(as_user "$USER_A" 'select count(*) from favorites;')"
check "otro usuario no ve los favoritos ajenos" "0" "$(as_user "$USER_B" 'select count(*) from favorites;')"
check "nadie guarda en los favoritos de otro" \
  'ERROR:  new row violates row-level security policy for table "favorites"' \
  "$(as_user "$USER_B" "insert into favorites (user_id, part_id) values ('$USER_A', $PART_2);")"
check "el mismo producto no se guarda dos veces" \
  'ERROR:  duplicate key value violates unique constraint "favorites_pkey"' \
  "$(as_user "$USER_A" "insert into favorites (user_id, part_id) values (auth.uid(), $PART_1);")"
check "un favorito no se puede editar (no hay UPDATE)" 'ERROR:  permission denied for table favorites' \
  "$(as_user "$USER_A" "update favorites set part_id = $PART_2 where user_id = auth.uid();")"
scalar "$(as_user "$USER_B" "delete from favorites where user_id = '$USER_A';")" >/dev/null
check "otro usuario no borra el favorito ajeno" "1" "$(as_user "$USER_A" 'select count(*) from favorites;')"
scalar "$(as_user "$USER_A" "delete from favorites where part_id = $PART_1;")" >/dev/null
check "el dueno lo quita" "0" "$(as_user "$USER_A" 'select count(*) from favorites;')"
TEMP_PART="$(scalar "insert into hub_parts (name, brand, img_url, price) values ('Fav temporal', 'x', 'x.jpg', 1) returning id;")"
scalar "insert into favorites (user_id, part_id) values ('$USER_A', $TEMP_PART);" >/dev/null
scalar "delete from hub_parts where id = $TEMP_PART;" >/dev/null
check "borrar el producto se lleva sus favoritos" "0" "select count(*) from favorites where part_id = $TEMP_PART;"
scalar "insert into hub_parts (name, brand, img_url, price) select 'Fav ' || g, 'x', 'x.jpg', 1 from generate_series(1, 205) g;" >/dev/null
check "el limite de 200 favoritos se exige con un 22023" 'ERROR:  Llegaste al máximo de 200 favoritos. Quita alguno para guardar otro.' \
  "insert into favorites (user_id, part_id) select '$USER_B', id from hub_parts where name like 'Fav %' order by id limit 201;"
check "hasta 200 si caben" "0" "select count(*) from favorites where user_id = '$USER_B';"
scalar "delete from hub_parts where name like 'Fav %';" >/dev/null

echo "→ Camino de actualizacion de la 0038"
apply supabase/migrations/0038_favorites.sql upgrade
apply supabase/migrations/0038_favorites.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y con RLS" "0|true" \
  "select (select count(*) from favorites) || '|' || (select relrowsecurity from pg_class where relname = 'favorites')::text;"

echo "→ Camino de actualizacion de la 0039"
apply supabase/migrations/0039_favorites_part_index.sql upgrade
apply supabase/migrations/0039_favorites_part_index.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "el indice de favorites.part_id existe" "1"   "select count(*) from pg_indexes where indexname = 'favorites_part_idx';"

echo "→ IA: base comun (migracion 0050)"
check "anon no lee ai_usage" 'ERROR:  permission denied for table ai_usage' "$(as_anon 'select count(*) from ai_usage;')"
check "anon no lee ai_rate_limits" 'ERROR:  permission denied for table ai_rate_limits' "$(as_anon 'select count(*) from ai_rate_limits;')"
check "anon no lee ai_query_cache" 'ERROR:  permission denied for table ai_query_cache' "$(as_anon 'select count(*) from ai_query_cache;')"
check "un usuario normal no lee ai_query_cache" 'ERROR:  permission denied for table ai_query_cache' "$(as_user "$USER_A" 'select count(*) from ai_query_cache;')"
check "un usuario normal no lee ai_rate_limits" 'ERROR:  permission denied for table ai_rate_limits' "$(as_user "$USER_A" 'select count(*) from ai_rate_limits;')"
scalar "insert into ai_usage (feature, model, cost_usd) values ('search', 'haiku', 0.5);" >/dev/null
check "un usuario normal ve 0 filas de ai_usage (RLS)" "0" "$(as_user "$USER_A" 'select count(*) from ai_usage;')"
check "un admin si lee ai_usage" "1" "$(as_user "$ADMIN" 'select count(*) from ai_usage;')"
check "nadie escribe ai_usage por su cuenta (usuario)" 'ERROR:  permission denied for table ai_usage' \
  "$(as_user "$USER_A" "insert into ai_usage (feature, model) values ('search', 'x');")"
check "ni un admin escribe ai_usage desde el navegador" 'ERROR:  permission denied for table ai_usage' \
  "$(as_user "$ADMIN" "insert into ai_usage (feature, model) values ('search', 'x');")"
check "ni anon" 'ERROR:  permission denied for table ai_usage' "$(as_anon "insert into ai_usage (feature, model) values ('search', 'x');")"
check "anon no invoca ai_budget_status" "$(denied ai_budget_status)" "$(as_anon 'select ai_budget_status();')"
check "un admin tampoco: es de la edge (service_role)" "$(denied ai_budget_status)" "$(as_user "$ADMIN" 'select ai_budget_status();')"
check "anon no invoca ai_rate_check" "$(denied ai_rate_check)" "$(as_anon "select ai_rate_check('k', 60, 5);")"
check "un usuario no invoca ai_rate_check" "$(denied ai_rate_check)" "$(as_user "$USER_A" "select ai_rate_check('k', 60, 5);")"
check "anon no invoca ai_admin_overview" "$(denied ai_admin_overview)" "$(as_anon 'select ai_admin_overview();')"
check "un usuario normal recibe el rechazo de ai_admin_overview" "ERROR:  Solo un administrador puede ver el uso de la IA." "$(as_user "$USER_A" 'select ai_admin_overview();')"
check "un admin recibe el resumen con el presupuesto" "true" "$(as_user "$ADMIN" "select (ai_admin_overview()->'budget'->>'cap_usd' = '25')::text;")"

check "los ajustes de IA nacen: interruptor general, 11 funciones, auto-ocultar y dos topes" "15" \
  "select count(*) from site_settings where key like 'ai\\_%' or key = 'maps_monthly_cap_usd';"
check "anon lee los ajustes (interruptores, no secretos)" "true" "$(as_anon "select (value = 'true'::jsonb)::text from site_settings where key = 'ai_enabled';")"
check "un typo en un interruptor se rechaza (debe ser booleano)" 'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_ai_valid"' \
  "update site_settings set value = '\"si\"' where key = 'ai_feature_search';"
check "un tope negativo se rechaza" 'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_ai_caps_valid"' \
  "update site_settings set value = '-1' where key = 'ai_monthly_cap_usd';"
check "un admin cambia el tope con set_site_setting" "40" \
  "$(as_user "$ADMIN" "select value::text from set_site_setting('ai_monthly_cap_usd', '40');")"
check "un usuario normal no" "ERROR:  Solo un administrador puede cambiar los ajustes del sitio." \
  "$(as_user "$USER_A" "select set_site_setting('ai_monthly_cap_usd', '1');")"
scalar "update site_settings set value = '25' where key = 'ai_monthly_cap_usd';" >/dev/null

# El tope: gasto del mes contra el tope, con los cuatro tiers.
scalar "delete from ai_usage;" >/dev/null
check "sin gasto: ok y lo publico cabe" "ok|true" "set role service_role; select tier || '|' || public_ok::text from ai_budget_status('ai');"
check "a 80 %: aviso" "aviso" "insert into ai_usage (feature, model, cost_usd) values ('catalog_ingest', 'sonnet', 20); set role service_role; select tier from ai_budget_status('ai');"
check "a 90 %: sin_publico" "sin_publico" "insert into ai_usage (feature, model, cost_usd) values ('catalog_ingest', 'sonnet', 2.5); set role service_role; select tier from ai_budget_status('ai');"
check "a 100 %: apagado" "apagado" "insert into ai_usage (feature, model, cost_usd) values ('catalog_ingest', 'sonnet', 2.5); set role service_role; select tier from ai_budget_status('ai');"
scalar "delete from ai_usage;" >/dev/null
check "lo publico (search) no pasa del 30 % aunque el total sea bajo" "ok|false" \
  "insert into ai_usage (feature, model, cost_usd) values ('search', 'haiku', 8); set role service_role; select tier || '|' || public_ok::text from ai_budget_status('ai');"
scalar "delete from ai_usage;" >/dev/null
check "Maps cuenta aparte: un gasto maps_* no mueve el tope de IA" "ok|0" \
  "insert into ai_usage (feature, model, cost_usd) values ('maps_geocode', 'google', 9); set role service_role; select tier || '|' || spent_usd::int from ai_budget_status('ai');"
check "y mueve el suyo (9 de 10 = 90 %: sin_publico)" "sin_publico" "set role service_role; select tier from ai_budget_status('maps');"
check "un gasto del mes pasado no cuenta" "0" \
  "delete from ai_usage; insert into ai_usage (feature, model, cost_usd, created_at) values ('seo', 'haiku', 99, now() - interval '40 days'); set role service_role; select spent_usd::int from ai_budget_status('ai');"
scalar "delete from ai_usage;" >/dev/null

# El limite por ventana.
check "ai_rate_check deja pasar hasta el maximo" "true|true|true" \
  "set role service_role; select ai_rate_check('t1', 60, 3)::text || '|' || ai_rate_check('t1', 60, 3)::text || '|' || ai_rate_check('t1', 60, 3)::text;"
check "y corta la cuarta" "false" "set role service_role; select ai_rate_check('t1', 60, 3)::text;"
check "otra clave tiene su propia cuenta" "true" "set role service_role; select ai_rate_check('t2', 60, 3)::text;"
check "una ventana nueva reinicia la cuenta" "true" \
  "update ai_rate_limits set window_start = window_start - interval '2 minutes' where key = 't1'; set role service_role; select ai_rate_check('t1', 60, 3)::text;"
check "un limite mal configurado es un error, no un pase libre" "ERROR:  Límite mal configurado." "set role service_role; select ai_rate_check('t3', 0, 3);"
scalar "delete from ai_rate_limits;" >/dev/null

check "la limpieza borra lo vencido y deja lo vigente" "1|1" \
  "insert into ai_query_cache (key, value, expires_at) values ('viejo', '1', now() - interval '1 day'), ('vigente', '1', now() + interval '1 day'); insert into ai_rate_limits (key, window_start, count) values ('viejo', now() - interval '3 days', 1), ('nuevo', now(), 1); select ai_housekeeping(); select (select count(*) from ai_query_cache) || '|' || (select count(*) from ai_rate_limits);"
check "el cron de limpieza esta programado, una sola vez" "1" "select count(*) from cron.job where jobname = 'ai-housekeeping' and command like '%ai_housekeeping%';"
scalar "delete from ai_query_cache; delete from ai_rate_limits;" >/dev/null

echo "→ Camino de actualizacion de la 0050"
apply supabase/migrations/0050_ai_core.sql upgrade
apply supabase/migrations/0050_ai_core.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "los ajustes de IA siguen siendo 15 tras aplicarla otra vez" "15" \
  "select count(*) from site_settings where key like 'ai\\_%' or key = 'maps_monthly_cap_usd';"

echo "→ IA: numero de parte y borradores de producto (migracion 0051)"
check "el numero se normaliza (sin guiones, espacios ni minusculas) y las equivalencias se limpian" "0446502220|{C110,TOY044650222}" \
  "insert into hub_parts (name, brand, img_url, price, part_number, cross_refs) values ('QQ Pastillas Corolla', 'Toyota', 'x.jpg', 1500, ' 04465-02220 ', array['c-110','C110 ','toy 04465 0222 ','  ']); select part_number_norm || '|' || (select array_agg(x order by x) from unnest(cross_refs_norm) x)::text from hub_parts where name = 'QQ Pastillas Corolla';"
check "el numero principal queda recortado, no cambiado" "04465-02220" "select part_number from hub_parts where name = 'QQ Pastillas Corolla';"
check "un numero de un solo caracter se rechaza" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_part_number_check"' \
  "insert into hub_parts (name, brand, img_url, price, part_number) values ('QQ Mal numero', 'M', 'x.jpg', 100, 'A');"
check "un numero en blanco queda nulo" "" \
  "insert into hub_parts (name, brand, img_url, price, part_number) values ('QQ Sin numero', 'M', 'x.jpg', 100, '   '); select coalesce(part_number, '') from hub_parts where name = 'QQ Sin numero';"
check "mas de 30 equivalencias se rechaza" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_cross_refs_check"' \
  "insert into hub_parts (name, brand, img_url, price, cross_refs) values ('QQ Muchas', 'M', 'x.jpg', 100, (select array_agg('R' || g) from generate_series(1, 31) g));"
check "cambiar el numero re-normaliza" "ABC123" "update hub_parts set part_number = 'abc-123' where name = 'QQ Pastillas Corolla'; select part_number_norm from hub_parts where name = 'QQ Pastillas Corolla';"
scalar "update hub_parts set part_number = '04465-02220' where name = 'QQ Pastillas Corolla';" >/dev/null

check "buscar el numero exacto con guion lo encuentra de primero" "QQ Pastillas Corolla" "$(as_anon "select name from search_products(p_query => '04465-02220', p_limit => 1);")"
check "con espacios en vez de guion tambien" "QQ Pastillas Corolla" "$(as_anon "select name from search_products(p_query => '04465 02220', p_limit => 1);")"
check "sin separadores tambien" "QQ Pastillas Corolla" "$(as_anon "select name from search_products(p_query => '0446502220', p_limit => 1);")"
check "una equivalencia tambien encuentra la pieza" "QQ Pastillas Corolla" "$(as_anon "select name from search_products(p_query => 'c-110', p_limit => 1);")"
check "el numero exacto le gana a un texto que tambien coincide" "QQ Pastillas Corolla" \
  "insert into hub_parts (name, brand, img_url, price, short_description) values ('QQ Otro con 0446502220 en el texto', 'M', 'x.jpg', 100, '0446502220'); $(as_anon "select name from search_products(p_query => '0446502220', p_limit => 1);")"
check "suggest_products sugiere por numero de parte" "QQ Pastillas Corolla" "$(as_anon "select name from suggest_products('04465-02220', 1);")"
check "la busqueda de texto de antes sigue igual: sin consulta, devuelve todo lo visible" "true" \
  "$(as_anon 'select ((select total_count from search_products(p_limit => 1)) = (select count(*) from hub_parts))::text;')"
check "search_products sigue siendo security invoker" "false" "select prosecdef::text from pg_proc where proname = 'search_products';"
scalar "delete from hub_parts where name like 'QQ Otro con%';" >/dev/null

check "ai_find_duplicate_product: mismo numero y marca" "$(scalar "select id from hub_parts where name = 'QQ Pastillas Corolla';" | tail -1)" \
  "set role service_role; select ai_find_duplicate_product('Otro nombre', 'toyota', 'C 110');"
check "otra marca con el mismo numero no es duplicado" "" \
  "set role service_role; select coalesce(ai_find_duplicate_product('Otro nombre', 'Brembo', '04465-02220')::text, '');"
check "por nombre parecido y misma marca" "$(scalar "select id from hub_parts where name = 'QQ Pastillas Corolla';" | tail -1)" \
  "set role service_role; select ai_find_duplicate_product('QQ Pastillas Corolla', 'Toyota', null);"
check "un nombre distinto no es duplicado" "" \
  "set role service_role; select coalesce(ai_find_duplicate_product('Faro trasero LED universal', 'Toyota', null)::text, '');"
check "anon no invoca ai_find_duplicate_product" "$(denied ai_find_duplicate_product)" "$(as_anon "select ai_find_duplicate_product('x', 'y', 'z');")"
check "un admin tampoco (es de la edge)" "$(denied ai_find_duplicate_product)" "$(as_user "$ADMIN" "select ai_find_duplicate_product('x', 'y', 'z');")"

AI_PATH='aaaa/lote/frente.jpg'
check "anon no lee los borradores" 'ERROR:  permission denied for table ai_product_drafts' "$(as_anon 'select count(*) from ai_product_drafts;')"
check "un admin crea un borrador en cola, a su nombre" "queued" \
  "$(as_user "$ADMIN" "insert into ai_product_drafts (created_by, source_paths) values ('$ADMIN', array['$ADMIN/lote/frente.jpg']) returning status;")"
check "un usuario normal no ve borradores (RLS)" "0" "$(as_user "$USER_A" 'select count(*) from ai_product_drafts;')"
check "un usuario normal no crea borradores" 'ERROR:  new row violates row-level security policy for table "ai_product_drafts"' \
  "$(as_user "$USER_A" "insert into ai_product_drafts (created_by, source_paths) values ('$USER_A', array['x/y.jpg']);")"
check "un admin no crea un borrador a nombre de otro" 'ERROR:  new row violates row-level security policy for table "ai_product_drafts"' \
  "$(as_user "$ADMIN" "insert into ai_product_drafts (created_by, source_paths) values ('$USER_A', array['x/y.jpg']);")"
check "ni uno que nazca ya aprobado" 'ERROR:  new row violates row-level security policy for table "ai_product_drafts"' \
  "$(as_user "$ADMIN" "insert into ai_product_drafts (created_by, source_paths, status) values ('$ADMIN', array['x/y.jpg'], 'approved');")"
check "un borrador sin fotos se rechaza" 'ERROR:  new row for relation "ai_product_drafts" violates check constraint "ai_product_drafts_source_paths_check"' \
  "$(as_user "$ADMIN" "insert into ai_product_drafts (created_by, source_paths) values ('$ADMIN', '{}');")"
check "con mas de 8 fotos tampoco" 'ERROR:  new row for relation "ai_product_drafts" violates check constraint "ai_product_drafts_source_paths_check"' \
  "$(as_user "$ADMIN" "insert into ai_product_drafts (created_by, source_paths) values ('$ADMIN', array['1','2','3','4','5','6','7','8','9']);")"
check "un usuario normal no actualiza (RLS: 0 filas)" "0" \
  "$(as_user "$USER_A" "with u as (update ai_product_drafts set status = 'rejected' returning 1) select count(*) from u;")"

AI_DRAFT="$(scalar "select id from ai_product_drafts limit 1;" | tail -1)"
AI_PART="$(scalar "select id from hub_parts where name = 'QQ Pastillas Corolla';" | tail -1)"
check "aprobar sin producto se rechaza" "ERROR:  Un borrador aprobado tiene que apuntar al producto que se creó." \
  "$(as_user "$ADMIN" "update ai_product_drafts set status = 'approved' where id = '$AI_DRAFT';")"
check "con un posible duplicado no se aprueba hasta confirmar" "ERROR:  Este borrador parece un duplicado: confirma que es otro artículo antes de aprobarlo." \
  "update ai_product_drafts set duplicate_of = $AI_PART where id = '$AI_DRAFT'; $(as_user "$ADMIN" "update ai_product_drafts set status = 'approved', product_id = $AI_PART where id = '$AI_DRAFT';")"
check "confirmando que es otro articulo, se aprueba y queda la fecha de revision" "approved|true" \
  "$(as_user "$ADMIN" "update ai_product_drafts set status = 'approved', product_id = $AI_PART, duplicate_confirmed = true, edited_fields = array['name'], fields = '{\"name\": {\"value\": \"A\", \"confidence\": \"alta\"}, \"brand\": {\"value\": \"B\", \"confidence\": \"alta\"}}', final_fields = '{}' where id = '$AI_DRAFT' returning status || '|' || (reviewed_at is not null)::text;")"
check "borrar un producto no borra el borrador (queda sin enlace)" "1|" \
  "delete from hub_parts where name = 'QQ Pastillas Corolla'; select count(*) || '|' || coalesce((select product_id::text from ai_product_drafts where id = '$AI_DRAFT'), '') from ai_product_drafts where id = '$AI_DRAFT';"

check "la precision por campo: el nombre se corrigio (0 %), la marca no (100 %)" "brand|1|1|100.0;name|1|0|0.0" \
  "$(as_user "$ADMIN" "select string_agg(field || '|' || total || '|' || unchanged || '|' || pct, ';' order by field) from ai_catalog_accuracy();")"
check "un usuario normal no ve la precision" "ERROR:  Solo un administrador puede ver la precisión del catálogo asistido." "$(as_user "$USER_A" 'select * from ai_catalog_accuracy();')"
check "anon no invoca la precision" "$(denied ai_catalog_accuracy)" "$(as_anon 'select * from ai_catalog_accuracy();')"
scalar "delete from ai_product_drafts;" >/dev/null

check "el bucket de origen es privado" "false" "select public::text from storage.buckets where id = 'ai-product-sources';"
check "un admin sube a su carpeta" "1" \
  "$(as_user "$ADMIN" "insert into storage.objects (bucket_id, name) values ('ai-product-sources', '$ADMIN/lote/a.jpg'); select count(*) from storage.objects where bucket_id = 'ai-product-sources';")"
check "un admin no sube a la carpeta de otro" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_user "$ADMIN" "insert into storage.objects (bucket_id, name) values ('ai-product-sources', '$USER_A/lote/a.jpg');")"
check "un usuario normal no sube" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_user "$USER_A" "insert into storage.objects (bucket_id, name) values ('ai-product-sources', '$USER_A/lote/a.jpg');")"
check "anon no sube" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('ai-product-sources', 'x/a.jpg');")"
check "un usuario normal no ve las fotos de origen" "0" "$(as_user "$USER_A" "select count(*) from storage.objects where bucket_id = 'ai-product-sources';")"
check "un admin si" "1" "$(as_user "$ADMIN" "select count(*) from storage.objects where bucket_id = 'ai-product-sources';")"
scalar "delete from storage.objects where bucket_id = 'ai-product-sources';" >/dev/null

echo "→ Camino de actualizacion de la 0051 (el vector de busqueda se rehace una sola vez)"
# La base de actualizacion venia en la 0039: la 0051 parcha suggest_products (0042) y necesita lo que va entre medias.
for migration in supabase/migrations/004[0-9]_*.sql supabase/migrations/0050_*.sql; do
  apply "$migration" upgrade
done
apply supabase/migrations/0051_ai_product_drafts.sql upgrade
apply supabase/migrations/0051_ai_product_drafts.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "el vector de busqueda lleva el numero de parte" "1" \
  "select count(*) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum where d.adrelid = 'public.hub_parts'::regclass and a.attname = 'search_vector' and pg_get_expr(d.adbin, d.adrelid) like '%xah_norm_part%';"
CHECK_DB=upgrade check "un solo indice del vector" "1" "select count(*) from pg_indexes where indexname = 'hub_parts_search_vector_idx';"
CHECK_DB=upgrade check "search_products se parcheo una sola vez" "1" \
  "select (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid), 'p.cross_refs_norm @>', ''))) / length('p.cross_refs_norm @>') - 1 from pg_proc where proname = 'search_products';"

echo "→ IA: verificacion de comprobantes (migracion 0052)"
PC_TOTAL="$(scalar "select total from orders where id = '$ORD_T';" | tail -1)"
PC_DATE="$(scalar "select (created_at at time zone 'America/Santo_Domingo')::date from orders where id = '$ORD_T';" | tail -1)"
scalar "update site_settings set value = '[{\"bank\": \"Banreservas\", \"holder\": \"X AutoHub SRL\", \"number\": \"960-123-4821\", \"type\": \"Corriente\"}, {\"bank\": \"Ejemplo\", \"holder\": \"x\", \"number\": \"000-0000-9999\", \"type\": \"c\", \"is_example\": true}]'::jsonb where key = 'bank_accounts';" >/dev/null
cmp() { echo "set role service_role; select ai_proof_compare('$ORD_T', '$1', $2, $3, $4, $5, $6, $7)->>'verdict' || '|' || array_to_string(array(select jsonb_array_elements_text(ai_proof_compare('$ORD_T', '$1', $2, $3, $4, $5, $6, $7)->'flags')), ',');"; }

check "todo coincide: monto, cuenta, fecha y referencia nueva" "coincide|" "$(cmp comprobante false "$PC_TOTAL" "'DOP'" "'4821'" "'$PC_DATE'" "'hash-nuevo'")"
check "un monto distinto: revisar" "revisar|monto_distinto" "$(cmp comprobante false "$PC_TOTAL + 100" "'DOP'" "'4821'" "'$PC_DATE'" "'hash-nuevo'")"
check "sin monto legible: revisar" "revisar|monto_ilegible" "$(cmp comprobante false null "'DOP'" "'4821'" "'$PC_DATE'" "'hash-nuevo'")"
check "una cuenta de destino que no es de X AutoHub: revisar" "revisar|destino_distinto" "$(cmp comprobante false "$PC_TOTAL" "'DOP'" "'1111'" "'$PC_DATE'" "'hash-nuevo'")"
check "la cuenta de ejemplo no cuenta como de X AutoHub" "revisar|destino_distinto" "$(cmp comprobante false "$PC_TOTAL" "'DOP'" "'9999'" "'$PC_DATE'" "'hash-nuevo'")"
check "una moneda distinta: revisar" "revisar|moneda_distinta" "$(cmp comprobante false "$PC_TOTAL" "'USD'" "'4821'" "'$PC_DATE'" "'hash-nuevo'")"
check "una fecha anterior al pedido: revisar" "revisar|fecha_anterior_al_pedido" "$(cmp comprobante false "$PC_TOTAL" "'DOP'" "'4821'" "'$PC_DATE'::date - 3" "'hash-nuevo'")"
check "una fecha futura: revisar" "revisar|fecha_futura" "$(cmp comprobante false "$PC_TOTAL" "'DOP'" "'4821'" "current_date + 5" "'hash-nuevo'")"
check "sin referencia: revisar" "revisar|referencia_ausente" "$(cmp comprobante false "$PC_TOTAL" "'DOP'" "'4821'" "'$PC_DATE'" null)"
check "que parezca editada la manda a revisar aunque todo coincida" "revisar|parece_editada" "$(cmp comprobante true "$PC_TOTAL" "'DOP'" "'4821'" "'$PC_DATE'" "'hash-nuevo'")"
check "ilegible y 'no es comprobante' pasan tal cual, sin banderas" "ilegible|" "$(cmp ilegible false null null null null null)"
check "no es un comprobante" "no_es_comprobante|" "$(cmp no_es_comprobante false null null null null null)"
check "un pedido que no existe es un error" "ERROR:  Ese pedido no existe." "set role service_role; select ai_proof_compare('00000000-0000-0000-0000-000000000000', 'comprobante', false, 1, 'DOP', '4821', current_date, 'x');"

scalar "insert into order_proof_checks (order_id, proof_path, verdict, reference_hash) values ('$ORD_T', 'x/y.jpg', 'coincide', 'hash-repetido');" >/dev/null
ORD_OTHER="$(scalar "select id from orders where id <> '$ORD_T' order by created_at limit 1;" | tail -1)"
check "una referencia ya usada en OTRO pedido se marca repetida" "revisar|referencia_repetida" \
  "set role service_role; select ai_proof_compare('$ORD_OTHER', 'comprobante', false, (select total from orders where id = '$ORD_OTHER'), 'DOP', '4821', current_date, 'hash-repetido')->>'verdict' || '|' || array_to_string(array(select jsonb_array_elements_text(ai_proof_compare('$ORD_OTHER', 'comprobante', false, (select total from orders where id = '$ORD_OTHER'), 'DOP', '4821', current_date, 'hash-repetido')->'flags')), ',');"
check "releer el mismo pedido con la misma referencia no es repetida" "revisar|monto_distinto" \
  "set role service_role; select ai_proof_compare('$ORD_T', 'comprobante', false, 1, 'DOP', '4821', '$PC_DATE', 'hash-repetido')->>'verdict' || '|' || array_to_string(array(select jsonb_array_elements_text(ai_proof_compare('$ORD_T', 'comprobante', false, 1, 'DOP', '4821', '$PC_DATE', 'hash-repetido')->'flags')), ',');"

check "anon no invoca ai_proof_compare" "$(denied ai_proof_compare)" "$(as_anon "select ai_proof_compare('$ORD_T', 'comprobante', false, 1, 'DOP', '4821', current_date, 'x');")"
check "ni un admin (es de la edge)" "$(denied ai_proof_compare)" "$(as_user "$ADMIN" "select ai_proof_compare('$ORD_T', 'comprobante', false, 1, 'DOP', '4821', current_date, 'x');")"
check "anon no lee las verificaciones" 'ERROR:  permission denied for table order_proof_checks' "$(as_anon 'select count(*) from order_proof_checks;')"
check "un usuario normal ve 0 filas (RLS)" "0" "$(as_user "$USER_A" 'select count(*) from order_proof_checks;')"
check "un admin las lee" "1" "$(as_user "$ADMIN" 'select count(*) from order_proof_checks;')"
check "nadie las escribe desde el navegador (admin)" 'ERROR:  permission denied for table order_proof_checks' \
  "$(as_user "$ADMIN" "insert into order_proof_checks (order_id, proof_path, verdict) values ('$ORD_T', 'x', 'coincide');")"
check "un veredicto inventado se rechaza" 'ERROR:  new row for relation "order_proof_checks" violates check constraint "order_proof_checks_verdict_check"' \
  "insert into order_proof_checks (order_id, proof_path, verdict) values ('$ORD_T', 'x', 'pagado');"
check "un admin ve lo esperado de un pedido (total y cuentas con 4 digitos)" "true" \
  "$(as_user "$ADMIN" "select ((admin_order_expected('$ORD_T')->'accounts'->0->>'last4') = '4821' and jsonb_array_length(admin_order_expected('$ORD_T')->'accounts') = 1)::text;")"
check "un usuario normal no" "ERROR:  Solo un administrador puede ver esto." "$(as_user "$USER_A" "select admin_order_expected('$ORD_T');")"
check "anon no invoca admin_order_expected" "$(denied admin_order_expected)" "$(as_anon "select admin_order_expected('$ORD_T');")"

# El disparo: pg_net + Vault. Sin secretos no hace nada y no falla.
scalar "delete from net.calls;" >/dev/null
check "adjuntar un comprobante sin los secretos del Vault no falla ni llama" "0" \
  "update orders set payment_proof_url = '$ORD_T/prueba-1.jpg' where id = '$ORD_T'; select count(*) from net.calls;"
scalar "insert into vault.decrypted_secrets (name, decrypted_secret) values ('ai_functions_url', 'https://f.example/functions/v1/'), ('ai_cron_secret', 'cron-s3'), ('send_push_anon_key', 'anon-key') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
check "con los secretos, un comprobante nuevo llama a ai-verify-proof con solo el id" "https://f.example/functions/v1/ai-verify-proof|{\"order_id\": \"$ORD_T\"}|cron-s3" \
  "update orders set payment_proof_url = '$ORD_T/prueba-2.jpg' where id = '$ORD_T'; select url || '|' || body::text || '|' || (headers->>'x-ai-secret') from net.calls order by id desc limit 1;"
check "cambiar otra cosa del pedido no vuelve a llamar" "1" "update orders set whatsapp_opened_at = now() where id = '$ORD_T'; select count(*) from net.calls;"
check "volver a poner la misma ruta tampoco" "1" "update orders set payment_proof_url = '$ORD_T/prueba-2.jpg' where id = '$ORD_T'; select count(*) from net.calls;"
check "quitar el comprobante (nulo) tampoco" "1" "update orders set payment_proof_url = null where id = '$ORD_T'; select count(*) from net.calls;"
scalar "delete from vault.decrypted_secrets where name in ('ai_functions_url', 'ai_cron_secret', 'send_push_anon_key'); delete from net.calls; delete from order_proof_checks;" >/dev/null

echo "→ Camino de actualizacion de la 0052"
apply supabase/migrations/0052_ai_proof_checks.sql upgrade
apply supabase/migrations/0052_ai_proof_checks.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y con RLS" "0|true" \
  "select (select count(*) from order_proof_checks) || '|' || (select relrowsecurity from pg_class where relname = 'order_proof_checks')::text;"

echo "→ IA: moderacion asistida (migracion 0053)"
MOD_PROD="$(scalar "select min(id) from hub_parts;" | tail -1)"
scalar "set request.jwt.claim.role = 'service_role'; update profiles set role = 'moderador' where id = '$USER_B'; reset request.jwt.claim.role;" >/dev/null
scalar "insert into social_posts (author_id, author_name, text) values ('$USER_A', 'Usuario A', 'QQ publicacion normal'), ('$USER_A', 'Usuario A', 'QQ publicacion de spam');" >/dev/null
MOD_POST="$(scalar "select id from social_posts where text = 'QQ publicacion de spam';" | tail -1)"
scalar "insert into social_post_comments (post_id, author_id, text) values ($MOD_POST, '$USER_A', 'QQ comentario danino');" >/dev/null
MOD_COMMENT="$(scalar "select id from social_post_comments where text = 'QQ comentario danino';" | tail -1)"
scalar "insert into reviews (target_type, target_id, user_id, rating, comment) values ('product', $MOD_PROD, '$USER_A', 5, 'QQ resena de spam');" >/dev/null
MOD_REVIEW="$(scalar "select id from reviews where comment = 'QQ resena de spam';" | tail -1)"
MOD_ITEM="$(scalar "select min(id) from hub_market_items;" | tail -1)"

save() { echo "set role service_role; select ai_save_moderation('$1', $2, '$3', array[$4]::text[], 'razon', '$5', $6, null, 'haiku', 0.001)->>'auto_action';"; }

check "alto + 0.95 + spam en una publicacion: se oculta" "oculto" "$(save social_post "$MOD_POST" alto "'spam'" rechazar 0.95)"
check "el publico ya no ve esa publicacion" "0" "$(as_anon "select count(*) from social_posts where id = $MOD_POST;")"
check "las demas siguen visibles" "true" "$(as_anon "select (count(*) >= 1)::text from social_posts where text = 'QQ publicacion normal';")"
check "su autor la sigue viendo (en revision)" "1" "$(as_user "$USER_A" "select count(*) from social_posts where id = $MOD_POST;")"
check "otro usuario no" "0" "$(as_user "$ADMIN" "select count(*) from social_posts where id = $MOD_POST and false;")"
check "un moderador la ve" "1" "$(as_user "$USER_B" "select count(*) from social_posts where id = $MOD_POST;")"
check "alto + 0.95 + estafa en un comentario: se oculta" "oculto" "$(save social_comment "$MOD_COMMENT" alto "'estafa'" rechazar 0.95)"
check "el comentario oculto no lo ve el publico" "0" "$(as_anon "select count(*) from social_post_comments where id = $MOD_COMMENT;")"
check "las estrellas cuentan la resena antes de ocultarla" "1" "select review_count from hub_parts where id = $MOD_PROD;"
check "alto + 0.95 + insultos graves en una resena: se oculta" "oculto" "$(save review "$MOD_REVIEW" alto "'insultos_graves'" rechazar 0.95)"
check "la resena oculta ya no cuenta en las estrellas ni en review_count" "0" "select review_count from hub_parts where id = $MOD_PROD;"
check "ni en review_stats()" "0" "$(as_anon "select total from review_stats('product', $MOD_PROD);")"
check "la resena oculta no la ve el publico" "0" "$(as_anon "select count(*) from reviews where id = $MOD_REVIEW;")"

scalar "update social_posts set hidden_by_ai = false, hidden_at = null where id = $MOD_POST; delete from ai_moderation;" >/dev/null
check "riesgo medio no oculta aunque la confianza sea alta" "ninguna" "$(save social_post "$MOD_POST" medio "'spam'" revisar 0.99)"
check "confianza menor a 0.9 no oculta" "ninguna" "$(save social_post "$MOD_POST" alto "'spam'" rechazar 0.89)"
check "una categoria que no es de las graves no oculta (precio, foto dudosa...)" "ninguna" "$(save social_post "$MOD_POST" alto "'foto_dudosa'" rechazar 0.99)"
check "Hub Market NUNCA se oculta ni se aprueba solo, ni con riesgo alto y confianza 1" "ninguna" "$(save hub_market_item "$MOD_ITEM" alto "'estafa'" rechazar 1)"
check "y el estado de la publicacion de Hub Market no cambia" "aprobado" "select status from hub_market_items where id = $MOD_ITEM;"
scalar "set request.jwt.claim.role = 'service_role'; update site_settings set value = 'false' where key = 'ai_auto_hide'; reset request.jwt.claim.role;" >/dev/null
check "con ai_auto_hide apagado no oculta nada" "ninguna" "$(save social_post "$MOD_POST" alto "'spam'" rechazar 0.99)"
scalar "set request.jwt.claim.role = 'service_role'; update site_settings set value = 'true' where key = 'ai_auto_hide'; reset request.jwt.claim.role; delete from ai_moderation;" >/dev/null

check "un valor de riesgo inventado se rechaza" 'ERROR:  new row for relation "ai_moderation" violates check constraint "ai_moderation_risk_check"' \
  "insert into ai_moderation (target_type, target_id, risk, suggested, confidence) values ('review', 1, 'extremo', 'aprobar', 0.5);"

# Restaurar: un moderador lo hace con un toque y la IA no lo vuelve a ocultar.
check "oculta de nuevo" "oculto" "$(save social_post "$MOD_POST" alto "'spam'" rechazar 0.95)"
check "un usuario normal no restaura" "ERROR:  Solo un moderador o un administrador puede restaurar contenido." "$(as_user "$USER_A" "select restore_hidden_content('social_post', $MOD_POST);")"
check "anon no invoca restore_hidden_content" "$(denied restore_hidden_content)" "$(as_anon "select restore_hidden_content('social_post', $MOD_POST);")"
check "un moderador ve lo oculto en su cola" "social_post" "$(as_user "$USER_B" "select target_type from ai_hidden_content() where target_id = $MOD_POST and target_type = 'social_post';")"
check "un usuario normal no ve la cola de lo oculto" "ERROR:  Solo un moderador o un administrador puede ver esto." "$(as_user "$USER_A" 'select * from ai_hidden_content();')"
check "un moderador restaura con un toque" "1" "$(as_user "$USER_B" "select restore_hidden_content('social_post', $MOD_POST); select count(*) from social_posts where id = $MOD_POST;")"
check "el publico la vuelve a ver" "1" "$(as_anon "select count(*) from social_posts where id = $MOD_POST;")"
check "queda anotado quien la restauro" "$USER_B" "select restored_by from ai_moderation where target_type = 'social_post' and target_id = $MOD_POST;"
check "un tipo que no se oculta se rechaza" "ERROR:  Ese tipo de contenido no se oculta." "$(as_user "$USER_B" "select restore_hidden_content('hub_market_item', 1);")"
check "tras restaurar, un nuevo analisis NO la vuelve a ocultar" "ninguna" "$(save social_post "$MOD_POST" alto "'spam'" rechazar 0.99)"
check "y sigue visible" "1" "$(as_anon "select count(*) from social_posts where id = $MOD_POST;")"
check "restaurar una resena devuelve su peso en las estrellas" "1" \
  "update reviews set hidden_by_ai = true where id = $MOD_REVIEW; $(as_user "$USER_B" "select restore_hidden_content('review', $MOD_REVIEW);") select review_count from hub_parts where id = $MOD_PROD;"

check "anon no invoca ai_save_moderation" "$(denied ai_save_moderation)" "$(as_anon "select ai_save_moderation('review', 1, 'alto', array['spam'], 'x', 'rechazar', 1, null, 'm', 0);")"
check "ni un admin (es de la edge)" "$(denied ai_save_moderation)" "$(as_user "$ADMIN" "select ai_save_moderation('review', 1, 'alto', array['spam'], 'x', 'rechazar', 1, null, 'm', 0);")"
check "anon no lee las sugerencias" 'ERROR:  permission denied for table ai_moderation' "$(as_anon 'select count(*) from ai_moderation;')"
check "un usuario normal ve 0 sugerencias (RLS)" "0" "$(as_user "$USER_A" 'select count(*) from ai_moderation;')"
check "un moderador si las lee" "true" "$(as_user "$USER_B" 'select (count(*) >= 1)::text from ai_moderation;')"
check "nadie escribe sugerencias desde el navegador" 'ERROR:  permission denied for table ai_moderation' \
  "$(as_user "$ADMIN" "insert into ai_moderation (target_type, target_id, risk, suggested, confidence) values ('review', 1, 'bajo', 'aprobar', 0.5);")"
check "el autor no puede esconder ni mostrar lo suyo desde el navegador (publicacion)" 'ERROR:  permission denied for table social_posts' \
  "$(as_user "$USER_A" "update social_posts set hidden_by_ai = false where id = $MOD_POST;")"

# Contexto de precio de Hub Market (lo calcula la base).
scalar "insert into hub_market_items (seller_name, title, price, location, category, status, spec_year) select 'v', 'QQ barato ' || g, 1000, 'SD', 'vehiculos', 'aprobado', 2015 from generate_series(1, 4) g;" >/dev/null
scalar "update hub_market_items set spec_brand = 'Toyota', spec_model = 'Corolla' where title like 'QQ barato%';" >/dev/null
scalar "insert into hub_market_items (seller_name, title, price, location, category, status, spec_year, spec_brand, spec_model) values ('v', 'QQ sospechoso', 10, 'SD', 'vehiculos', 'pendiente', 2015, 'Toyota', 'Corolla'), ('v', 'QQ normal', 1000, 'SD', 'vehiculos', 'pendiente', 2015, 'Toyota', 'Corolla');" >/dev/null
check "un precio mucho menor que el de los parecidos se marca muy_bajo" "true|muy_bajo" \
  "set role service_role; select (c->>'outlier') || '|' || (c->>'direction') from (select ai_hub_price_context((select id from hub_market_items where title = 'QQ sospechoso')) c) x;"
check "un precio normal no es atipico" "false" "set role service_role; select (ai_hub_price_context((select id from hub_market_items where title = 'QQ normal'))->>'outlier');"
check "con menos de 3 parecidos no se opina" "false" \
  "set role service_role; select (ai_hub_price_context((select id from hub_market_items where title not like 'QQ%' and category <> 'vehiculos' limit 1))->>'outlier');"
check "anon no invoca ai_hub_price_context" "$(denied ai_hub_price_context)" "$(as_anon 'select ai_hub_price_context(1);')"
scalar "delete from hub_market_items where title like 'QQ%';" >/dev/null

# El disparo.
scalar "delete from net.calls;" >/dev/null
check "publicar sin los secretos del Vault no falla ni llama" "0" \
  "insert into social_posts (author_id, author_name, text) values ('$USER_A', 'A', 'QQ sin secretos'); select count(*) from net.calls;"
scalar "insert into vault.decrypted_secrets (name, decrypted_secret) values ('ai_functions_url', 'https://f.example/functions/v1'), ('ai_cron_secret', 'cron-s3'), ('send_push_anon_key', 'anon-key') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
check "una publicacion nueva de la comunidad llama a ai-moderate con su tipo y su id" "https://f.example/functions/v1/ai-moderate|social_post|cron-s3" \
  "insert into social_posts (author_id, author_name, text) values ('$USER_A', 'A', 'QQ con secretos'); select url || '|' || (body->>'target_type') || '|' || (headers->>'x-ai-secret') from net.calls order by id desc limit 1;"
check "un comentario nuevo tambien" "social_comment" "insert into social_post_comments (post_id, author_id, text) values ($MOD_POST, '$USER_A', 'QQ otro'); select body->>'target_type' from net.calls order by id desc limit 1;"
check "una publicacion de Hub Market pendiente tambien" "hub_market_item" \
  "insert into hub_market_items (seller_name, title, price, location, category, status) values ('v', 'QQ pendiente', 100, 'SD', 'accesorios', 'pendiente'); select body->>'target_type' from net.calls order by id desc limit 1;"
check "una de prueba (is_test) no llama" "same" \
  "create temp table tmp_calls as select count(*) as c from net.calls; insert into hub_market_items (seller_name, title, price, location, category, status, is_test) values ('v', 'QQ prueba', 100, 'SD', 'accesorios', 'pendiente', true); select case when (select count(*) from net.calls) = (select c from tmp_calls) then 'same' else 'llamo' end;"
scalar "delete from vault.decrypted_secrets where name in ('ai_functions_url', 'ai_cron_secret', 'send_push_anon_key'); delete from net.calls; delete from hub_market_items where title like 'QQ%'; delete from social_posts where text like 'QQ%'; delete from reviews where comment like 'QQ%'; delete from ai_moderation;" >/dev/null
scalar "set request.jwt.claim.role = 'service_role'; update profiles set role = 'user' where id = '$USER_B'; reset request.jwt.claim.role;" >/dev/null

echo "→ Camino de actualizacion de la 0053"
apply supabase/migrations/0053_ai_moderation.sql upgrade
apply supabase/migrations/0053_ai_moderation.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "las tres tablas de contenido traen hidden_by_ai" "3" \
  "select count(*) from information_schema.columns where column_name = 'hidden_by_ai' and table_name in ('social_posts', 'social_post_comments', 'reviews');"

echo "→ IA: registro de busquedas (migracion 0054)"
check "se sanean telefonos, correos y cedulas, y se quitan los acentos" "bateria para mi carro, llamame" \
  "select xah_clean_query('  Batería para mi carro, 809-953-9782 maria@correo.com 001-1234567-8  llámame ');"
scalar "delete from search_log;" >/dev/null
scalar "$(as_anon "select log_search('Faros Corolla 2015 (809) 555-1234', 3, true);")" >/dev/null
check "log_search (abierta a anon) guarda la consulta saneada, sin quien busco" "faros corolla 2015|3|true" \
  "select query_norm || '|' || result_count || '|' || had_vehicle::text from search_log order by id desc limit 1;"
check "la tabla no guarda nada de quien busco (solo 5 columnas)" "5" "select count(*) from information_schema.columns where table_name = 'search_log';"
scalar "$(as_anon "select log_search('a', 1); select log_search('algo raro', -1); select log_search(repeat('x', 400), 0);")" >/dev/null
check "una consulta de un caracter no se guarda" "0" "select count(*) from search_log where query_norm = 'a';"
check "un conteo negativo no se guarda" "0" "select count(*) from search_log where query_norm = 'algo raro';"
check "lo larguisimo se recorta a 120" "120" "select max(char_length(query_norm)) from search_log;"
check "anon no lee el registro" 'ERROR:  permission denied for table search_log' "$(as_anon 'select count(*) from search_log;')"
check "un usuario normal ve 0 filas (RLS)" "0" "$(as_user "$USER_A" 'select count(*) from search_log;')"
check "un admin si" "true" "$(as_user "$ADMIN" 'select (count(*) > 0)::text from search_log;')"
check "nadie escribe directo" 'ERROR:  permission denied for table search_log' "$(as_anon "insert into search_log (query_norm, result_count) values ('xx', 1);")"

scalar "delete from search_log; insert into search_log (query_norm, result_count) select 'pastillas lada', 0 from generate_series(1, 3); insert into search_log (query_norm, result_count) values ('bumper hilux', 0), ('filtro', 5);" >/dev/null
check "admin_search_gaps: lo que no encontro, lo mas repetido primero" "pastillas lada|3;bumper hilux|1" \
  "$(as_user "$ADMIN" "select string_agg(query_norm || '|' || searches, ';' order by searches desc, query_norm) from admin_search_gaps(30, 10);")"
check "un usuario normal no ve las busquedas sin resultado" "ERROR:  Solo un administrador puede ver esto." "$(as_user "$USER_A" 'select * from admin_search_gaps();')"
check "anon no invoca admin_search_gaps" "$(denied admin_search_gaps)" "$(as_anon 'select * from admin_search_gaps();')"
check "ai_search_gaps es de la edge: un admin tampoco" "$(denied ai_search_gaps)" "$(as_user "$ADMIN" 'select * from ai_search_gaps();')"
check "ai_search_gaps (service_role) da lo mismo" "pastillas lada" "set role service_role; select query_norm from ai_search_gaps(7, 1);"

check "el freno global: pasados 600 en un minuto, se ignora en silencio" "0" \
  "insert into search_log (query_norm, result_count) select 'relleno', 1 from generate_series(1, 650); select log_search('no deberia entrar', 1); select count(*) from search_log where query_norm = 'no deberia entrar';"
check "la purga borra lo de mas de 90 dias y deja lo reciente" "1" \
  "delete from search_log; insert into search_log (query_norm, result_count, created_at) values ('viejo', 0, now() - interval '91 days'), ('reciente', 0, now()); select search_log_purge(); select count(*) from search_log;"
check "el cron de la purga esta programado, una sola vez" "1" "select count(*) from cron.job where jobname = 'search-log-purge' and command like '%search_log_purge%';"
scalar "delete from search_log;" >/dev/null

# Asignar un modelo escrito a mano (una errata) a uno que ya existe.
AM_MAKE="$(scalar "select id from vehicle_makes where slug = 'toyota';" | tail -1)"
AM_MODEL="$(scalar "select id from vehicle_models where make_id = $AM_MAKE and slug = 'corolla';" | tail -1)"
scalar "insert into profile_vehicles (user_id, make_id, model_text, year) values ('$USER_B', $AM_MAKE, 'Corola', 2012), ('$USER_B', $AM_MAKE, 'Hilux', 2012);" >/dev/null
check "asignar 'Corola' al Corolla devuelve cuantos garajes movio" "1" "$(as_user "$ADMIN" "select admin_assign_vehicle_model($AM_MAKE, 'corola', $AM_MODEL);")"
check "y movio solo los que tenian ese texto (el de Hilux sigue como estaba)" "1|1" \
  "select (select count(*) from profile_vehicles where model_id = $AM_MODEL and user_id = '$USER_B') || '|' || (select count(*) from profile_vehicles where model_text = 'Hilux');"
check "repetirlo ya no mueve nada" "0" "$(as_user "$ADMIN" "select admin_assign_vehicle_model($AM_MAKE, 'corola', $AM_MODEL);")"
check "un modelo de otra marca se rechaza" "ERROR:  Ese modelo no es de esa marca." \
  "$(as_user "$ADMIN" "select admin_assign_vehicle_model($AM_MAKE, 'Hilux', (select id from vehicle_models where make_id <> $AM_MAKE limit 1));")"
check "un usuario normal no asigna" "ERROR:  Solo un administrador puede asignar modelos" "$(as_user "$USER_A" "select admin_assign_vehicle_model($AM_MAKE, 'Hilux', $AM_MODEL);")"
check "anon no invoca admin_assign_vehicle_model" "$(denied admin_assign_vehicle_model)" "$(as_anon "select admin_assign_vehicle_model($AM_MAKE, 'Hilux', $AM_MODEL);")"
scalar "delete from profile_vehicles where user_id = '$USER_B';" >/dev/null

echo "→ Camino de actualizacion de la 0054"
apply supabase/migrations/0054_search_log_and_ai.sql upgrade
apply supabase/migrations/0054_search_log_and_ai.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y con RLS" "0|true" \
  "select (select count(*) from search_log) || '|' || (select relrowsecurity from pg_class where relname = 'search_log')::text;"

echo "→ IA: solicitudes de cotizacion del taller (migracion 0055)"
QT_TOKEN='aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
QT_SERVICE="$(scalar "select id from services where is_active order by id limit 1;" | tail -1)"
mkq() { echo "select code from create_quote_request('$1', '$2', '$3', 'Toyota Corolla 2015', null, $4, '$QT_TOKEN', $5, $6);"; }

check "un visitante sin cuenta crea una solicitud y recibe su codigo XAH-C-0001" "XAH-C-0001" \
  "$(as_anon "$(mkq 'Maria Perez' '809-555-0134' 'Hace un ruido al frenar y el pedal se siente blando' "$QT_SERVICE" "'{}'::text[]" null)")"
check "el telefono se guarda como diez digitos, sin separadores" "8095550134" "select contact_phone from service_quote_requests where code = 'XAH-C-0001';"
check "nace en estado 'nueva', sin triage y sin dueño" "nueva||" "select status || '|' || coalesce(urgency, '') || '|' || coalesce(user_id::text, '') from service_quote_requests where code = 'XAH-C-0001';"
check "el siguiente codigo es el 0002" "XAH-C-0002" "$(as_anon "$(mkq 'Juan' '+1 829 555 0135' 'Quiero cambiar el aceite y los filtros' null "'{}'::text[]" null)")"
check "un telefono que no es dominicano se rechaza" "ERROR:  Escribe un teléfono dominicano válido (809, 829 o 849…)." "$(as_anon "$(mkq 'Maria' '12345' 'Algo le pasa al carro' null "'{}'::text[]" null)")"
check "un nombre vacio se rechaza" "ERROR:  Escribe tu nombre." "$(as_anon "$(mkq ' ' '809-555-0136' 'Algo le pasa al carro' null "'{}'::text[]" null)")"
check "una descripcion muy corta se rechaza" "ERROR:  Cuéntanos qué necesitas (entre 5 y 1000 letras)." "$(as_anon "$(mkq 'Maria' '809-555-0136' 'hola' null "'{}'::text[]" null)")"
scalar "$(as_anon "$(mkq 'Bot' '809-555-0137' 'Compra viagra barato ya mismo' null "'{}'::text[]" "'http://spam.example'")")" >/dev/null
check "el honeypot lleno responde como si nada y NO guarda" "0" "select count(*) from service_quote_requests where contact_name = 'Bot';"
scalar "$(as_anon "$(mkq 'Luis' '809-555-0138' 'Necesito revisar los frenos' 999999 "'{}'::text[]" null)")" >/dev/null
check "un servicio que no existe se ignora (queda sin servicio)" "" "select coalesce(service_id::text, '') from service_quote_requests where contact_name = 'Luis';"

# El tope por telefono: cinco por hora.
scalar "insert into service_quote_requests (contact_name, contact_phone, description) select 'Tope', '8095550199', 'solicitud de relleno ' || g from generate_series(1, 5) g;" >/dev/null
check "mas de cinco por hora desde el mismo telefono se rechaza" "ERROR:  Ya recibimos varias solicitudes de este número. Te contestamos pronto." "$(as_anon "$(mkq 'Tope' '809-555-0199' 'otra solicitud mas del mismo' null "'{}'::text[]" null)")"
scalar "delete from service_quote_requests where contact_name = 'Tope';" >/dev/null

# Fotos: tienen que ser de la carpeta del visitante y existir; maximo 3.
check "una foto que no existe se rechaza" "ERROR:  No encontramos una de las fotos. Intenta de nuevo." "$(as_anon "$(mkq 'Foto' '809-555-0140' 'Mira como quedo el parachoques' null "array['$QT_TOKEN/0.jpg']" null)")"
check "un visitante sube una foto a su carpeta" "1" \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('quote-photos', '$QT_TOKEN/0.jpg'); select 1;")"
scalar "$(as_anon "$(mkq 'Foto' '809-555-0140' 'Mira como quedo el parachoques' null "array['$QT_TOKEN/0.jpg']" null)")" >/dev/null
check "con la foto subida, la solicitud se crea y la lleva" "{$QT_TOKEN/0.jpg}" "select photos::text from service_quote_requests where contact_name = 'Foto';"
check "una foto de la carpeta de otra persona no vale" "ERROR:  No encontramos una de las fotos. Intenta de nuevo." \
  "$(as_anon "$(mkq 'Foto2' '809-555-0141' 'Mira como quedo el parachoques' null "array['bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb/0.jpg']" null)")"
check "mas de tres fotos se rechaza" "ERROR:  Máximo 3 fotos." "$(as_anon "$(mkq 'Foto3' '809-555-0142' 'Mira como quedo el parachoques' null "array['a','b','c','d']" null)")"
check "subir fuera de la forma uuid/n.jpg se rechaza" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('quote-photos', 'cualquier-cosa.png');")"
check "tambien una foto 4 (n fuera de 0 a 2)" 'ERROR:  new row violates row-level security policy for table "objects"' \
  "$(as_anon "insert into storage.objects (bucket_id, name) values ('quote-photos', '$QT_TOKEN/3.jpg');")"
check "anon no puede leer las fotos de cotizacion" "0" "$(as_anon "select count(*) from storage.objects where bucket_id = 'quote-photos';")"
check "un usuario normal tampoco" "0" "$(as_user "$USER_A" "select count(*) from storage.objects where bucket_id = 'quote-photos';")"
check "un admin si" "true" "$(as_user "$ADMIN" "select (count(*) >= 1)::text from storage.objects where bucket_id = 'quote-photos';")"

# Con cuenta: el dueño ve las suyas; el vehiculo del garaje solo si es suyo.
QT_PV="$(scalar "select id from profile_vehicles where user_id = '$USER_A' limit 1;" | tail -1)"
scalar "$(as_user "$USER_A" "select code from create_quote_request('Ana', '809-555-0150', 'Revisar el aire acondicionado', null, ${QT_PV:-null}, null, null, '{}', null);")" >/dev/null
check "con cuenta, la solicitud queda a su nombre" "$USER_A" "select user_id from service_quote_requests where contact_name = 'Ana';"
check "el dueño ve la suya" "1" "$(as_user "$USER_A" "select count(*) from service_quote_requests;")"
check "otro usuario no ve las ajenas" "0" "$(as_user "$USER_B" "select count(*) from service_quote_requests;")"
check "un admin ve todas" "true" "$(as_user "$ADMIN" "select (count(*) >= 4)::text from service_quote_requests;")"
check "anon no lee solicitudes" 'ERROR:  permission denied for table service_quote_requests' "$(as_anon 'select count(*) from service_quote_requests;')"
check "nadie inserta directo" 'ERROR:  permission denied for table service_quote_requests' "$(as_user "$ADMIN" "insert into service_quote_requests (contact_name, contact_phone, description) values ('x', '8095550000', 'hola mundo');")"
check "un usuario no cambia el estado de las suyas" "0" "$(as_user "$USER_A" "with u as (update service_quote_requests set status = 'cerrada' returning 1) select count(*) from u;")"
check "un admin si, y queda la hora de actualizacion" "respondida" "$(as_user "$ADMIN" "update service_quote_requests set status = 'respondida', handled_by = '$ADMIN' where code = 'XAH-C-0001' returning status;")"
check "un estado inventado se rechaza" 'ERROR:  new row for relation "service_quote_requests" violates check constraint "service_quote_requests_status_check"' "update service_quote_requests set status = 'pagada' where code = 'XAH-C-0001';"
check "un admin no toca el triage desde el navegador" 'ERROR:  permission denied for table service_quote_requests' "$(as_user "$ADMIN" "update service_quote_requests set ai_triage = '{}' where code = 'XAH-C-0001';")"
check "ai_save_quote_triage es de la edge" "$(denied ai_save_quote_triage)" "$(as_user "$ADMIN" "select ai_save_quote_triage((select id from service_quote_requests limit 1), '{}', 'normal');")"
check "ai_save_quote_triage (service_role) guarda el triage y la urgencia" "seguridad|{\"a\": 1}" \
  "set role service_role; select ai_save_quote_triage((select id from service_quote_requests where code = 'XAH-C-0001'), '{\"a\": 1}', 'seguridad'); select urgency || '|' || ai_triage::text from service_quote_requests where code = 'XAH-C-0001';"
check "una urgencia inventada se rechaza" 'ERROR:  new row for relation "service_quote_requests" violates check constraint "service_quote_requests_urgency_check"' "update service_quote_requests set urgency = 'ya' where code = 'XAH-C-0001';"
check "anon invoca create_quote_request (esta abierta a visitantes)" "true" "$(as_anon "select (code is not null)::text from create_quote_request('Visitante', '809-555-0160', 'Quiero cotizar una alineacion', null, null, null, null, '{}', null);")"

# El disparo.
scalar "delete from net.calls;" >/dev/null
scalar "$(as_anon "select code from create_quote_request('Sin Secretos', '809-555-0161', 'Algo con el carro', null, null, null, null, '{}', null);")" >/dev/null
check "sin los secretos del Vault crear la solicitud no falla ni llama" "0" "select count(*) from net.calls;"
scalar "insert into vault.decrypted_secrets (name, decrypted_secret) values ('ai_functions_url', 'https://f.example/functions/v1'), ('ai_cron_secret', 'cron-s3'), ('send_push_anon_key', 'anon-key') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
scalar "$(as_anon "select code from create_quote_request('Con Secretos', '809-555-0162', 'Algo con el carro', null, null, null, null, '{}', null);")" >/dev/null
check "con los secretos, una solicitud nueva pide el triage con su id" "https://f.example/functions/v1/ai-triage-quote|triage|cron-s3" \
  "select url || '|' || (body->>'action') || '|' || (headers->>'x-ai-secret') from net.calls order by id desc limit 1;"
check "el cuerpo solo lleva el id (nada del cliente viaja por pg_net)" "true" "select (body ? 'id' and not body ? 'contact_phone' and not body ? 'description')::text from net.calls order by id desc limit 1;"

# La purga de fotos.
# Sin triggers (el de updated_at pisaría la fecha vieja que se quiere simular).
scalar "delete from net.calls; set session_replication_role = replica; update service_quote_requests set status = 'cerrada', photos = array['x/0.jpg'], updated_at = now() - interval '91 days' where code = 'XAH-C-0001';" >/dev/null
check "las fotos de una cerrada hace mas de 90 dias salen para purgar" "x/0.jpg" "set role service_role; select photos[1] from quote_photos_to_purge();"
check "con fotos por purgar, el cron le pide a la edge que las borre" "purge" "select request_quote_purge(); select body->>'action' from net.calls order by id desc limit 1;"
check "al borrarlas la edge las quita de la fila" "0" "set role service_role; select quote_photos_cleared(array[(select id from service_quote_requests where code = 'XAH-C-0001')]); select cardinality(photos) from service_quote_requests where code = 'XAH-C-0001';"
check "sin nada por purgar no llama" "0" "delete from net.calls; select request_quote_purge(); select count(*) from net.calls;"
check "anon no invoca la purga" "$(denied request_quote_purge)" "$(as_anon 'select request_quote_purge();')"
check "el cron de la purga esta programado, una sola vez" "1" "select count(*) from cron.job where jobname = 'quote-photos-purge' and command like '%request_quote_purge%';"
scalar "delete from vault.decrypted_secrets where name in ('ai_functions_url', 'ai_cron_secret', 'send_push_anon_key'); delete from net.calls; delete from service_quote_requests; delete from storage.objects where bucket_id = 'quote-photos';" >/dev/null

echo "→ Camino de actualizacion de la 0055"
apply supabase/migrations/0055_service_quote_requests.sql upgrade
apply supabase/migrations/0055_service_quote_requests.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y con RLS" "0|true" \
  "select (select count(*) from service_quote_requests) || '|' || (select relrowsecurity from pg_class where relname = 'service_quote_requests')::text;"

echo "→ IA: resumen diario del negocio (migracion 0056)"
check "el umbral de stock bajo nace en 3" "3" "select value::text from site_settings where key = 'low_stock_threshold';"
check "un umbral negativo se rechaza" 'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_low_stock_valid"' "update site_settings set value = '-1' where key = 'low_stock_threshold';"
check "las metricas traen todos los numeros esperados" "true" \
  "set role service_role; select (business_metrics_compute() ?& array['orders_new_24h','awaiting_payment_with_proof','awaiting_payment_no_proof_24h','sold_today_rd','low_stock','out_of_stock','out_of_stock_searched','appointments_today','appointments_tomorrow','appointments_unconfirmed','quotes_unanswered_24h','moderation_pending','publications_expiring_7d','reviews_new_24h','search_gaps','ai_spend','week'])::text;"

DG_LOW0="$(scalar "set role service_role; select (business_metrics_compute()->>'low_stock')::int;" | tail -1)"
DG_OUT0="$(scalar "set role service_role; select (business_metrics_compute()->>'out_of_stock')::int;" | tail -1)"
scalar "insert into hub_parts (name, brand, img_url, price, stock) values ('QQ Zzzzzfaro bajo', 'M', 'x.jpg', 100, 2), ('QQ Zzzzzfaro agotado', 'M', 'x.jpg', 100, 0), ('QQ Pieza con stock', 'M', 'x.jpg', 100, 50);" >/dev/null
check "una pieza con 2 en stock suma al stock bajo (umbral 3)" "$((DG_LOW0 + 1))" "set role service_role; select (business_metrics_compute()->>'low_stock')::int;"
check "una pieza en 0 suma a los agotados" "$((DG_OUT0 + 1))" "set role service_role; select (business_metrics_compute()->>'out_of_stock')::int;"
check "una con mucho stock no cuenta como baja" "$((DG_LOW0 + 1))" "set role service_role; select (business_metrics_compute()->>'low_stock')::int;"
scalar "insert into search_log (query_norm, result_count) values ('zzzzzfaro agotado', 0), ('zzzzzfaro agotado', 0), ('zzzzzfaro', 0);" >/dev/null
check "un agotado que la gente busca sale en la lista de demanda perdida" "QQ Zzzzzfaro agotado" \
  "set role service_role; select business_metrics_compute()->'out_of_stock_searched'->0->>'name';"
check "y las busquedas sin resultado salen ordenadas por repeticion" "zzzzzfaro agotado|2" "set role service_role; select (business_metrics_compute()->'search_gaps'->0->>'query') || '|' || (business_metrics_compute()->'search_gaps'->0->>'searches');"
scalar "set request.jwt.claim.role = 'service_role'; update site_settings set value = '1' where key = 'low_stock_threshold'; reset request.jwt.claim.role;" >/dev/null
check "cambiar el umbral cambia la cuenta (con 1, la de 2 deja de ser baja)" "$DG_LOW0" "set role service_role; select (business_metrics_compute()->>'low_stock')::int;"
scalar "set request.jwt.claim.role = 'service_role'; update site_settings set value = '3' where key = 'low_stock_threshold'; reset request.jwt.claim.role; delete from hub_parts where name like 'QQ %'; delete from search_log;" >/dev/null

scalar "insert into service_quote_requests (contact_name, contact_phone, description, status) values ('Vieja', '8095550171', 'solicitud sin responder', 'nueva'), ('Nueva', '8095550172', 'solicitud reciente aqui', 'nueva'); set session_replication_role = replica; update service_quote_requests set created_at = now() - interval '30 hours' where contact_name = 'Vieja';" >/dev/null
check "las solicitudes sin responder hace mas de 24 horas se cuentan aparte" "1|2" "set role service_role; select (business_metrics_compute()->>'quotes_unanswered_24h') || '|' || (business_metrics_compute()->>'quotes_new');"
scalar "delete from service_quote_requests;" >/dev/null

check "la moderacion pendiente cuenta las de Hub Market en 'pendiente' (sin las de prueba)" "true" \
  "set role service_role; select ((business_metrics_compute()->>'moderation_pending')::int = (select count(*) from hub_market_items where status = 'pendiente' and not is_test))::text;"
check "el gasto de IA del mes viene con su porcentaje del tope" "25" "set role service_role; select (business_metrics_compute()->'ai_spend'->>'cap_usd')::int;"

check "un admin ve las metricas del negocio" "true" "$(as_user "$ADMIN" "select (business_daily_metrics() ? 'orders_new_24h')::text;")"
check "un usuario normal no" "ERROR:  Solo un administrador puede ver las métricas del negocio." "$(as_user "$USER_A" 'select business_daily_metrics();')"
check "anon no invoca business_daily_metrics" "$(denied business_daily_metrics)" "$(as_anon 'select business_daily_metrics();')"
check "business_metrics_compute es de la edge: un admin tampoco" "$(denied business_metrics_compute)" "$(as_user "$ADMIN" 'select business_metrics_compute();')"

check "la edge guarda el resumen" "diario|true|1" "set role service_role; select ai_save_digest(current_date, 'diario', '- Hoy hay 3 pedidos', '{\"a\": 1}', true); select kind || '|' || ai_generated::text || '|' || (select count(*) from ai_digests) from ai_digests;"
check "guardar otro del mismo dia lo reemplaza (uno por dia)" "lunes|false|1" "set role service_role; select ai_save_digest(current_date, 'lunes', 'plantilla', '{}', false); select kind || '|' || ai_generated::text || '|' || (select count(*) from ai_digests) from ai_digests;"
check "un tipo de resumen inventado se rechaza" 'ERROR:  new row for relation "ai_digests" violates check constraint "ai_digests_kind_check"' "insert into ai_digests (digest_date, kind, body_md) values (current_date - 1, 'raro', 'x');"
check "anon no lee los resumenes" 'ERROR:  permission denied for table ai_digests' "$(as_anon 'select count(*) from ai_digests;')"
check "un usuario normal ve 0 (RLS)" "0" "$(as_user "$USER_A" 'select count(*) from ai_digests;')"
check "un admin los lee" "1" "$(as_user "$ADMIN" 'select count(*) from ai_digests;')"
check "nadie los escribe desde el navegador" 'ERROR:  permission denied for table ai_digests' "$(as_user "$ADMIN" "insert into ai_digests (digest_date, body_md) values (current_date - 2, 'x');")"
check "ai_save_digest es de la edge" "$(denied ai_save_digest)" "$(as_user "$ADMIN" "select ai_save_digest(current_date, 'diario', 'x', '{}', true);")"
scalar "delete from ai_digests;" >/dev/null

scalar "delete from net.calls;" >/dev/null
check "sin los secretos del Vault el reloj no llama" "0" "select request_daily_digest(); select count(*) from net.calls;"
scalar "insert into vault.decrypted_secrets (name, decrypted_secret) values ('ai_functions_url', 'https://f.example/functions/v1'), ('ai_cron_secret', 'cron-s3'), ('send_push_anon_key', 'anon-key') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
check "con los secretos llama a ai-daily-digest con el secreto compartido" "https://f.example/functions/v1/ai-daily-digest|cron-s3" "select request_daily_digest(); select url || '|' || (headers->>'x-ai-secret') from net.calls order by id desc limit 1;"
check "anon no invoca request_daily_digest" "$(denied request_daily_digest)" "$(as_anon 'select request_daily_digest();')"
check "el cron corre a las 11:30 UTC (7:30 a. m. de RD), una sola vez" "1|30 11 * * *" "select count(*) || '|' || min(schedule) from cron.job where jobname = 'daily-digest' and command like '%request_daily_digest%';"
scalar "delete from vault.decrypted_secrets where name in ('ai_functions_url', 'ai_cron_secret', 'send_push_anon_key'); delete from net.calls;" >/dev/null

echo "→ Camino de actualizacion de la 0056"
for migration in supabase/migrations/005[3-5]_*.sql; do apply "$migration" upgrade; done
apply supabase/migrations/0056_ai_digests.sql upgrade
apply supabase/migrations/0056_ai_digests.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la tabla queda vacia y con RLS" "0|true" \
  "select (select count(*) from ai_digests) || '|' || (select relrowsecurity from pg_class where relname = 'ai_digests')::text;"

echo "→ IA: resumen de reseñas y SEO de fichas (migracion 0057)"
RS_PROD="$(scalar "insert into hub_parts (name, brand, img_url, price, images) values ('QQ Producto con resenas', 'M', 'x.jpg', 100, array['a.jpg','b.jpg']) returning id;" | tail -1)"
RS_USERS="$(scalar "select string_agg(id::text, ',') from (select id from profiles limit 6) t;" | tail -1)"
# Seis reseñas del mismo producto: 4 verificadas, 1 verificada oculta por la IA, 1 sin verificar.
scalar "set request.jwt.claim.role = 'service_role'; alter table reviews disable trigger user; insert into reviews (target_type, target_id, user_id, rating, comment, is_verified_purchase) select 'product', $RS_PROD, u::uuid, 5, 'QQ buena ' || u, true from unnest(string_to_array('$RS_USERS', ',')) u limit 6;" >/dev/null
RS_COUNT="$(scalar "select count(*) from reviews where target_id = $RS_PROD;" | tail -1)"
check "hay reseñas de prueba para resumir (necesita al menos 6 perfiles de prueba)" "true" "select ($RS_COUNT >= 3)::text;"

check "con >= 3 verificadas y sin resumen, el producto toca resumirse" "true" "set role service_role; select exists (select 1 from ai_review_targets_due(50) where target_type = 'product' and target_id = $RS_PROD)::text;"
check "las ocultas por la IA no cuentan: ocultando todas menos 2, ya no toca" "false" \
  "update reviews set hidden_by_ai = true where target_id = $RS_PROD and id not in (select id from reviews where target_id = $RS_PROD order by id limit 2); set role service_role; select exists (select 1 from ai_review_targets_due(50) where target_id = $RS_PROD)::text;"
check "las no verificadas tampoco cuentan" "false" \
  "update reviews set hidden_by_ai = false where target_id = $RS_PROD; update reviews set is_verified_purchase = false where target_id = $RS_PROD and id not in (select id from reviews where target_id = $RS_PROD order by id limit 2); set role service_role; select exists (select 1 from ai_review_targets_due(50) where target_id = $RS_PROD)::text;"
scalar "update reviews set is_verified_purchase = true where target_id = $RS_PROD;" >/dev/null
check "para el resumen solo llegan las verificadas y visibles" "true" "set role service_role; select (count(*) = (select count(*) from reviews where target_id = $RS_PROD and is_verified_purchase and not hidden_by_ai))::text from ai_reviews_for_summary('product', $RS_PROD);"

check "se guarda el resumen" "1|3" "set role service_role; select ai_save_review_summary('product', $RS_PROD, 'Compradores contentos con la durabilidad.', array['Dura mucho'], array['Algo caro'], 3); select count(*) || '|' || max(review_count_at) from ai_review_summaries where target_id = $RS_PROD;"
check "con el resumen al dia, ya no toca" "false" "set role service_role; select exists (select 1 from ai_review_targets_due(50) where target_id = $RS_PROD)::text;"
check "con 3 reseñas verificadas nuevas, vuelve a tocar" "true" \
  "insert into reviews (target_type, target_id, user_id, rating, comment, is_verified_purchase) select 'product', $RS_PROD, p.id, 4, 'QQ nueva', true from (select id from profiles order by id desc limit 3) p on conflict do nothing; update ai_review_summaries set review_count_at = 3 where target_id = $RS_PROD; update reviews set is_verified_purchase = true where target_id = $RS_PROD; set role service_role; select (exists (select 1 from ai_review_targets_due(50) where target_id = $RS_PROD) or (select count(*) from reviews where target_id = $RS_PROD and is_verified_purchase) < 6)::text;"
check "un resumen demasiado corto se rechaza" 'ERROR:  new row for relation "ai_review_summaries" violates check constraint "ai_review_summaries_summary_check"' "insert into ai_review_summaries (target_type, target_id, summary, review_count_at) values ('service', 1, 'corto', 3);"
check "menos de 3 reseñas no se resumen (check)" 'ERROR:  new row for relation "ai_review_summaries" violates check constraint "ai_review_summaries_review_count_at_check"' "insert into ai_review_summaries (target_type, target_id, summary, review_count_at) values ('service', 1, 'Un resumen suficientemente largo.', 2);"
check "anon lee los resumenes (salen en la ficha)" "1" "$(as_anon "select count(*) from ai_review_summaries where target_id = $RS_PROD;")"
check "nadie los escribe desde el navegador" 'ERROR:  permission denied for table ai_review_summaries' "$(as_user "$ADMIN" "insert into ai_review_summaries (target_type, target_id, summary, review_count_at) values ('service', 1, 'Un resumen suficientemente largo.', 3);")"
check "ai_save_review_summary es de la edge" "$(denied ai_save_review_summary)" "$(as_user "$ADMIN" "select ai_save_review_summary('product', 1, 'Un resumen suficientemente largo.', '{}', '{}', 3);")"
check "ai_review_targets_due es de la edge" "$(denied ai_review_targets_due)" "$(as_anon 'select * from ai_review_targets_due();')"

check "avisar al sitio: la primera vez del dia si, la segunda no (sin tormentas de rebuild)" "true|false" \
  "delete from ai_query_cache where key = 'dirty:review_summary'; set role service_role; select a.r || '|' || b.r from (select ai_mark_site_dirty_daily()::text as r) a, lateral (select ai_mark_site_dirty_daily()::text as r) b;"
check "y dejo anotado que el sitio tiene algo sin publicar" "true" "select (dirty_since is not null)::text from site_rebuild where id;"
check "anon no invoca ai_mark_site_dirty_daily" "$(denied ai_mark_site_dirty_daily)" "$(as_anon 'select ai_mark_site_dirty_daily();')"

# SEO de fichas.
check "la IA llena el titulo, la descripcion, los alts y las preguntas de una ficha vacia" "true|true|true|true" \
  "set role service_role; select (r->>'seo_title') || '|' || (r->>'seo_description') || '|' || (r->>'image_alts') || '|' || (r->>'seo_faq') from (select ai_apply_product_seo($RS_PROD, 'Producto con reseñas | X AutoHub', 'Descripción corta para buscadores.', array['Frente del producto', 'Parte trasera'], '[{\"q\": \"¿Qué marca es?\", \"a\": \"M.\"}]'::jsonb) r) x;"
check "queda marcado seo_source = 'ia'" "ia" "select seo_source from hub_parts where id = $RS_PROD;"
check "los alts quedan paralelos a las fotos" "{\"Frente del producto\",\"Parte trasera\"}" "select image_alts::text from hub_parts where id = $RS_PROD;"
check "NUNCA pisa un campo ya lleno: segunda corrida no escribe nada" "false|false|false|false" \
  "set role service_role; select (r->>'seo_title') || '|' || (r->>'seo_description') || '|' || (r->>'image_alts') || '|' || (r->>'seo_faq') from (select ai_apply_product_seo($RS_PROD, 'OTRO TITULO', 'Otra descripcion.', array['x', 'y'], '[{\"q\": \"otra\", \"a\": \"cosa\"}]'::jsonb) r) x;"
check "y el titulo sigue siendo el primero" "Producto con reseñas | X AutoHub" "select seo_title from hub_parts where id = $RS_PROD;"
check "un admin edita el titulo a mano: pasa a 'humano'" "humano" "$(as_user "$ADMIN" "update hub_parts set seo_title = 'Titulo escrito por mi' where id = $RS_PROD returning seo_source;")"
check "la IA ya no toca lo escrito a mano ni cambia la fuente" "false|humano" \
  "update hub_parts set seo_description = '' where id = $RS_PROD; set role service_role; select (ai_apply_product_seo($RS_PROD, 'IGNORADO', 'Descripcion nueva de la IA.', '{}', '[]'::jsonb)->>'seo_title') || '|' || (select seo_source from hub_parts where id = $RS_PROD);"
check "un titulo de mas de 60 letras se rechaza" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_seo_check"' "update hub_parts set seo_title = repeat('x', 61) where id = $RS_PROD;"
check "una descripcion de mas de 155 se rechaza" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_seo_check"' "update hub_parts set seo_description = repeat('x', 156) where id = $RS_PROD;"
check "mas de 3 preguntas se rechaza" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_seo_extras_check"' "update hub_parts set seo_faq = '[1,2,3,4]'::jsonb where id = $RS_PROD;"
check "una fuente inventada se rechaza" 'ERROR:  new row for relation "hub_parts" violates check constraint "hub_parts_seo_check"' "update hub_parts set seo_source = 'robot' where id = $RS_PROD;"
check "un usuario con sesion no puede saltarse la marca 'humano' con el ajuste de la IA" "humano" \
  "$(as_user "$ADMIN" "set app.ai_seo_write = 'on'; update hub_parts set seo_title = 'Truco' where id = $RS_PROD returning seo_source;")"
check "ai_apply_product_seo es de la edge" "$(denied ai_apply_product_seo)" "$(as_user "$ADMIN" "select ai_apply_product_seo($RS_PROD, 'x', 'y', '{}', '[]'::jsonb);")"
check "un producto que no existe es un error" "ERROR:  Ese producto no existe." "set role service_role; select ai_apply_product_seo(999999, 'x', 'y', '{}', '[]'::jsonb);"

RS_SERVICE="$(scalar "select id from services where is_active order by id limit 1;" | tail -1)"
scalar "update services set seo_title = null, seo_description = null, seo_source = null where id = $RS_SERVICE;" >/dev/null
check "los servicios: la IA llena titulo y descripcion vacios" "true|true" \
  "set role service_role; select (r->>'seo_title') || '|' || (r->>'seo_description') from (select ai_apply_service_seo($RS_SERVICE, 'Servicio | X AutoHub', 'Descripcion del servicio.') r) x;"
check "y los marca como de la IA" "ia" "select seo_source from services where id = $RS_SERVICE;"
check "y una edicion a mano de un servicio pasa a 'humano'" "humano" "$(as_user "$ADMIN" "update services set seo_title = 'Mio' where id = $RS_SERVICE returning seo_source;")"
check "una ficha creada con titulo desde el panel nace 'humano'" "humano" "$(as_user "$ADMIN" "insert into hub_parts (name, brand, img_url, price, seo_title) values ('QQ Con SEO a mano', 'M', 'x.jpg', 100, 'Titulo a mano') returning seo_source;")"

scalar "delete from hub_parts where name like 'QQ %'; delete from ai_review_summaries; delete from ai_query_cache; alter table reviews enable trigger user;" >/dev/null
scalar "delete from reviews where comment like 'QQ %';" >/dev/null

scalar "delete from net.calls;" >/dev/null
check "sin los secretos del Vault el reloj de resumenes no llama" "0" "select request_review_summaries(); select count(*) from net.calls;"
check "el cron de resumenes esta programado a las 07:00 UTC (3:00 a. m. de RD), una sola vez" "1|0 7 * * *" "select count(*) || '|' || min(schedule) from cron.job where jobname = 'review-summaries' and command like '%request_review_summaries%';"
check "anon no invoca request_review_summaries" "$(denied request_review_summaries)" "$(as_anon 'select request_review_summaries();')"

echo "→ Camino de actualizacion de la 0057"
apply supabase/migrations/0057_ai_reviews_seo.sql upgrade
apply supabase/migrations/0057_ai_reviews_seo.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "las columnas de SEO existen en piezas y servicios" "2" \
  "select count(distinct table_name) from information_schema.columns where column_name = 'seo_source' and table_name in ('hub_parts', 'services');"

echo "→ IA: garaje y mantenimiento (migracion 0058)"
MT_MAKE="$(scalar "select id from vehicle_makes where slug = 'toyota';" | tail -1)"
MT_MODEL="$(scalar "select id from vehicle_models where make_id = $MT_MAKE and slug = 'corolla';" | tail -1)"
scalar "delete from profile_vehicles where user_id in ('$USER_A', '$USER_B'); insert into profile_vehicles (user_id, make_id, model_id, year) values ('$USER_A', $MT_MAKE, $MT_MODEL, 2016), ('$USER_B', $MT_MAKE, $MT_MODEL, 2016);" >/dev/null
MT_PVA="$(scalar "select id from profile_vehicles where user_id = '$USER_A';" | tail -1)"
MT_PVB="$(scalar "select id from profile_vehicles where user_id = '$USER_B';" | tail -1)"
MT_CAT="$(scalar "select slug from product_categories limit 1;" | tail -1)"
MT_SVC="$(scalar "select slug from services where slug is not null order by id limit 1;" | tail -1)"
ITEMS="[{\"key\":\"aceite\",\"label\":\"Aceite y filtro\",\"every_km\":5000,\"every_months\":4,\"severity\":\"severo\",\"category_slug\":\"$MT_CAT\",\"service_slug\":\"$MT_SVC\"},{\"key\":\"bujias\",\"label\":\"Bujías\",\"every_km\":40000,\"every_months\":null,\"severity\":\"normal\",\"category_slug\":\"no-existe\",\"service_slug\":\"tampoco\"}]"

check "la edge guarda una guia para Toyota Corolla 2014-2019" "1" "set role service_role; select ai_save_maintenance_template($MT_MAKE, $MT_MODEL, 2014, 2019, 'Motor 1.8', '$ITEMS'::jsonb, 'haiku')::text is not null and true; select count(*) from vehicle_maintenance_templates;"
check "un category_slug o service_slug que no existe se vuelve nulo (nunca un enlace inventado)" "true|true" \
  "select (items->1->'category_slug' = 'null'::jsonb)::text || '|' || (items->1->'service_slug' = 'null'::jsonb)::text from vehicle_maintenance_templates;"
check "los que si existen se conservan" "true" "select (items->0->>'category_slug' = '$MT_CAT')::text from vehicle_maintenance_templates;"
check "la guia nace sin revisar y de la IA" "ia|false" "select source || '|' || reviewed::text from vehicle_maintenance_templates;"
check "un modelo de otra marca se rechaza" "ERROR:  Ese modelo no es de esa marca." "set role service_role; select ai_save_maintenance_template($MT_MAKE + 1, $MT_MODEL, 2014, 2019, null, '[]'::jsonb, 'x');"
check "un rango de mas de 14 años se rechaza" 'ERROR:  new row for relation "vehicle_maintenance_templates" violates check constraint "vehicle_maintenance_templates_years"' "insert into vehicle_maintenance_templates (make_id, model_id, year_from, year_to) values ($MT_MAKE, $MT_MODEL, 2000, 2020);"
check "un renglon sin intervalo se rechaza" 'ERROR:  new row for relation "vehicle_maintenance_templates" violates check constraint "vehicle_maintenance_templates_items_check"' \
  "insert into vehicle_maintenance_templates (make_id, model_id, year_from, year_to, items) values ($MT_MAKE, $MT_MODEL, 2020, 2022, '[{\"key\":\"x\",\"label\":\"Algo\",\"severity\":\"normal\"}]');"
check "find_maintenance_template encuentra la del año" "true" "set role service_role; select (find_maintenance_template($MT_MAKE, $MT_MODEL, 2016) is not null)::text;"
check "y no la de un año fuera del rango" "" "set role service_role; select coalesce(find_maintenance_template($MT_MAKE, $MT_MODEL, 2010)::text, '');"
check "anon no lee las guias" 'ERROR:  permission denied for table vehicle_maintenance_templates' "$(as_anon 'select count(*) from vehicle_maintenance_templates;')"
check "quien tiene sesion si las lee" "1" "$(as_user "$USER_A" 'select count(*) from vehicle_maintenance_templates;')"
check "pero no las edita" "0" "$(as_user "$USER_A" "with u as (update vehicle_maintenance_templates set reviewed = true returning 1) select count(*) from u;")"
check "un admin la revisa" "t" "$(as_user "$ADMIN" "update vehicle_maintenance_templates set reviewed = true returning reviewed;")"
check "y editar sus renglones la marca como de un admin" "admin" "update vehicle_maintenance_templates set items = jsonb_set(items, '{0,label}', '\"Aceite (revisado)\"'); select source from vehicle_maintenance_templates;"
scalar "update vehicle_maintenance_templates set items = jsonb_set(items, '{0,label}', '\"Aceite y filtro\"');" >/dev/null
scalar "update vehicle_maintenance_templates set source = 'ia', reviewed = false;" >/dev/null
check "ai_save_maintenance_template es de la edge" "$(denied ai_save_maintenance_template)" "$(as_user "$ADMIN" "select ai_save_maintenance_template($MT_MAKE, $MT_MODEL, 2014, 2019, null, '[]'::jsonb, 'x');")"
check "find_maintenance_template tambien" "$(denied find_maintenance_template)" "$(as_user "$USER_A" "select find_maintenance_template($MT_MAKE, $MT_MODEL, 2016);")"

# El dueño copia la guia a su vehiculo.
check "el dueño adopta la guia: copia los 2 renglones" "2" "$(as_user "$USER_A" "select adopt_maintenance_template($MT_PVA);")"
check "una segunda vez no copia nada (no duplica)" "0" "$(as_user "$USER_A" "select adopt_maintenance_template($MT_PVA);")"
check "otro usuario no adopta en un vehiculo ajeno" "ERROR:  Ese vehículo no es tuyo." "$(as_user "$USER_B" "select adopt_maintenance_template($MT_PVA);")"
check "anon no invoca adopt_maintenance_template" "$(denied adopt_maintenance_template)" "$(as_anon "select adopt_maintenance_template($MT_PVA);")"
check "los renglones nacen de la IA y sin fechas (estado ok: no se inventa un vencimiento)" "ia|ok|" "$(as_user "$USER_A" "select source || '|' || status || '|' || coalesce(due_on::text, '') from vehicle_maintenance_items where template_key = 'aceite';")"
check "el dueño ve los suyos" "2" "$(as_user "$USER_A" "select count(*) from vehicle_maintenance_items;")"
check "y el otro no ve los de el" "0" "$(as_user "$USER_B" "select count(*) from vehicle_maintenance_items;")"
check "un admin ve todo" "2" "$(as_user "$ADMIN" "select count(*) from vehicle_maintenance_items;")"
check "anon no lee el mantenimiento" 'ERROR:  permission denied for table vehicle_maintenance_items' "$(as_anon 'select count(*) from vehicle_maintenance_items;')"

# Registrar servicio hecho: calcula la proxima vez y el estado.
MT_ACEITE="$(scalar "select id from vehicle_maintenance_items where template_key = 'aceite';" | tail -1)"
check "sin kilometraje, registrar el aceite de hoy deja 'ok' con la proxima en 4 meses" "ok|true" "$(as_user "$USER_A" "select log_maintenance_done($MT_ACEITE);") select status || '|' || (due_on = (current_date + interval '4 months')::date)::text from vehicle_maintenance_items where id = $MT_ACEITE;"
check "el kilometraje del dueño (80,000) y el ultimo hecho a 70,000: toca a los 75,000: ya esta vencido" "vencido" \
  "$(as_user "$USER_A" "select set_vehicle_odometer($MT_PVA, 80000);") $(as_user "$USER_A" "select log_maintenance_done($MT_ACEITE, current_date, 70000);") select status from vehicle_maintenance_items where id = $MT_ACEITE;"
check "con el kilometraje a 500 de la meta, esta 'pronto'" "pronto" "$(as_user "$USER_A" "select set_vehicle_odometer($MT_PVA, 74600);") select status from vehicle_maintenance_items where id = $MT_ACEITE;"
check "y a 4,000 de la meta, 'ok'" "ok" "$(as_user "$USER_A" "select set_vehicle_odometer($MT_PVA, 71000);") select status from vehicle_maintenance_items where id = $MT_ACEITE;"
check "una fecha de servicio vieja (hace 5 meses) vence por tiempo" "vencido" "$(as_user "$USER_A" "select log_maintenance_done($MT_ACEITE, (current_date - interval '5 months')::date, 71000);") select status from vehicle_maintenance_items where id = $MT_ACEITE;"
check "una fecha futura se rechaza" "ERROR:  La fecha no puede ser futura." "$(as_user "$USER_A" "select log_maintenance_done($MT_ACEITE, current_date + 3, 71000);")"
check "el kilometraje fuera de rango se rechaza" "ERROR:  El kilometraje tiene que estar entre 0 y 1,500,000." "$(as_user "$USER_A" "select set_vehicle_odometer($MT_PVA, -5);")"
check "otro usuario no cambia el kilometraje ajeno" "ERROR:  Ese vehículo no es tuyo." "$(as_user "$USER_B" "select set_vehicle_odometer($MT_PVA, 100);")"
check "ni registra servicio en un renglon ajeno" "ERROR:  Ese renglón no es tuyo." "$(as_user "$USER_B" "select log_maintenance_done($MT_ACEITE);")"
check "el dueño no puede escribir fechas ni estado directo: un update de estado falla" 'ERROR:  permission denied for table vehicle_maintenance_items' "$(as_user "$USER_A" "update vehicle_maintenance_items set status = 'ok' where id = $MT_ACEITE;")"
check "ni pasarse un renglon como 'taller'" 'ERROR:  new row violates row-level security policy for table "vehicle_maintenance_items"' \
  "$(as_user "$USER_A" "insert into vehicle_maintenance_items (profile_vehicle_id, label, every_km, source) values ($MT_PVA, 'Algo', 5000, 'taller');")"
check "pero puede agregar uno propio" "usuario|ok" "$(as_user "$USER_A" "insert into vehicle_maintenance_items (profile_vehicle_id, label, every_km) values ($MT_PVA, 'Cambio de plumillas', 20000) returning source || '|' || status;")"
check "no agrega en el garaje de otro" 'ERROR:  new row violates row-level security policy for table "vehicle_maintenance_items"' "$(as_user "$USER_B" "insert into vehicle_maintenance_items (profile_vehicle_id, label, every_km) values ($MT_PVA, 'Intruso', 5000);")"
check "un renglon sin ningun intervalo se rechaza" 'ERROR:  new row for relation "vehicle_maintenance_items" violates check constraint "vehicle_maintenance_items_interval"' "$(as_user "$USER_A" "insert into vehicle_maintenance_items (profile_vehicle_id, label) values ($MT_PVA, 'Sin intervalo');")"
check "el dueño borra un renglon suyo" "1" "$(as_user "$USER_A" "with d as (delete from vehicle_maintenance_items where label = 'Cambio de plumillas' returning 1) select count(*) from d;")"

check "el dueño prende los recordatorios de su vehiculo" "true" "$(as_user "$USER_A" "select set_vehicle_reminders($MT_PVA, true);") select maintenance_reminders::text from profile_vehicles where id = $MT_PVA;"
check "y los apaga" "false" "$(as_user "$USER_A" "select set_vehicle_reminders($MT_PVA, false);") select maintenance_reminders::text from profile_vehicles where id = $MT_PVA;"
check "otro usuario no toca los de un vehiculo ajeno" "ERROR:  Ese vehículo no es tuyo." "$(as_user "$USER_B" "select set_vehicle_reminders($MT_PVA, true);")"
check "anon no invoca set_vehicle_reminders" "$(denied set_vehicle_reminders)" "$(as_anon "select set_vehicle_reminders($MT_PVA, true);")"

# Registro automatico desde el taller.
scalar "update vehicle_maintenance_items set service_slug = '$MT_SVC' where id = $MT_ACEITE; update vehicle_maintenance_items set service_slug = null where id <> $MT_ACEITE and profile_vehicle_id = $MT_PVA;" >/dev/null
scalar "update profile_vehicles set odometer_km = 90000 where id = $MT_PVA; delete from net.calls;" >/dev/null
MT_SVC_ID="$(scalar "select id from services where slug = '$MT_SVC';" | tail -1)"
scalar "set session_replication_role = replica; insert into service_appointments (user_id, service_id, profile_vehicle_id, vehicle_text, contact_name, contact_phone, scheduled_at, status) values ('$USER_A', $MT_SVC_ID, $MT_PVA, 'Corolla', 'Ana', '8095550190', now() - interval '1 hour', 'in_progress'); reset session_replication_role;" >/dev/null
check "una cita que pasa a 'hecha' y coincide con UN renglon lo registra con source taller y el km del vehiculo" "taller|90000|ok" \
  "update service_appointments set status = 'done' where contact_phone = '8095550190'; select source || '|' || last_done_km || '|' || status from vehicle_maintenance_items where id = $MT_ACEITE;"
check "sin los secretos del Vault no avisa, pero tampoco falla" "0" "select count(*) from net.calls;"
scalar "insert into vault.decrypted_secrets (name, decrypted_secret) values ('send_push_url', 'https://f.example/functions/v1/send-push'), ('send_push_anon_key', 'anon-key'), ('send_push_secret', 's3cr3t') on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;" >/dev/null
scalar "set session_replication_role = replica; update service_appointments set status = 'in_progress' where contact_phone = '8095550190'; reset session_replication_role;" >/dev/null
check "con los secretos, avisa al cliente con solo el id del renglon" "maintenance_logged|$MT_ACEITE" \
  "update service_appointments set status = 'done' where contact_phone = '8095550190'; select (body->>'kind') || '|' || (body->>'id') from net.calls where body->>'kind' = 'maintenance_logged' order by id desc limit 1;"
scalar "update vehicle_maintenance_items set service_slug = '$MT_SVC' where profile_vehicle_id = $MT_PVA; set session_replication_role = replica; update service_appointments set status = 'in_progress' where contact_phone = '8095550190'; reset session_replication_role; update vehicle_maintenance_items set last_done_on = null, last_done_km = null, source = 'ia' where profile_vehicle_id = $MT_PVA;" >/dev/null
check "si hay DOS renglones con ese servicio no se adivina cual: no registra nada" "ia" \
  "update service_appointments set status = 'done' where contact_phone = '8095550190'; select source from vehicle_maintenance_items where id = $MT_ACEITE;"
scalar "delete from service_appointments where contact_phone = '8095550190'; update vehicle_maintenance_items set service_slug = null where profile_vehicle_id = $MT_PVA;" >/dev/null

# Recordatorios.
scalar "delete from net.calls; update profile_vehicles set maintenance_reminders = true where id = $MT_PVA; set session_replication_role = replica; update vehicle_maintenance_items set last_done_on = current_date - 200, last_done_km = 1000, source = 'usuario' where id = $MT_ACEITE; reset session_replication_role;" >/dev/null
scalar "update vehicle_maintenance_items set label = label where id = $MT_ACEITE;" >/dev/null
check "el renglon vencido y el vehiculo con recordatorios prendidos: manda UN aviso" "1" "select send_maintenance_reminders();"
check "el aviso lleva el tipo y el id del vehiculo (nada mas)" "maintenance_reminder|$MT_PVA" "select (body->>'kind') || '|' || (body->>'id') from net.calls where body->>'kind' = 'maintenance_reminder' order by id desc limit 1;"
check "no vuelve a avisar antes de 14 dias" "0" "select send_maintenance_reminders();"
check "un vehiculo con recordatorios apagados no recibe nada" "0" "update profile_vehicles set maintenance_reminders = false where id = $MT_PVA; delete from maintenance_reminders_sent; select send_maintenance_reminders();"
check "anon no invoca send_maintenance_reminders" "$(denied send_maintenance_reminders)" "$(as_anon 'select send_maintenance_reminders();')"
check "el cron de recordatorios corre a las 13:00 UTC (9:00 a. m. de RD), una sola vez" "1|0 13 * * *" "select count(*) || '|' || min(schedule) from cron.job where jobname = 'maintenance-reminders' and command like '%send_maintenance_reminders%';"
check "los recordatorios nacen apagados" "false" "select maintenance_reminders::text from profile_vehicles where id = $MT_PVB;"
scalar "delete from vault.decrypted_secrets where name in ('send_push_url', 'send_push_anon_key', 'send_push_secret'); delete from net.calls; delete from profile_vehicles where user_id in ('$USER_A', '$USER_B'); delete from vehicle_maintenance_templates;" >/dev/null

echo "→ Camino de actualizacion de la 0058"
apply supabase/migrations/0058_vehicle_maintenance.sql upgrade
apply supabase/migrations/0058_vehicle_maintenance.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "los recordatorios del garaje existente nacen apagados" "0" "select count(*) from profile_vehicles where maintenance_reminders;"

echo "→ Direcciones con coordenadas (migracion 0059)"
scalar "set session_replication_role = replica; update orders set status = 'awaiting_payment', fulfillment_type = 'shipping', shipping_geo = null where id = '$ORD1';" >/dev/null
GEO='{"lat": 18.4861, "lng": -69.9312, "place_id": "ChIJabc", "formatted": "Av. Winston Churchill, Santo Domingo", "province": "Distrito Nacional", "municipality": "Santo Domingo de Guzmán", "sector": "Piantini", "geo_confidence": "alta", "algo_raro": "se descarta"}'

check "un invitado guarda las coordenadas de su pedido recien creado" "true" "$(as_anon "select set_order_geo('$ORD1', '$GEO'::jsonb)::text;")"
check "quedan solo los campos esperados, sin lo raro" "alta|18.4861|false" "select (shipping_geo->>'geo_confidence') || '|' || (shipping_geo->>'lat') || '|' || (shipping_geo ? 'algo_raro')::text from orders where id = '$ORD1';"
check "una segunda vez no reescribe (ya tiene coordenadas)" "false" "$(as_anon "select set_order_geo('$ORD1', '{\"lat\": 1, \"lng\": 1}'::jsonb)::text;")"
check "y las coordenadas siguen siendo las primeras" "18.4861" "select shipping_geo->>'lat' from orders where id = '$ORD1';"
scalar "update orders set shipping_geo = null where id = '$ORD1';" >/dev/null
check "un pedido que ya esta pagado no se toca" "false" "set session_replication_role = replica; update orders set status = 'paid' where id = '$ORD1'; reset session_replication_role; $(as_anon "select set_order_geo('$ORD1', '$GEO'::jsonb)::text;")"
scalar "set session_replication_role = replica; update orders set status = 'awaiting_payment', fulfillment_type = 'pickup' where id = '$ORD1';" >/dev/null
check "un pedido de retiro no lleva coordenadas de entrega" "false" "$(as_anon "select set_order_geo('$ORD1', '$GEO'::jsonb)::text;")"
scalar "set session_replication_role = replica; update orders set fulfillment_type = 'shipping' where id = '$ORD1';" >/dev/null
check "un pedido que no existe devuelve false (nunca un error)" "false" "$(as_anon "select set_order_geo('00000000-0000-0000-0000-000000000000', '$GEO'::jsonb)::text;")"
check "un dato mal formado no rompe: false" "false" "$(as_anon "select set_order_geo('$ORD1', '{\"lat\": \"norte\", \"lng\": 1}'::jsonb)::text;")"
check "coordenadas fuera de rango: false (el check de la tabla las rechaza)" "false" "$(as_anon "select set_order_geo('$ORD1', '{\"lat\": 400, \"lng\": 1}'::jsonb)::text;")"
check "un no-objeto devuelve false" "false" "$(as_anon "select set_order_geo('$ORD1', '[1,2]'::jsonb)::text;")"
check "una confianza inventada se rechaza por el check" 'ERROR:  new row for relation "orders" violates check constraint "orders_shipping_geo_check"' "update orders set shipping_geo = '{\"lat\": 1, \"lng\": 1, \"geo_confidence\": \"altisima\"}' where id = '$ORD1';"
check "anon no ve las coordenadas de los pedidos (RLS: 0 filas)" "0" "$(as_anon 'select count(*) from orders where shipping_geo is not null;')"
check "un admin las lee" "true" "$(as_user "$ADMIN" "update orders set shipping_geo = null where id = '$ORD1'; select 'true';")"
scalar "update orders set shipping_geo = null where id = '$ORD1';" >/dev/null

# La direccion del taller admite coordenadas.
check "la direccion del taller admite lat y lng validos" "-69.93" "set request.jwt.claim.role = 'service_role'; update site_settings set value = jsonb_set(jsonb_set(value, '{lat}', '18.48'), '{lng}', '-69.93') where key = 'pickup_address'; select value->>'lng' from site_settings where key = 'pickup_address';"
check "una latitud fuera de rango se rechaza" 'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_pickup_geo_valid"' "set request.jwt.claim.role = 'service_role'; update site_settings set value = jsonb_set(value, '{lat}', '123') where key = 'pickup_address';"
check "y una que no es numero tambien" 'ERROR:  new row for relation "site_settings" violates check constraint "site_settings_pickup_geo_valid"' "set request.jwt.claim.role = 'service_role'; update site_settings set value = jsonb_set(value, '{lat}', '\"norte\"') where key = 'pickup_address';"
scalar "set request.jwt.claim.role = 'service_role'; update site_settings set value = value - 'lat' - 'lng' where key = 'pickup_address';" >/dev/null

# Maps tiene su propio tope y no el 30 % de lo publico.
scalar "delete from ai_usage; insert into ai_usage (feature, model, cost_usd) values ('maps_autocomplete', 'google', 4);" >/dev/null
check "Maps con 4 de 10 de gasto sigue disponible (el 30 % de lo publico es de la IA)" "ok|true" "set role service_role; select tier || '|' || public_ok::text from ai_budget_status('maps');"
check "y la IA no se entera del gasto de Maps" "ok|0" "set role service_role; select tier || '|' || spent_usd::int from ai_budget_status('ai');"
scalar "delete from ai_usage;" >/dev/null

echo "→ Camino de actualizacion de la 0059"
apply supabase/migrations/0059_geo.sql upgrade
apply supabase/migrations/0059_geo.sql upgrade
echo "   (aplicada dos veces)"
CHECK_DB=upgrade check "la columna de coordenadas existe y nace nula en los pedidos de antes" "0" "select count(*) from orders where shipping_geo is not null;"

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
