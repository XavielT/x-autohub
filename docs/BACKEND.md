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
| 16    | `supabase/migrations/0016_club_unsubscribe.sql` | Token de baja del club y su función             |
| 17    | `supabase/migrations/0017_store_catalog.sql`   | Tienda: categorías, compatibilidad por vehículo, garaje y búsqueda |
| 18    | `supabase/migrations/0018_orders_payment_flow.sql` | Pedidos: estados, stock, historial, comprobantes y cuentas |
| 19    | `supabase/migrations/0019_services_booking.sql` | Taller: servicios, horario, citas y trabajos realizados |
| 20    | `supabase/migrations/0020_reviews.sql`         | Reseñas de productos y servicios, con compra verificada |
| 21    | `supabase/migrations/0021_drop_legacy.sql`     | Se retiran `hub_parts.category` y el contador del home |
| 22    | `supabase/seed.sql`                            | Los mismos datos que ves hoy con los mocks     |

> El seed va **al final**: usa `stars_rating` (0004), `contact_phone` (0010),
> `status` (0012), `is_test` (0013), las columnas de la tienda (0017), los métodos
> de pago de la 0018 (que ya trae `card` y `mercadopago` desactivados) y los servicios de
> la 0019 (por eso el seed ya no los trae). La 0020 no lo toca: un trigger copia las
> `stars_rating` del seed a `stars_seed` al insertar. Y las dependencias entre migraciones son
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
  quedará esperando un correo. Para encenderlo hace falta **SMTP propio** — ver
  "SMTP propio" más abajo. Encenderlo sin él deja el registro limitado a 2
  correos por hora, y a partir del tercero la gente no puede entrar.
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
| `orders`, `order_items`         | Solo el dueño (y admin); un invitado lee el suyo con `get_order(id)` | Solo `create_order()`. El estado y el pago, solo `set_order_status()`, `attach_payment_proof()` y `mark_whatsapp_opened()` (un trigger lo exige) |
| `services`                      | Los activos (el admin ve también los apagados) | Solo admin |
| `service_availability`, `service_blackouts` | Todos (el horario es público) | Solo admin |
| `service_appointments`          | El dueño de la cita y admin | Nadie: entran por `book_appointment()` y cambian por `set_appointment_status()` / `cancel_appointment()` |
| `service_works`                 | Los publicados (el admin ve también los borradores) | Solo admin |
| `order_status_history`          | El dueño del pedido y admin | Nadie: la llena un trigger           |
| `reviews`                       | Todos (las reseñas son públicas) | Solo el autor puede escribir (`user_id = auth.uid()`); **nadie edita** (sin política ni permiso de UPDATE); borra el autor o el admin |
| `product_categories`            | Todos (las activas; el admin ve también las ocultas) | Solo admin (`is_admin()`) |
| `vehicle_makes`, `vehicle_models` | Todos           | Solo admin (`is_admin()`)            |
| `product_fitments`              | Todos, pero **solo los de un producto que quien consulta pueda ver** (el `exists` sobre `hub_parts` aplica RLS) | Solo admin |
| `profile_vehicles` (el garaje)  | Solo el dueño; `anon` ni siquiera tiene el permiso de tabla | Solo el dueño (`using` **y** `with check` en `auth.uid() = user_id`) |

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
| `available_slots()`, `book_appointment()` | Se puede ver la agenda y agendar sin cuenta. `book_appointment()` valida todo por dentro (slot, tope por teléfono, vehículo, pedido). |
| `get_order()`, `attach_payment_proof()`, `mark_whatsapp_opened()`, `order_accepts_proof()` | `/pedido/:id` es público por id (un uuid imposible de adivinar) y un invitado sube su comprobante sin cuenta. Ninguna devuelve datos personales. |

> El idiom completo para una función nueva son **tres** líneas:
>
> ```sql
> revoke all     on function f() from public;
> revoke execute on function f() from anon;      -- la que se olvidaba
> grant  execute on function f() to authenticated;
> ```

### Ajustes del sitio (migraciones 0014 y 0021)

**`site_settings`** — clave/valor, `value` en `jsonb`. Hoy dos claves, las dos de la fase 4
(migración 0018), cada una con un `check` que exige su forma:

| Clave            | Forma    | Qué hace                                  |
| ---------------- | -------- | ----------------------------------------- |
| `bank_accounts`  | arreglo  | Las cuentas a las que transfiere el cliente |
| `pickup_address` | objeto   | Dónde retira su pedido el cliente         |

> Hasta la fase 6 había una tercera, `stats_mode`, y la función `get_site_stats()`, que
> alimentaban el contador del home ("Vehículos · Piezas · Miembros"). El pivote quitó ese
> contador y la migración **0021** borró las dos cosas (y el interruptor de
> `/admin/ajustes` se había ido antes).

La lee **cualquiera**, incluido `anon`: el sitio tiene que funcionar sin sesión. La escritura
no tiene política **a propósito** — sin política RLS niega, así que no hay `update` desde el
navegador que pueda tocarla. El único camino es:

```sql
select * from set_site_setting('pickup_address', '{"address": "…", "hours": "…"}');
```

`security definer`, comprueba `is_admin()` dentro de Postgres, y solo cambia claves que ya
existen (un ajuste nuevo nace en una migración, con su `check`). Un moderador no entra: los
ajustes del sitio no son moderación de contenido.

Hay además un trigger, `guard_site_settings_write`, que bloquea a `anon` y `authenticated`
por nombre (no "todo lo que no sea service_role": ver la trampa de las migraciones en
`CLAUDE.md`) salvo dentro de `set_site_setting()`. Defensa en profundidad, como el congelado
de 0005.

**Un trigger BEFORE que devuelve `new` en un DELETE cancela el borrado, sin error.** En un
DELETE `new` es nulo, y devolver nulo en un trigger BEFORE por fila salta la operación en
silencio. Ese era el guard de la 0014: ningún DELETE sobre `site_settings` hacía nada, ni el
de una migración. Se descubrió con `verify-migrations.sh` al intentar borrar `stats_mode`, y
la 0021 lo corrige (`if tg_op = 'DELETE' then return old; end if;`).

### La tienda (migración 0017)

Primera fase del pivote de octubre de 2026 (`docs/PIVOT-2026-10.md`, §4). No
renombra `hub_parts`: la extiende. En el código los modelos se llaman
`Product*` y el mapper traduce (`toProduct`).

**Qué trae:**

| Pieza | Para qué |
| ----- | -------- |
| `product_categories` | Árbol de dos niveles (lo exige un trigger). Semilla: las 12 de primer nivel del plan. Las hijas las crea el admin. |
| `hub_parts` + `category_id`, `slug`, `sku`, `short_description`, `compare_at_price`, `is_featured`, `fulfillment`, `lead_time_days`, `fitment_type`, `installable`, `installation_service_id`, `specs`, `sold_count`, `updated_at`, `search_vector` | La ficha de la tienda: oferta, stock o bajo pedido, compatibilidad, instalación, búsqueda de texto |
| `vehicle_makes`, `vehicle_models` | 35 marcas y 88 modelos (los más comunes de las diez primeras). **No** es un catálogo completo: el resto se carga desde el panel. |
| `product_fitments` | "Este producto sirve para esta marca [y modelo] [entre estos años]". `model_id` nulo = toda la marca; años nulos = sin límite. |
| `profile_vehicles` | El garaje de cada usuario. Uno por defecto, y marcar otro desmarca el anterior (trigger). |
| `search_products()` | Texto + categoría + compatibilidad + precio + stock, ordenada y paginada, con `total_count`. `security invoker`, así que `anon` la invoca y RLS decide qué ve. |

**Decisiones que conviene conocer:**

- **`fitment_type` nace en `'specific'`**, también para las piezas que ya
  existían. Un "universal" puesto por error le promete compatibilidad a quien no
  la tiene; un "específico" sin fitments solo muestra "Consultar compatibilidad".
  Mejor eso que mentir. Con un vehículo elegido, `search_products()` devuelve los
  universales y los específicos con un fitment que lo cubra; **un específico sin
  fitments nunca aparece**.
- **`hub_parts.category` (texto): la 0017 la dejó viva "una fase más" y la 0021 la
  borró.** Un trigger la rellenaba con la categoría raíz de `category_id` para que
  `/catalogo` no perdiera los productos nuevos; `/catalogo` ya solo redirige. Hoy la única
  clasificación es `category_id`.
- **`slug` y `sku` los pone un trigger si vienen vacíos** (`nombre-<id>` y
  `XAH-000123`); después son `not null` y únicos. El id al final del slug es lo
  que garantiza la unicidad sin reintentos; el admin puede editarlo.
- **Los parámetros de `search_products()` llevan prefijo `p_`** (`p_query`,
  `p_category_slug`, `p_make_id`, `p_model_id`, `p_year`, `p_min_price`,
  `p_max_price`, `p_in_stock_only`, `p_sort`, `p_limit`, `p_offset`). El plan los
  nombra sin él, pero `limit` y `offset` son palabras reservadas.
- **`unaccent` va en el esquema `extensions`**, envuelto en `xah_unaccent()`
  marcada inmutable: `unaccent()` es STABLE y una columna generada o un índice
  exigen IMMUTABLE. Sin eso no hay búsqueda sin acentos en un índice.

**Al aplicarla sobre la base que ya tiene piezas** (la real): el backfill hace
lo suyo con las filas existentes. Les pone slug y SKU, les asigna `category_id`
según el mapeo de las 17 categorías de texto a las 12 del plan (ninguna queda
sin mapear; `refrigeracion`, `escape`, `transmision`, `aceites` y `filtros` caen
en `motor-filtros`, `electrico` y `bateria` en `electrico-baterias`) y las deja
como `specific`, en stock, sin oferta ni instalación. `verify-migrations.sh`
ejercita justo este camino en una segunda base, porque el recorrido "desde cero
+ seed" aplica la migración con `hub_parts` vacía.

El seed regenerado **no actualiza** las filas que ya existen (`on conflict (id)
do nothing`): la mezcla de ofertas, bajo pedido y compatibilidad de los mocks
solo llega a una base nueva. Para la real, el catálogo se carga desde el panel
(Inventario → Piezas, Categorías, Marcas y modelos).

### Pedidos, pago y comprobantes (migración 0018)

Cuarta fase del pivote (`docs/PIVOT-2026-10.md`, §3 y §4). Sin pasarela de tarjeta:
se paga por **transferencia con comprobante** o cerrando el pedido por
**WhatsApp**, y el pedido existe en la base **antes** de pagar, así que no se
pierde.

**El ciclo de un pedido**

```
awaiting_payment → paid → preparing → shipped | ready_for_pickup → delivered
       ↘ cancelled (hasta que la pieza sale: awaiting_payment, paid, preparing)
```

`pending` queda como estado técnico de los pedidos anteriores a 0018 (se pueden
mover). El orden es **estricto** y lo hace cumplir `set_order_status()` dentro de
Postgres; el panel solo ofrece los botones que la base aceptaría
(`shared/utils/order-status.ts` es el espejo, fijado por su spec). Un `update`
directo de `status` lo rechaza el trigger de `orders` **incluso a un admin**.

**Qué trae**

| Pieza | Para qué |
| ----- | -------- |
| `orders` + `order_number`, `fulfillment_type`, `province`, `payment_proof_url`, `payment_confirmed_at`, `whatsapp_opened_at`, `wants_installation`, `updated_at` | El número legible (#1042, desde 1001), envío o retiro, y lo del pago |
| `order_items.stock_deducted` | Cuánto stock descontó cada línea. Es **exactamente** lo que se devuelve al cancelar |
| `order_status_history` | Quién cambió qué y cuándo, con una nota que **ve el cliente**. La llena un trigger |
| `create_order()` (13 parámetros) | Valida y **descuenta** el stock de lo de inventario propio (bloquea las filas en orden de id), no toca lo bajo pedido, exige teléfono, provincia si es envío, y deja el pedido en `awaiting_payment`. Devuelve `id, order_number, subtotal, shipping_price, total`: lo que calculó Postgres |
| `set_order_status()` | El único camino para cambiar el estado. Solo admin. Al cancelar devuelve el stock, una sola vez |
| `get_order(id)` | El pedido de `/pedido/:id`, sin correo, teléfono ni dirección |
| `my_orders()` | "Mis pedidos" (`security invoker`) |
| `attach_payment_proof()`, `mark_whatsapp_opened()` | Lo único que un invitado puede escribir de su pedido |
| Bucket `payment-proofs` | **Privado**, 10 MB, imagen o PDF. Sube el invitado (con el id del pedido en la ruta) o el dueño; leen el dueño y un admin |
| `payment_methods` | `card` y `mercadopago` desactivados (no borrados); se agrega `whatsapp` |
| `site_settings`: `bank_accounts`, `pickup_address` | Las cuentas para transferir y la dirección de retiro, editables desde `/admin/ajustes` |

**Decisiones que conviene conocer**

- **`payment_proof_url` guarda la RUTA del archivo**, no una URL: el bucket es
  privado. El panel pide una URL firmada de diez minutos cuando la necesita. Una
  restricción obliga a que la ruta empiece por el id del pedido.
- **Un pedido por transferencia solo acepta comprobante mientras espera el pago**,
  y solo si no es de otra persona (`order_accepts_proof()`, que además tolera una
  carpeta que no sea uuid sin romper la política).
- **Las cuentas y la dirección nacen como EJEMPLO**, marcadas `is_example`. El sitio
  público **no las muestra** como reales: cae a "te enviamos los datos por
  WhatsApp". Mientras nadie las reemplace en `/admin/ajustes`, la transferencia
  funciona por WhatsApp. Un cliente que transfiere a una cuenta inventada es peor
  que uno que espera. `site_settings` se lee en público, así que las cuentas
  reales también son públicas (lo mismo que se le da a un cliente).
- **`create_order()` cambió de firma y de retorno.** Dejar viva la de diez
  parámetros haría que PostgREST respondiera `PGRST203` a cualquier llamada con los
  diez, así que se retiró. Entre aplicar la migración y desplegar el frontend
  nuevo, un navegador con el JavaScript viejo no puede confirmar un pedido: **se
  aplica y se despliega seguido**.
- **Los mensajes de error de estas funciones llegan al cliente** (SQLSTATE
  `22023`, que `translateDbError` ya no esconde): "De 'Disco' solo quedan 1 y pediste
  2. Ajusta la cantidad.".
- **Los pedidos anteriores a 0018** se numeran en el orden en que se hicieron, se
  conservan en su estado y tienen `stock_deducted = 0`: nunca descontaron stock,
  así que cancelarlos no inventa existencias. `verify-migrations.sh` lo ejercita
  en la segunda base.
- `ALTER TYPE ... ADD VALUE` no deja **usar** el valor en la misma transacción: nada
  de la migración lo referencia donde Postgres lo evalúe al crear el objeto.

### Servicios, agenda y trabajos (migración 0019)

Quinta fase del pivote (`docs/PIVOT-2026-10.md`, §4). Convierte las cuatro tarjetas de
"Servicios" en un taller que vende, cotiza y agenda.

**La hora es la de República Dominicana.** El taller abre "de 8:00 a 17:00" **en su
hora**, no en la del servidor (UTC). Todo lo que convierte una fecha y una hora en un
instante usa `America/Santo_Domingo` (sin horario de verano, siempre UTC-4); el
navegador espeja la cuenta con el desfase fijo (`shared/utils/service-time.ts`) solo
para el modo simulado y para mostrar las horas.

| Pieza | Para qué |
| ----- | -------- |
| `services` + `slug`, `category`, `price_from`, `duration_minutes`, `is_bookable`, `images`, `long_description` | El catálogo. `price_from` nulo = "a cotizar" |
| `service_availability` | Cuándo abre el taller: día de la semana, horas, tamaño de la franja y **capacidad** (citas simultáneas) |
| `service_blackouts` | Cierres (feriados, vacaciones): quitan las franjas que cubren |
| `service_appointments` | Las citas (nacen `requested`). **Sin política de escritura**: es el mecanismo |
| `available_slots(servicio, día)` | Las franjas libres con sus cupos. Nunca devuelve horas pasadas ni más allá de 90 días. `anon` la invoca |
| `book_appointment(...)` | Agenda. **Revalida todo dentro de Postgres** y toma un bloqueo por franja para que dos personas no se lleven el último cupo. `anon` la invoca |
| `set_appointment_status()` | Solo admin, en orden: `requested → confirmed`; `confirmed → in_progress · done · cancelled · no_show`; `in_progress → done · cancelled` |
| `cancel_appointment()` | Solo el dueño, solo `requested`/`confirmed` y solo con **más de 24 horas** |
| `my_appointments()` | "Mis citas" (`security invoker`) |
| `service_works` + bucket `service-works` | Trabajos realizados, antes y después. Bucket público en lectura, escritura solo admin |

**Decisiones que conviene conocer**

- **La capacidad es del taller, no del servicio**, y una cita **ocupa solo su hora de
  inicio**: `duration_minutes` es informativo. Un trabajo de tres horas no bloquea tres
  franjas; el equipo lo confirma a mano.
- **Un invitado puede agendar** (igual que puede comprar), así que `book_appointment()`
  limita a **3 citas abiertas por teléfono**, comparando los **diez dígitos de la
  derecha** ("+1 809 555 0134" y "809-555-0134" son el mismo número). Sin ese tope,
  cualquiera llenaría la agenda desde la consola.
- **Los diez servicios iniciales nacen sin precio** (a cotizar), y **el horario inicial es
  de ejemplo** (`is_example`, el panel lo avisa). A diferencia de las cuentas bancarias de
  la 0018, el horario de ejemplo **no se esconde**: una cita siempre pasa por
  confirmación, así que el peor caso es que el equipo la mueva.
- **Los cuatro servicios genéricos de antes se desactivan, no se borran** (Mantenimiento,
  Reparación, Chequeo y Diagnóstico, Búsqueda y Revisión): el catálogo nuevo los cubre.
  Mantienen su id, así que una pieza que apuntara a uno no se rompe.
- **El seed ya no trae servicios**: nacen en la migración, como las categorías de la
  0017. `hub_parts.installation_service_id` del seed apunta a los ids 1 a 10, que la
  migración asigna en el mismo orden que `SERVICES_MOCK`.
- **Las citas se guardan con el vehículo como texto**, además del `profile_vehicle_id`:
  el del garaje puede cambiar o borrarse y la cita tiene que seguir diciendo de qué
  vehículo era. `order_id` liga la cita con la instalación de un pedido.
- **Una cita ajena y una que no existe se responden igual** ("Esa cita no existe"): no se
  confirma cuáles hay.

### Reseñas verificadas (migración 0020)

Séptima fase del pivote. Una reseña es de un producto o de un servicio (`target_type` +
`target_id`), de 1 a 5 estrellas, con un comentario opcional de hasta 1000 caracteres.

| Pieza | Para qué |
| ----- | -------- |
| `reviews` | Una por persona y objetivo (`unique (target_type, target_id, user_id)`) |
| `reviews_prepare()` (trigger BEFORE INSERT) | Rechaza un producto o servicio que no existe o está apagado, recorta el comentario y **calcula `is_verified_purchase`** |
| `reviews_sync_product()` (trigger AFTER INSERT/DELETE) | Recalcula `hub_parts.stars_rating` (promedio, un decimal) y `hub_parts.review_count` |
| `reviews_cascade_product()` / `_service()` | Si se borra el producto o el servicio, se van sus reseñas (`target_id` no es clave foránea) |
| `review_stats(tipo, id)` | Total, promedio y cuántas hay de cada estrella (`c1`…`c5`). `security invoker`, la invoca `anon` |
| `hub_parts.stars_seed` / `review_count` | Las estrellas sembradas de antes, y cuántas reseñas reales hay |

**La compra verificada la decide Postgres.** Al insertar, el trigger mira si esa persona
tiene un pedido `delivered` con ese producto (`orders.user_id` + `order_items.part_id`) o
una cita `done` con ese servicio (`service_appointments.user_id`). Lo que mande el
navegador en la columna se pisa. Un pedido de invitado (`user_id` nulo) no verifica a
nadie: no hay a quién atribuirlo.

**Decisiones que conviene conocer**

- **Sin compra verificada también se puede reseñar**, pero sin la etiqueta; el listado
  pone primero las verificadas. Exigir compra habría dejado el bloque vacío meses.
- **No hay UPDATE**, ni política ni permiso: una reseña no se edita, se borra y se escribe
  otra. Editarla obligaría a congelar `is_verified_purchase`, `target_*` y `user_id`
  con un trigger (RLS no filtra por columna); que no exista el camino es más simple.
- **Las estrellas sembradas se conservan** en `stars_seed`. Mientras `review_count = 0`,
  `stars_rating` es ese valor; con la primera reseña pasa a ser el promedio real, y si se
  borra la última vuelve al sembrado. **Solo `review_count > 0` significa que hay
  opiniones reales**: por eso el JSON-LD de la ficha declara `aggregateRating` con
  `review_stats()` y nunca con `starsRating`.
- **`search_products()` no devuelve `review_count`.** Devuelve columnas explícitas y
  cambiarlas obliga a recrear la función; las tarjetas no necesitan el conteo, así que
  `ProductModel` no lo lleva. Si algún día hace falta, hay que recrear la función en una
  migración nueva (no se puede con `create or replace`).
- La migración **se puede aplicar dos veces**: el backfill de `stars_seed` solo toca filas
  sin sembrar y sin reseñas, así que repetirla no toma un promedio real por sembrado.

### Limpieza de lo que dejó el pivote (migración 0021)

Borra `hub_parts.category` (el texto de la tienda anterior, con su índice), `get_site_stats()`
y la fila `stats_mode`. Tres cosas que conviene saber si vas a hacer algo parecido:

- **Una comprobación previa protege la clasificación.** Si alguna pieza tuviera `category`
  pero no `category_id`, la migración se detiene con un mensaje: borrar la columna destruiría
  la única clasificación que esa pieza tiene. En producción las 35 piezas tenían
  `category_id`, y `verify-migrations.sh` prueba las dos ramas (con una pieza sin clasificar
  aborta y no toca nada; clasificada, sigue).
- **`search_products()` se recrea.** Devuelve columnas explícitas, `category` era una de ellas
  y no se puede quitar con `create or replace`: se borra la función y se crea de nuevo (con sus
  permisos otra vez, porque se pierden). Es el momento en que añadir `review_count` sería
  barato.
- **Primero el frontend, después la migración.** El frontend anterior pedía `category` en sus
  `select` y mandaba `category: null` al guardar un producto desde el panel; con la columna
  ya borrada esas llamadas fallan. El nuevo funciona igual con la columna presente o ausente,
  así que se despliega primero y se migra después. Quien tenga el panel abierto desde antes
  verá el aviso de "versión nueva" y tendrá que recargar para guardar.

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
   migración tiene que poder ejecutarse dos veces) y corre 298 comprobaciones de
   seguridad y de comportamiento con sesiones simuladas: visibilidad pública,
   contenido de prueba, contadores, quién puede invocar cada función, los tres
   frenos de la escalada de privilegios, las tablas de la tienda (lectura pública
   y escritura solo admin, el garaje de cada quien), `search_products()` y el
   camino de actualización de la 0017 sobre piezas ya existentes. Sale en rojo
   con el error real de Postgres.

   **En Windows** el script corre dentro de WSL (espera `initdb` en
   `/usr/lib/postgresql/*/bin` y usa un socket unix, que el Postgres de Windows no
   tiene). Si el repo está con saltos de línea CRLF (`core.autocrlf=true`) bash
   falla en el primer `\r`: pásalo por `tr -d '\r'` antes de ejecutarlo.

   Lo que **no** cubre: PostgREST. El `PGRST201` de la ronda 14 era SQL válido
   con un embed ambiguo y solo se vio en el sitio real, así que el humo contra
   producción después de desplegar sigue siendo obligatorio.

3. Ejecútala en el SQL Editor (o por la Management API).
4. Actualiza `core/supabase/database.types.ts` **en el mismo commit**.
5. TypeScript te dirá qué mappers y servicios ajustar.

### Regenerar el seed

> `site_settings` **no** está en el seed, y no es un olvido: las filas
> `bank_accounts` y `pickup_address` las siembra la migración 0018 con `on conflict do
> nothing`. Si estuvieran en el seed, regenerarlo devolvería las cuentas y la dirección al
> valor de ejemplo y desharía en silencio lo que el admin cargó. El seed es contenido de
> demo, no configuración.


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

## SMTP propio (hace falta para exigir confirmación de correo)

**Estado hoy: sin configurar.** El proyecto usa el servicio de correo integrado
de Supabase, que va limitado a **2 correos por hora** y está pensado solo para
desarrollo. Por eso `mailer_autoconfirm` está encendido: quien se registra entra
sin confirmar nada.

**No enciendas la confirmación antes que el SMTP.** Con el límite integrado, el
tercer registro de cada hora se queda sin correo y esa persona no puede entrar —
la cuenta existe, pero no hay enlace que abrir.

### Por qué Resend

Porque el proyecto ya lo eligió: la función `club-welcome` manda su correo por
la API de Resend. La **misma API key** sirve para las dos cosas, porque Resend
también da SMTP. Un proveedor, una clave, un dominio que verificar.

### Ojo con el DNS: el dominio ya manda correo por Google

Comprobado el 27/08/2026 contra 8.8.8.8 y 1.1.1.1:

| Registro | Valor actual |
| --- | --- |
| `MX` | `1 smtp.google.com` (Google Workspace) |
| `TXT` (SPF) | `v=spf1 include:_spf.google.com ~all` |
| DKIM de Resend | **no existe** |
| `_dmarc` | **no existe** |

El SPF de la raíz autoriza a Google y a nadie más. **No lo edites para meter a
Resend**: verifica un subdominio (`send.xautohubrd.com`), que es lo que Resend
recomienda y deja intacto el correo de Google Workspace. Los registros exactos
los da Resend al añadir el dominio; son un `MX` y un `TXT` de SPF en el
subdominio, más un `TXT` de DKIM.

El DNS lo lleva Google Cloud DNS (`ns-cloud-a1..a4.googledomains.com`).

### Pasos de Xaviel (una sola vez)

1. **Cuenta en Resend** y **verificar el dominio** — Domains → Add Domain →
   `send.xautohubrd.com`. Copiar al DNS los registros que da. Esperar a que
   Resend lo marque como *Verified*.
2. **Crear la API key** (API Keys → Create) con permiso de envío.
3. **Pegarla en `.env.local`** (que está en `.gitignore`; no va al repo):

   ```bash
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_USER=resend
   SMTP_PASS=re_xxxxxxxxxxxx          # la API key de Resend
   SMTP_ADMIN_EMAIL=no-reply@send.xautohubrd.com
   SMTP_SENDER_NAME=X AutoHub
   ```

4. **Aplicarlo:**

   ```bash
   ./scripts/setup-smtp.sh
   ```

   Lee esos valores, los manda por la Management API y enseña cómo quedó. **No
   imprime la contraseña.** Para ver el estado sin tocar nada:
   `./scripts/setup-smtp.sh --verify`.

5. **Probar con un registro real** en el sitio. Debe llegar el correo de
   confirmación desde el remitente de arriba.

6. **Solo entonces, encender la confirmación:**

   ```bash
   ./scripts/setup-smtp.sh --enable-confirmation
   ```

   El script **se niega** si no hay SMTP configurado, justo para no dejar el
   registro atascado en el límite de 2 por hora. Para volver atrás:
   `--disable-confirmation`.

### Qué cambia en el sitio al encenderla

Nada que haya que programar: la fase 1 de la ronda `imp 27082026` ya dejó el
código preparado para los dos casos. `AuthService.register()` devuelve
`confirm-email` cuando `signUp` no trae sesión, y `/registro` enseña la pantalla
"Revisa tu correo" en vez del formulario. Al abrir el enlace, el
`onAuthStateChange` carga el perfil y la sesión queda abierta.

El `site_url` (`https://xautohubrd.com`) y la lista de redirecciones ya están
puestos, así que el enlace del correo cae en el sitio.

### Conviene también

Añadir un `_dmarc` al dominio. Hoy no existe, y sin él los proveedores tienen
menos con qué decidir; empieza suave (`p=none`) y endurece cuando veas los
informes.

---

## Correo de bienvenida del club

El formulario "Únete al club" del home guarda el correo en `club_subscriptions` y
después manda un correo de bienvenida. El envío lo hace una Edge Function,
`supabase/functions/club-welcome/index.ts`, no la app.

> **Estado (27/08/2026): la función ya está desplegada** en el proyecto de
> producción (`ACTIVE`, `verify_jwt: true`, v1), así que el paso 5 de abajo está
> hecho. Lo que **falta son los secretos**: sin `RESEND_API_KEY` responde
> `{ sent: false, reason: 'not-configured' }` y no manda nada — comprobado
> invocándola. Eso es a propósito y no rompe nada: la suscripción se guarda y el
> sitio no promete un correo que no va a llegar.
>
> La misma API key de Resend que pide la sección "SMTP propio" sirve para esto:
> un proveedor y una clave para las dos cosas.

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

5. **Desplegar la función** (ya hecho el 27/08/2026 — ver el recuadro de
   arriba; queda aquí para reproducirlo en otro proyecto):

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

### La baja (migración 0016)

Cada fila de `club_subscriptions` tiene un `unsubscribe_token` (uuid). El correo
lo lleva en dos sitios:

- un enlace en el pie, `https://xautohubrd.com/baja/<token>`;
- y la cabecera `List-Unsubscribe`, que es lo que hace que Gmail y Outlook
  dibujen su propio "cancelar suscripción" arriba del mensaje en vez de dejar que
  la única salida sea el botón de spam.

La pantalla **pide confirmación antes de dar de baja**, y eso no es cortesía: los
clientes de correo y los antivirus abren los enlaces por su cuenta para
previsualizarlos y comprobarlos, así que una baja al cargar sacaría de la lista a
gente que nunca hizo clic. Por lo mismo el correo **no** manda
`List-Unsubscribe-Post` (RFC 8058): esa cabecera promete que se puede dar de baja
con un POST y sin preguntar.

Al confirmar se llama a:

```sql
select unsubscribe_from_club('<token>');   -- true si habia alguien, false si no
```

`security definer`, y **con grant a `anon`** al contrario de las funciones de
admin: el enlace se abre desde el correo, casi siempre sin sesión. Es el mismo
caso que `create_order()` con el checkout de invitado. Devuelve `false` en vez de
lanzar cuando el token no existe, que es lo que pasa al abrir dos veces el mismo
enlace.

El token **no se puede leer desde el navegador**: la tabla no tiene política de
select desde 0002. Lo leen la función (definer) y la Edge Function del correo
(con la clave `service_role`).

> **Por qué se borra la fila y no se marca.** Un `unsubscribed_at` sería lo
> habitual en listas grandes —sirve de lista de supresión—, pero al volver a
> suscribirse desde el home el insert choca con el `unique` del correo y el
> cliente lo trata como "ya estabas en el club": quien se dio de baja y se
> arrepiente quedaría en una lista de la que nunca más recibe nada. Soportarlo
> bien pide convertir también el alta en una función que reactive la fila.
> Borrar es honesto y volver a suscribirse funciona sin nada extra. **Cuando haya
> campañas de verdad, toca la lista de supresión.**

### Lo que falta

- **Reintentos.** Si Resend falla, el correo se pierde: no hay cola. La
  suscripción, que es lo que importa, sí queda guardada.
- **Lista de supresión**, cuando la lista crezca (ver el recuadro de arriba).

---

## Las imágenes del seed

`seed.sql` apunta a los assets locales (`assets/imgs/...`) porque son los mismos
que ya venían con los mocks. Las publicaciones nuevas, en cambio, guardan la URL
pública del bucket.

Ambas formas conviven sin problema: el `<img [src]>` no distingue. Cuando subas
las fotos reales del inventario propio a Storage, actualiza esas filas.

---

## Lo que todavía no está

- **Pasarela de pago.** No hay cobro en línea: se paga por transferencia (con
  comprobante) o por WhatsApp, y alguien confirma el pago a mano con
  `set_order_status()`. La tarjeta y Mercado Pago existen desactivadas en
  `payment_methods`.
- **Correos transaccionales.** Confirmación de pedido, aviso de publicación.
  Mismo camino que el correo de bienvenida del club, que ya está hecho (ver la
  sección de arriba): una Edge Function con Resend.
- **Realtime.** El feed del Social Hub se lee una vez. `supabase.channel()` lo
  volvería vivo sin recargar.
- **Búsqueda en la interfaz.** `search_products()` ya existe (migración 0017) y
  `ProductService.searchProducts()` la llama, con texto sin acentos y por prefijo;
  lo que falta es la interfaz que la use (buscador del navbar y `/tienda`, fases
  2 y 3 del pivote). El catálogo actual todavía filtra en el cliente.
