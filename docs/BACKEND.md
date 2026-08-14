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
| 7     | `supabase/seed.sql`                            | Los mismos datos que ves hoy con los mocks     |

> El seed va **al final**: usa `stars_rating`, el nombre que deja la 0004.

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
| `auto_hub_vehicles`, `hub_parts`, `news`, `services`, `social_clubs`, `social_events` | Todos | Solo `is_admin` |
| `hub_market_items`              | Todos (activos)     | Solo el dueño (`seller_id = auth.uid()`) |
| `social_posts`                  | Todos               | Solo el autor                        |
| `profiles`                      | Todos               | Solo el propio                       |
| `club_subscriptions`            | Solo admin          | Cualquiera puede insertar            |
| `orders`, `order_items`         | Solo el dueño       | Cualquiera puede crear el suyo       |

El `with check (seller_id = auth.uid())` de Hub Market es lo que impide publicar
en nombre de otro, incluso desde un cliente manipulado.

### Datos privados del perfil (migración 0006)

`email` y `phone` de `profiles` **no** son legibles con la clave anon ni con una
sesión normal: antes cualquiera podía descargar el correo y el teléfono de todos
los usuarios. Solo la `service_role` los ve.

Dos consecuencias prácticas:

- **No pidas `select('*')` sobre `profiles`.** Falla con
  `permission denied for table profiles`. Pide las columnas públicas:
  `id, display_name, avatar_url, is_verified, location, created_at, is_admin`.
  Así lo hace ya `auth.service.ts`.
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

`is_admin` e `is_verified` se pueden enviar y la petición responde 204, pero el
trigger de 0005 los deja como estaban. Solo la `service_role` los mueve — es
decir, `scripts/make-admin.mjs`.

### Hacerte admin

Para poder gestionar Auto Hub, el catálogo y las noticias, **regístrate primero**
en `/registro` (el perfil lo crea el trigger, no el comando) y después:

```bash
node scripts/make-admin.mjs tu@correo.com
```

Lee la `service_role` de `.env.local`. Equivale a hacerlo desde el SQL Editor:

```sql
update public.profiles set is_admin = true, is_verified = true
where email = 'tu@correo.com';
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
