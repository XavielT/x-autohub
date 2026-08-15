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
| 13    | `supabase/seed.sql`                            | Los mismos datos que ves hoy con los mocks     |

> El seed va **al final**: usa `stars_rating` (0004), `contact_phone` (0010) y
> `status` (0012). Y la **0012 depende de la 0011**: usa
> `is_moderator_or_admin()`, que crea la anterior. El orden no es decorativo.

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
| `auto_hub_vehicles`, `hub_parts`, `news`, `services`, `social_clubs`, `social_events` | Todos | Solo admin (`is_admin()`) |
| `hub_market_items`              | Todos (activos **y aprobados**); su dueño ve lo suyo en cualquier estado; moderador+ ve todo | Solo el dueño (`seller_id = auth.uid()`). Las columnas de moderación, solo `moderate_publication()` |
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
dueño ve lo suyo en cualquier estado, y quien modera ve todo.

**Las imágenes del inventario propio van al bucket `inventory`** (migración
0008), no a `listings`. La diferencia importa: en `listings` y `avatars` la
política exige que la primera carpeta de la ruta sea el uid de quien sube, y un
vehículo oficial no pertenece a una persona. En `inventory` el permiso lo decide
`is_admin()`, así que la ruta se organiza por tipo: `piezas/`, `vehiculos/`,
`noticias/`.

> Para el primer admin no hay panel todavía: regístrate y corre
> `node scripts/make-admin.mjs tu@correo.com`.

### Datos privados del perfil (migración 0006)

`email` y `phone` de `profiles` **no** son legibles con la clave anon ni con una
sesión normal: antes cualquiera podía descargar el correo y el teléfono de todos
los usuarios. Solo la `service_role` los ve.

Dos consecuencias prácticas:

- **No pidas `select('*')` sobre `profiles`.** Falla con
  `permission denied for table profiles`. Pide las columnas públicas:
  `id, display_name, avatar_url, is_verified, location, created_at, is_admin`.
  Así lo hace ya `auth.service.ts`. **`role` no está en esa lista** y es a
  propósito: el rol propio llega por `get_my_profile()` y el de los demás por
  `admin_list_users()`, así que ningún select del navegador lo necesita.
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
2. Ejecútala en el SQL Editor.
3. Actualiza `core/supabase/database.types.ts` **en el mismo commit**.
4. TypeScript te dirá qué mappers y servicios ajustar.

### Regenerar el seed

Si cambias un mock y quieres que la base refleje lo mismo:

```bash
node scripts/generate-seed.mjs
```

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
- **Correos transaccionales.** Confirmación de pedido, aviso de publicación. Van
  con Edge Functions + Resend, o el SMTP de Supabase.
- **Realtime.** El feed del Social Hub se lee una vez. `supabase.channel()` lo
  volvería vivo sin recargar.
- **Búsqueda con acentos.** Hay un índice `gin` en `hub_parts` con el diccionario
  español, pero los servicios todavía filtran en el cliente. Migrar a
  `.textSearch()` cuando el catálogo crezca.
- **Panel de admin.** Hoy Auto Hub, catálogo y noticias se editan desde el Table
  Editor de Supabase.
