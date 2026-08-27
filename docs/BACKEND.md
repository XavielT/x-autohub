# Backend — Supabase

Todo el código ya está escrito. Falta crear el proyecto y pegar dos valores.

Mientras `supabaseUrl` esté vacío, la app corre con los mocks locales: puedes
clonar el repo y hacer `npm start` sin configurar nada.

---

## Puesta en marcha (15 minutos)

### 1. Crear el proyecto

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Nombre: `x-autohub`. Región: **East US (North Virginia)** — es la más cercana
   a RD y la latencia se nota.
3. Guarda la contraseña de la base en tu gestor de contraseñas. No va al repo.

### 2. Ejecutar las migraciones

En el **SQL Editor** del dashboard, ejecuta estos archivos **en orden**. Cada uno
en una consulta aparte, y revisa que termine sin error antes de seguir:

| Orden | Archivo                                        | Qué hace                                       |
| ----- | ---------------------------------------------- | ---------------------------------------------- |
| 1     | `supabase/migrations/0001_schema.sql`          | Tablas, tipos enum y el trigger de perfiles    |
| 2     | `supabase/migrations/0002_rls.sql`             | Row Level Security — **no lo saltes**          |
| 3     | `supabase/migrations/0003_storage.sql`         | Buckets de imágenes y sus políticas            |
| 4     | `supabase/migrations/0004_rename_stars_rating.sql` | `stars_calification` → `stars_rating`      |
| 5     | `supabase/migrations/0005_security_fixes.sql`  | Escalada de privilegios, precios y checkout    |
| 6     | `supabase/migrations/0006_profile_privacy.sql` | El correo y el teléfono dejan de ser públicos  |
| 7     | `supabase/migrations/0007_admin_module.sql`    | Panel de admin: versiones, usuarios y permisos |
| 8     | `supabase/migrations/0008_inventory_storage.sql` | Bucket de imágenes del inventario propio     |
| 9     | `supabase/migrations/0009_own_profile.sql`     | Leer el propio perfil, con su correo y teléfono |
| 10    | `supabase/migrations/0010_listing_contact_phone.sql` | Teléfono de contacto en la publicación   |
| 11    | `supabase/migrations/0011_user_roles.sql`      | Roles: admin > moderador > user                |
| 12    | `supabase/migrations/0012_publication_moderation.sql` | Aprobación de publicaciones de Hub Market |
| 13    | `supabase/migrations/0013_test_items.sql`      | Artículos de prueba y usuarios de prueba       |
| 14    | `supabase/migrations/0014_site_settings.sql`   | Ajustes del sitio y los contadores del home    |
| 15    | `supabase/migrations/0015_admin_function_grants.sql` | `anon` deja de poder invocar las funciones de admin |
| 16    | `supabase/seed.sql`                            | Los mismos datos que ves hoy con los mocks     |

> El seed va **al final**: usa `stars_rating` (0004), `contact_phone` (0010),
> `status` (0012) e `is_test` (0013). Y las dependencias entre migraciones son
> reales: la **0012 usa `is_moderator_or_admin()`**, que crea la 0011, y la
> **0013 rehace las políticas de select de 0002 y 0012** — aplicarla antes
> dejaría a esas políticas sin el filtro de prueba, o directamente sin existir.
> El orden no es decorativo.

> ⚠️ Sin el paso 2 tu base queda abierta: la clave anon es pública y va en el
> bundle del navegador. Lo único que impide que cualquiera borre tus datos son
> esas políticas.

### 3. Pegar las credenciales

Dashboard → **Project Settings → API**. Copia `Project URL` y la clave
`anon` / `public` a `src/environments/environment.ts`:

```ts
export const environment: AppEnvironment = {
  production: false,
  useMockData: false,
  supabaseUrl: 'https://abcdefghijk.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
};
```

Repite en `environment.production.ts` con el proyecto de producción (o el mismo,
si por ahora hay uno solo).

**La clave `service_role` NUNCA va en estos archivos.** Se salta todo RLS, y
Angular compila `environment.ts` dentro del bundle del navegador: pegarla ahí la
publica. Si alguna vez la pones por error, rótala de inmediato desde el
dashboard.

Para las tareas de administración desde la línea de comandos va en `.env.local`,
que está en `.gitignore` y no se compila dentro de la app:

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

### 4. Configurar Auth

Dashboard → **Authentication → Providers → Email**:

- **Confirm email**: apágalo mientras desarrollas, o cada registro de prueba
  quedará esperando un correo. Enciéndelo antes de salir a producción.
- **Site URL**: `http://localhost:4200` en desarrollo; el dominio real en producción.
- **Redirect URLs**: agrega ambos.

### 5. Probar

```bash
npm start
```

- El home debe mostrar los mismos vehículos y noticias que antes (ahora desde la
  base de datos).
- Crea una cuenta en `/registro`. En **Authentication → Users** debe aparecer el
  usuario, y en **Table Editor → profiles** su perfil (lo crea el trigger).
- Publica algo en `/publicar`. La imagen debe aparecer en **Storage → listings**
  dentro de una carpeta con tu uid.

Si algo falla, la consola del navegador trae el error real de Postgrest: los
mensajes en pantalla están traducidos, pero el detalle técnico se registra con
`console.error('[supabase]', …)`.

---

## Cómo está armado

```
Componente
    ↓  (Observable)
Servicio  ──→  supabase.shouldUseMockData()
                   ├── true  → mock local de src/shared/data/*.mock.ts
                   └── false → supabase.db.from('tabla').select(...)
                                     ↓
                                 mappers.ts   (snake_case → camelCase)
                                     ↓
                                 modelo del frontend
```

Piezas:

| Archivo                                   | Responsabilidad                                    |
| ----------------------------------------- | -------------------------------------------------- |
| `core/supabase/supabase.service.ts`       | Crea el cliente (perezoso) y decide mock vs. real   |
| `core/supabase/database.types.ts`         | Tipos espejo del esquema SQL                        |
| `core/supabase/mappers.ts`                | Traducción entre filas y modelos                    |
| `core/supabase/supabase-error.ts`         | Errores de Postgrest → español                      |
| `shared/services/*.service.ts`            | Un servicio por dominio, con el interruptor adentro |

Ningún componente sabe si los datos vienen de la base o de un mock.

---

## Seguridad: qué protege qué

La clave anon es pública. La seguridad real está en RLS:

| Tabla                           | Leer                | Escribir                            |
| ------------------------------- | ------------------- | ----------------------------------- |
| `services`, `social_clubs`, `social_events` | Todos | Solo admin (`is_admin()`) |
| `auto_hub_vehicles`, `hub_parts`, `news` | Todos, **salvo las filas `is_test`**, que solo ve `can_see_test_items()` | Solo admin (`is_admin()`) |
| `hub_market_items`              | Todos (activos **y aprobados**); su dueño ve lo suyo en cualquier estado; moderador+ ve todo — y todo ello **solo si no es `is_test`**, o si `can_see_test_items()` | Solo el dueño (`seller_id = auth.uid()`). Las columnas de moderación, solo `moderate_publication()`; `is_test`, solo moderador+ |
| `social_posts`                  | Todos               | Solo el autor                        |
| `profiles`                      | Todos               | Solo el propio                       |
| `club_subscriptions`            | Solo admin          | Cualquiera puede insertar            |
| `orders`, `order_items`         | Solo el dueño       | Cualquiera puede crear el suyo       |

El `with check (seller_id = auth.uid())` de Hub Market es lo que impide publicar
en nombre de otro, incluso desde un cliente manipulado.

### Roles (migración 0011)

Tres niveles, en `profiles.role`:

| Rol | Puede |
| --- | --- |
| `admin` | Todo. Es **el único** que reparte roles. |
| `moderador` | Aprobar y rechazar publicaciones de Hub Market. Nada más. |
| `user` | El valor por defecto de cualquier cuenta nueva. |

**`role` es la fuente de verdad; `is_admin` es un espejo** que un trigger deriva
de él y que se conserva solo por compatibilidad — de la columna dependían el
grant de 0006, dos funciones y el bundle ya desplegado. **No escribas `is_admin`
directamente**: el trigger lo recalcula desde `role` y tu cambio se pierde sin
dar error. Fue exactamente lo que le pasó a `scripts/make-admin.mjs`.

`role` está congelado por el mismo trigger que `is_admin` e `is_verified`, y por
la misma razón que documenta 0005: RLS no filtra por columna, así que "solo tu
propia fila" no impide que esa fila traiga `role = 'admin'`.

Dos helpers para las políticas: `is_admin()` (ahora lee `role`) y
`is_moderator_or_admin()`. La jerarquía vive ahí y no repetida en cada política.

### El panel de administración (migraciones 0007 y 0011)

`/admin` lo abre quien pueda moderar; **cada sección de admin lleva además su
propio `adminGuard`**. Los guards deciden qué se dibuja, pero **la seguridad está
en la base**: RLS y funciones que vuelven a comprobar el rol dentro de Postgres.
Quien fuerce la URL verá pantallas vacías y errores.

| Pieza | Para qué |
| --- | --- |
| Tabla `releases` | El historial de versiones. Lectura pública de lo publicado, escritura solo admin. |
| `admin_list_users()` | Listar cuentas **con su correo**. Hace falta porque las políticas de columna de 0006 lo esconden a cualquier sesión del navegador, admin incluido: los permisos de columna son por rol, no por condición. Sigue exigiendo **admin**: un moderador no tiene por qué ver los correos de todos. |
| `set_user_role()` | Cambiar el rol y la verificación de otro usuario. Hace falta porque la política de `profiles` solo deja editar tu propia fila y el trigger congela esas columnas. **Exige admin**: un moderador no nombra a nadie, ni siquiera a otro moderador. |
| `set_user_admin()` | **Obsoleta.** Envoltorio de `set_user_role()` para clientes viejos; degrada a `user`, no a `moderador`. |
| `set_user_test()` | Marcar una cuenta como usuario de prueba (migración 0013). Función aparte y no un parámetro de `set_user_role()` porque **no es un rol**: quien la tiene sigue siendo `user`. **Exige admin.** |

Todas son `security definer` y **empiezan comprobando el rol**. Sin esa
comprobación serían un agujero peor que el que cerró 0005, porque
`security definer` se salta RLS por completo. Si añades otra, mantén ese patrón.

`set_user_role()` rechaza que un admin se degrade a sí mismo: si es el único,
dejaría el panel sin dueño y sin forma de volver a entrar salvo con la
`service_role`.

### Moderación de publicaciones (migración 0012)

Lo que publica la comunidad nace en `status = 'pendiente'` y no se ve en el sitio
hasta que alguien lo aprueba. Quien modera publica directo en `aprobado`.

Dos piezas, y hacen cosas distintas:

- **El trigger de congelado** es lo que cierra la puerta. Sin él, el dueño de una
  publicación se aprueba solo mandando `status` en un update normal — RLS no
  puede impedirlo, porque no filtra por columna.
- **`moderate_publication(id, decision, motivo)`** es la puerta, no la barrera:
  deja estado, motivo, quién revisó y cuándo en una sola transacción. Exige
  moderador o admin, y un motivo de 10+ caracteres al rechazar.

Es el mismo reparto que usan los privilegios de perfil (trigger 0005 +
`set_user_role` 0011). Se repite a propósito.

La política de select tiene tres ramas: cualquiera ve lo activo y aprobado, el
dueño ve lo suyo en cualquier estado, y quien modera ve todo. La migración 0013
la reescribe para meter las tres bajo un `and` con el filtro de prueba.

### Artículos de prueba y usuarios de prueba (migración 0013)

Sirve para meter contenido falso en el sitio **en vivo** —una pieza, un vehículo,
una publicación, una noticia— y probar el flujo completo sin montar un entorno
aparte y sin que ningún visitante se lo encuentre.

- `is_test` en `auto_hub_vehicles`, `hub_parts`, `hub_market_items` y `news`.
- `is_test_user` en `profiles`.
- `can_see_test_items()` → `is_moderator_or_admin()` **o** `is_test_user`.

**El filtro va dentro de cada política de select, unido con `and`.** Una política
aparte no habría servido: varias políticas de select sobre la misma tabla se
combinan con `or`, así que la vieja habría seguido dejando pasar las filas de
prueba. Por eso 0013 reemplaza las cuatro políticas enteras — si algún día
cambias una condición de 0002 o 0012, cámbiala **ahí**, que es la que queda viva.

Consecuencia a tener presente: en `hub_market_items` la rama del dueño también
queda bajo el `and`. Si se marca como prueba la publicación de un usuario normal,
**ese usuario deja de verla en su propio perfil**. Es lo correcto para lo que la
marca significa, pero marcar contenido ajeno no es inocuo.

Las dos columnas están congeladas, por lo de siempre —RLS no filtra por columna:

- `is_test_user` se suma al trigger de perfiles (0005 → 0007 → 0011 → 0013). Sin
  eso cualquiera se auto-marcaría y tendría acceso de lectura a todo lo oculto.
- `is_test` de `hub_market_items` se suma al trigger de 0012, pero con su propia
  condición: aquí **sí** basta con dejar pasar a quien modera, con un `update`
  normal. No hay transición de estado que dejar consistente, así que no hay
  función que valga la pena. En las otras tres tablas no hace falta congelar
  nada: sus políticas de update ya son solo admin.

`create_order()` se redefine con `and (not h.is_test or can_see_test_items())`
en el join del subtotal. Un usuario de prueba **tiene** que poder comprar una
pieza de prueba —es para lo que existe— pero la función es `security definer` y
se salta RLS, así que sin esa condición le vendería la pieza a cualquiera que
adivinara el id. Quien no deba verla recibe el mismo mensaje que si estuviera
descatalogada.

En modo simulado no hay RLS y el filtro lo hace la app, con un único predicado en
`src/shared/utils/test-visibility.ts`. Ahí la sesión de prueba se finge por
correo, como el rol: `prueba@…` o `test@…`.

**Las imágenes del inventario propio van al bucket `inventory`** (migración
0008), no a `listings`. La diferencia importa: en `listings` y `avatars` la
política exige que la primera carpeta de la ruta sea el uid de quien sube, y un
vehículo oficial no pertenece a una persona. En `inventory` el permiso lo decide
`is_admin()`, así que la ruta se organiza por tipo: `piezas/`, `vehiculos/`,
`noticias/`.

> Para el primer admin no hay panel todavía: regístrate y corre
> `node scripts/make-admin.mjs tu@correo.com`.

### Quién puede invocar cada función (migración 0015)

Hay dos permisos distintos y conviene no confundirlos: **quién puede llamar** a
una función (el `grant execute`) y **quién puede hacer algo con ella** (el
`if not is_admin() then raise` de dentro). Las funciones de admin de 0009, 0011 y
0012 tenían el segundo bien puesto y el primero mal:

```sql
revoke all on function public.admin_list_users() from public;   -- no alcanza
grant execute on function public.admin_list_users() to authenticated;
```

`revoke ... from public` **no le quita el permiso a `anon`**: en el proyecto de
Supabase las funciones nuevas del esquema `public` nacen con un grant *directo* a
`anon` y `authenticated` por los default privileges de la plataforma, y revocarle
al pseudo-rol PUBLIC no toca esos grants. Con la clave anon —que es pública— se
podía invocar `set_user_role()`; respondía `42501` por la comprobación interna,
que es la que de verdad protegía.

La 0015 lo cierra en seis funciones: `admin_list_users`, `get_my_profile`,
`moderate_publication`, `set_user_admin`, `set_user_role` y `set_user_test`.

**Lo que NO se revoca**, porque rompería el sitio:

| Función | Por qué `anon` la necesita |
| ------- | -------------------------- |
| `is_admin()`, `is_moderator_or_admin()`, `can_see_test_items()` | Las llaman las políticas RLS, y una política se evalúa con los permisos de quien consulta. Sin execute, **cada select anónimo falla**. |
| `create_order(...)` | El checkout de invitado, a propósito desde 0002. |
| `get_site_stats()` | El home sin sesión. |

> El idiom completo para una función nueva son **tres** líneas:
>
> ```sql
> revoke all     on function f() from public;
> revoke execute on function f() from anon;      -- la que se olvidaba
> grant  execute on function f() to authenticated;
> ```

### Ajustes del sitio y contadores (migración 0014)

Dos cosas que la sección de contadores del home necesita: un ajuste que diga qué
números mostrar, y una función que los cuente.

**`site_settings`** — clave/valor, `value` en `jsonb`. Hoy una sola clave:

| Clave        | Valores                 | Qué hace                                            |
| ------------ | ----------------------- | --------------------------------------------------- |
| `stats_mode` | `"showcase"` \| `"real"` | Si el home muestra los números de impresión o los reales |

La lee **cualquiera**, incluido `anon`: el home tiene que funcionar sin sesión.
La escritura no tiene política **a propósito** — sin política RLS niega, así que
no hay `update` desde el navegador que pueda tocarla. El único camino es:

```sql
select * from set_site_setting('stats_mode', '"real"');
```

`security definer`, comprueba `is_admin()` dentro de Postgres, y solo cambia
claves que ya existen (un ajuste nuevo nace en una migración, con su `check`).
Un moderador no entra: los ajustes del sitio no son moderación de contenido.

Hay además un trigger, `guard_site_settings_write`, que hoy no protege de nada:
está para el día en que alguien agregue una política de escritura "para editar
los ajustes desde el Table Editor" y reabra el agujero sin darse cuenta. Misma
defensa en profundidad que el congelado de 0005.

**`get_site_stats()`** — los tres contadores en una llamada:

```sql
select * from get_site_stats();
--  vehicles | parts | members
-- ----------+-------+---------
--        10 |    35 |       2
```

Es `security definer` por **miembros**: contar `profiles` con la clave anon es
imposible a propósito. Devuelve **solo números**, ninguna fila. Y como
`security definer` se salta RLS, las condiciones de visibilidad van escritas
dentro de la función: `is_available`/`is_active`, `status = 'aprobado'`, y nada
de `is_test`. Eso es deliberado — los contadores dicen lo mismo a todo el mundo.
Sin ello, un admin (que por RLS ve el contenido de prueba y lo pendiente) leería
en el home unos números que ningún visitante ve.

> **Si cambian las políticas de select de 0013, hay que cambiar esta función.**
> Es el precio de saltarse RLS a propósito, y está anotado también dentro del
> SQL.

El ajuste se cambia desde `/admin/ajustes`, que enseña los dos modos con sus
números al lado antes de tocar nada.

### Datos privados del perfil (migración 0006)

`email` y `phone` de `profiles` **no** son legibles con la clave anon ni con una
sesión normal: antes cualquiera podía descargar el correo y el teléfono de todos
los usuarios. Solo la `service_role` los ve.

Dos consecuencias prácticas:

- **No pidas `select('*')` sobre `profiles`.** Falla con
  `permission denied for table profiles`. Pide las columnas públicas:
  `id, display_name, avatar_url, is_verified, location, created_at, is_admin`.
  Así lo hace ya `auth.service.ts`. **`role` e `is_test_user` no están en esa
  lista** y es a propósito: los propios llegan por `get_my_profile()` y los de
  los demás por `admin_list_users()`, así que ningún select del navegador los
  necesita — y dejarlos fuera evita publicar quién modera y quién prueba.
- **El correo del usuario en sesión sale de Supabase Auth**
  (`db.auth.getUser()`), que es su fuente autoritativa.

Cuando construyas la pantalla de editar perfil, el `update` funciona, pero **no
puede devolver la fila completa** (traería `email` y `phone`). Cualquiera de las
dos formas sirve:

```ts
// Pidiendo de vuelta solo lo permitido
await db.from('profiles').update({ display_name: nombre })
  .eq('id', uid).select('id, display_name, location');

// O sin devolver nada
await db.from('profiles').update({ display_name: nombre }).eq('id', uid);
```

`role`, `is_admin` e `is_verified` se pueden enviar y la petición responde 204,
pero el trigger de 0005 —extendido en 0011— los deja como estaban. Solo los
mueven la `service_role` (es decir, `scripts/make-admin.mjs`) y `set_user_role()`
llamada por un admin.

#### El propio perfil se lee con `get_my_profile()` (migración 0009)

0006 dejó un hueco: **un usuario tampoco podía leer su propio teléfono**, porque
los permisos de columna son por rol y no por fila. `UserModel.phone` era siempre
`undefined` en modo Supabase, así que el checkout nunca precargaba el teléfono y
la página de perfil habría dicho "Sin telefono" con uno guardado.

`get_my_profile()` lo resuelve: `security definer`, **sin parámetros**, así que
solo puede devolver la fila de `auth.uid()` — no hay id que falsear. Es la que usa
`AuthService.loadProfile()`.

Al guardar el perfil, el `update` no pide la fila de vuelta (traería `email` y
`phone`) y después se relee con `loadProfile()`. Se prefiere releer a quedarse con
lo enviado, para que la señal refleje lo que la base guardó de verdad.

### Hacerte admin

Para poder gestionar Auto Hub, el catálogo y las noticias, **regístrate primero**
en `/registro` (el perfil lo crea el trigger, no el comando) y después:

```bash
node scripts/make-admin.mjs tu@correo.com
```

Lee la `service_role` de `.env.local`. Equivale a hacerlo desde el SQL Editor:

```sql
update public.profiles set role = 'admin', is_verified = true
where email = 'tu@correo.com';
```

> **Se escribe `role`, no `is_admin`.** Desde la 0011 `is_admin` es un espejo que
> el trigger deriva de `role`: un `update` sobre la columna espejo se recalcula y
> no promueve a nadie, sin dar error.

### Nombrar un moderador

El primero lo nombra un admin desde `/admin/usuarios`. Desde el SQL Editor es lo
mismo que arriba con otro valor, aunque lo correcto es pasar por la función, que
comprueba quién llama:

```sql
select public.set_user_role(
  (select id from public.profiles where email = 'moderador@correo.com'),
  'moderador'
);
```

---

## Tareas frecuentes

### Cambiar el esquema

1. Crea `supabase/migrations/000N_lo_que_sea.sql` — nunca edites una migración ya
   ejecutada.
2. **Pruébala en un Postgres de verdad antes de tocar la base real:**

   ```bash
   ./scripts/verify-migrations.sh
   ```

   Levanta un cluster temporal con `initdb` (sin sudo, sin Docker), aplica las
   migraciones y el seed **desde cero**, vuelve a aplicar la última (una
   migración tiene que poder ejecutarse dos veces) y corre 38 comprobaciones de
   seguridad con sesiones simuladas: visibilidad pública, contenido de prueba,
   contadores, quién puede invocar cada función y los tres frenos de la escalada
   de privilegios. Sale en rojo con el error real de Postgres.

   Lo que **no** cubre: PostgREST. El `PGRST201` de la ronda 14 era SQL válido
   con un embed ambiguo y solo se vio en el sitio real, así que el humo contra
   producción después de desplegar sigue siendo obligatorio.

3. Ejecútala en el SQL Editor (o por la Management API).
4. Actualiza `core/supabase/database.types.ts` **en el mismo commit**.
5. TypeScript te dirá qué mappers y servicios ajustar.

### Regenerar el seed

> `site_settings` **no** está en el seed, y no es un olvido: la fila
> `stats_mode` la siembra la migración 0014 con `on conflict do nothing`. Si
> estuviera en el seed, regenerarlo devolvería el contador a `showcase` y
> desharía en silencio la elección del admin. El seed es contenido de demo, no
> configuración.


Si cambias un mock y quieres que la base refleje lo mismo:

```bash
node scripts/generate-seed.mjs
```

> El generador se había quedado atrás: no emitía `contact_phone` (fase 4),
> `status` (fase 5) ni el nombre nuevo de `stars_rating` (0004), y `seed.sql`
> traía esas tres cosas por edición a mano. Regenerarlo habría revertido el
> seed en silencio. Se puso al día en la fase 6. **Si añades una columna al
> esquema y al mock, añádela también aquí**: es lo único que evita que el
> archivo generado y su generador se separen otra vez.

### Regenerar los tipos con el CLI (opcional)

```bash
npx supabase gen types typescript --project-id <ref> > src/core/supabase/database.types.ts
```

Ojo: la salida del CLI no trae los comentarios que hoy explican los campos
calculados (`profiles?` en los joins). Revisa el diff antes de aceptarlo.

### Volver a los mocks

`useMockData: true` en el environment. Útil para trabajar la UI sin tocar datos
reales, o para depurar si algo se rompió en la base.

---

## Correo de bienvenida del club

El formulario "Únete al club" del home guarda el correo en `club_subscriptions` y
después manda un correo de bienvenida. El envío lo hace una Edge Function,
`supabase/functions/club-welcome/index.ts`, no la app.

**Mientras no esté configurado, todo sigue funcionando**: la suscripción se
guarda igual y el sitio dice "¡Listo! Ya eres parte del club." en vez de prometer
un correo. La promesa ("Revisa tu correo") solo aparece cuando la función
confirma que lo envió. Eso es deliberado: antes el mensaje prometía un correo que
nadie mandaba.

### Pasos de Xaviel (una sola vez)

1. **Cuenta en Resend** — [resend.com](https://resend.com). El plan gratis da
   3.000 correos al mes, de sobra para esto.
2. **Remitente.** Lo ideal es verificar `xautohubrd.com` en Resend (Domains → Add
   Domain, y copiar los registros DKIM/SPF al DNS del dominio). Mientras eso
   propaga se puede usar el remitente de pruebas de Resend
   (`onboarding@resend.dev`), que **solo puede escribirle a tu propia dirección**
   — sirve para comprobar el flujo, no para suscriptores reales.
3. **Crear la API key** en Resend (API Keys → Create) con permiso de envío.
4. **Cargar los secretos** en el proyecto de Supabase:

   ```bash
   supabase secrets set \
     RESEND_API_KEY=re_xxxxxxxxxxxx \
     CLUB_FROM_EMAIL="X AutoHub <club@xautohubrd.com>" \
     --project-ref <ref>
   ```

   `CLUB_SITE_URL` es opcional; sin él el correo enlaza a
   `https://xautohubrd.com`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los
   inyecta el runtime — **no** hay que darlos de alta.

5. **Desplegar la función:**

   ```bash
   supabase functions deploy club-welcome --project-ref <ref>
   ```

   Sin `--no-verify-jwt`. La verificación del JWT es una de las dos cosas que
   evitan que la función sea un relay abierto (la otra está más abajo).

6. **Probar** desde el sitio: suscribirse con una dirección real en la sección
   del home. Si llega el correo, el mensaje de la página dice "Revisa tu correo";
   si no llega, dice "Ya eres parte del club" — y la consola del navegador tiene
   el motivo (`not-configured`, `send-failed`, …).

> El orden importa poco excepto en una cosa: si se despliega la función **sin**
> los secretos, responde `{ sent: false, reason: 'not-configured' }` y no pasa
> nada. Al revés (secretos sin función) tampoco: el `invoke` falla y el cliente
> se lo traga.

### Por qué no es un relay abierto

La clave anon es pública — va dentro del bundle del sitio —, así que "hace falta
la clave anon" no protege nada por sí solo. Lo que protege es la segunda
comprobación: **la función solo escribe a un correo que acaba de suscribirse.**
Con la clave `service_role` (que el runtime le da, y que no sale del servidor)
consulta `club_subscriptions` y exige que la fila exista y tenga menos de 10
minutos. Con eso:

- No se puede usar para escribirle a un tercero: su dirección no está en la
  tabla.
- No se puede usar para bombardear a un suscriptor: su fila ya no es reciente.
- Lo único que se puede provocar es el correo que el propio flujo iba a mandar.

Y el cliente solo invoca la función cuando el `insert` fue **nuevo**: en un
correo repetido (23505) no la llama, o el botón se convertiría en un reenviador.

### Lo que falta

- **Baja de verdad.** El correo pide responder con "BAJA" y que alguien la
  procese a mano. Lo que toca es una tabla con un token por suscriptor y una
  ruta pública `/baja/:token`, o el `List-Unsubscribe` de Resend. Mientras la
  lista sea pequeña la respuesta a mano alcanza; cuando crezca, no.
- **Reintentos.** Si Resend falla, el correo se pierde: no hay cola. La
  suscripción, que es lo que importa, sí queda guardada.

---

## Las imágenes del seed

`seed.sql` apunta a los assets locales (`assets/imgs/...`) porque son los mismos
que ya venían con los mocks. Las publicaciones nuevas, en cambio, guardan la URL
pública del bucket.

Ambas formas conviven sin problema: el `<img [src]>` no distingue. Cuando subas
las fotos reales del inventario propio a Storage, actualiza esas filas.

---

## Lo que todavía no está

- **Pasarela de pago.** `orders` se crea con estado `pending`; no hay cobro. Los
  métodos de pago son informativos.
- **Correos transaccionales.** Confirmación de pedido, aviso de publicación.
  Mismo camino que el correo de bienvenida del club, que ya está hecho (ver la
  sección de arriba): una Edge Function con Resend.
- **Realtime.** El feed del Social Hub se lee una vez. `supabase.channel()` lo
  volvería vivo sin recargar.
- **Búsqueda con acentos.** Hay un índice `gin` en `hub_parts` con el diccionario
  español, pero los servicios todavía filtran en el cliente. Migrar a
  `.textSearch()` cuando el catálogo crezca.
- **Panel de admin.** Hoy Auto Hub, catálogo y noticias se editan desde el Table
  Editor de Supabase.
