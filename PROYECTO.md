# Proyecto X-AutoHub

> **Nota:** la versión anterior de este archivo describía Angular 17, TypeScript
> 5.2, Tailwind y una API REST con 8 endpoints. Nada de eso existía en el proyecto.
> Lo de abajo está verificado contra el código (2026-08-12). Si algo cambia,
> actualízalo aquí en el mismo commit.

## Qué es

Plataforma web para la comunidad automotriz de República Dominicana. Cinco pilares:

- **Auto Hub** (`/auto-hub`) — vehículos oficiales de X AutoHub, verificados
- **Hub Market** (`/hub-market`) — clasificados publicados por usuarios
- **Catálogo** (`/catalogo`) — tienda propia de piezas, con carrito y checkout
- **Servicios** (`/servicios`) — taller, contacto por WhatsApp
- **Social Hub** (`/social-hub`) — feed, clubes y eventos

Auto Hub y Hub Market están separados a propósito: uno es el inventario de la
empresa, el otro el de la comunidad.

Detalle del producto en [`docs/VISION.md`](docs/VISION.md).

## Tecnologías

- **Angular 21.1** — standalone components, sin NgModules, **zoneless** (no hay
  zone.js) y con signals para todo el estado de la vista
- **TypeScript 5.9** con `strict` y `strictTemplates`
- **SCSS** por componente; tokens globales en `src/styles.scss`
- **RxJS 7.8**
- **Vitest 4** como test runner
- **Supabase**: Postgres + Auth + Storage
- Sin Tailwind, sin librería de UI, sin librería de estado

La app corre sin credenciales (cae a los mocks). Para conectar la base, ver
[`docs/BACKEND.md`](docs/BACKEND.md).

## Estructura

```
supabase/           Esquema SQL, RLS, storage y seed
scripts/            generate-seed.mjs (mocks → seed.sql)
src/
├── environments/   Config por entorno (credenciales de Supabase)
├── core/
│   ├── guards/     Protección de rutas
│   ├── supabase/   Cliente, tipos del esquema, mappers, errores
│   └── http/       Interceptor de errores (para llamadas ajenas a Supabase)
├── app/
│   ├── app.routes.ts   18 rutas, todas lazy, con títulos y guards
│   ├── components/     Secciones exclusivas del home
│   └── pages/          Una carpeta por ruta
├── shared/
│   ├── components/     Reutilizables con lógica (navbar, tarjetas, carrito…)
│   ├── ui/             Presentacionales puros (badges)
│   ├── models/         Solo interfaces y tipos (*.model.ts)
│   ├── data/           Todos los mocks (*.mock.ts), en un solo lugar
│   └── services/       Estado y acceso a datos (todos providedIn: 'root')
├── styles/         Parciales SCSS compartidos
└── assets/         Fuentes, iconos, imágenes, video
```

Detalle completo en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Convenciones

- **Español** en la UI y los comentarios, **inglés** en el código
- `inject()` en vez de DI por constructor — ningún componente inyecta por constructor
- `ChangeDetectionStrategy.OnPush` en **todos** los componentes: la app es zoneless,
  así que el estado que la plantilla lee tiene que ser un signal o no se repinta
- Signals para el estado (`_x` privado → `x = _x.asReadonly()` → `computed()`).
  Lo derivado va en `computed()`, no en un getter
- Inputs con `input()` / `input.required<T>()`, nunca con el decorador `@Input()`.
  En la plantilla se leen llamándolos: `item()`
- Con un input signal, `[(ngModel)]` se parte en `[ngModel]="x()"` + `(ngModelChange)="x.set($event)"`
- Los formularios reactivos siguen siendo `FormGroup`: no se convierten a signals
- Clases sin sufijo (`Home`, `Catalogo`, `CarDetails`), estilo Angular 20+.
  El sufijo `Service` sí se mantiene, y los servicios se llaman `*.service.ts`
- Los mocks viven en `shared/data/*.mock.ts`; `shared/models/` solo tiene tipos
- `@if` / `@for` en vez de `*ngIf` / `*ngFor`
- Precios siempre `RD$ {{ price | number:'1.0-0' }}`
- Colores y fuentes solo por token: `var(--Hub)`, `var(--font-brand)`
- Imágenes: `assets/...` relativo a la base, JPEG para fotos, máximo 1600px

Detalle completo en [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md).

## Acceso a datos

Los componentes nunca importan un `*.mock.ts`. Todo pasa por un servicio, y el
servicio decide según el entorno:

```ts
getPosts(): Observable<SocialPostModel[]> {
  if (this.supabase.shouldUseMockData()) {
    return of(SOCIAL_POSTS_MOCK);
  }
  return from(
    this.supabase.db.from('social_posts').select(POST_SELECT),
  ).pipe(map((res) => unwrap(res).map(toSocialPost)));
}
```

`shouldUseMockData()` es true si lo pide el environment **o** si no hay
credenciales configuradas. La traducción entre las columnas de Postgres
(snake_case) y los modelos (camelCase) vive en `core/supabase/mappers.ts`.

### Contrato de datos

Esta es la superficie completa que la app espera del backend. Es la especificación:
si cambias una firma aquí, cambia el servicio y la tabla en el mismo commit.
Todos los métodos devuelven `Observable<T>` y todos tienen rama de mock.

| Servicio | Método | Devuelve | Origen (Supabase) |
| --- | --- | --- | --- |
| `AutoHubService` | `getAll()` | `AutoHubModel[]` | `auto_hub_vehicles` · `is_available=true` · `created_at` desc |
| | `getById(id: number)` | `AutoHubModel \| undefined` | `auto_hub_vehicles` · `maybeSingle()` |
| `HubPartService` | `getAll()` | `HubPartModel[]` | `hub_parts` · `is_active=true` · `id` asc |
| | `getById(id: number)` | `HubPartModel \| undefined` | `hub_parts` |
| | `getByCategory(category: string)` | `HubPartModel[]` | `hub_parts` · `is_active=true` |
| `HubMarketService` | `getAll()` | `HubMarketItemModel[]` | `hub_market_items` · `is_active=true` · `created_at` desc |
| | `getById(id: number)` | `HubMarketItemModel \| undefined` | `hub_market_items` |
| | `getByCategory(c: HubMarketCategory)` | `HubMarketItemModel[]` | `hub_market_items` · `is_active=true` |
| | `getFeaturedVehicles(limit = 3)` | `HubMarketItemModel[]` | `category='vehiculos'` · `is_featured` desc, `created_at` desc, `limit` |
| | `getBySeller(sellerId: string)` | `HubMarketItemModel[]` | incluye las despublicadas |
| | `publish(item, sellerId, sellerName)` | `HubMarketItemModel` | `insert` + `select().single()`; `item` es `Omit<HubMarketItemModel, 'id'>` |
| | `deactivate(id: number)` | `void` | `is_active=false` — no borra, conserva historial |
| `NewsService` | `getAll()` | `NewCardModel[]` | `news` · `is_published=true` · `published_at` desc |
| | `getById(id: number)` | `NewCardModel \| undefined` | `news` |
| `ServiciosCardService` | `getServicios()` | `ServiciosCardModel[]` | `services` · `is_active=true` · `sort_order` asc |
| `CheckoutOptionsService` | `getShippingOptions()` | `CheckoutShippingOption[]` | `shipping_options` · `is_active=true` · `sort_order` asc |
| | `getPaymentMethodOptions()` | `CheckoutPaymentMethodOption[]` | `payment_methods` · `is_active=true` · `sort_order` asc |
| `SocialHubService` | `getPosts()` | `SocialPostModel[]` | `social_posts` · `created_at` desc · `limit(50)` |
| | `getClubs()` | `SocialClubModel[]` | `social_clubs` · `is_official` desc, `members` desc |
| | `getEvents()` | `SocialEventModel[]` | `social_events` · `event_date` asc |
| | `publishPost(post, authorId, authorName)` | `SocialPostModel` | `insert` + `select().single()` |
| `OrderService` | `submit(payload, items, shipping, userId)` | `OrderResult` (`{ id, total }`) | `orders` + `order_items`; `userId` puede ser `null` (compra sin cuenta) |
| `EmailSubscriptionService` | `subscribe(email: string)` | `SubscriptionResult` (`{ ok }`) | `club_subscriptions`; el error `23505` (ya suscrito) cuenta como éxito |
| `StorageService` | `uploadListingImages(files, userId)` | `string[]` (URLs públicas) | bucket `listings`, ruta `<uid>/<archivo>` |
| | `uploadAvatar(file, userId)` | `string` | bucket `avatars` |
| | `validate(file: File)` | `string \| null` (error) | JPG/PNG/WebP, máx. 5 MB — espeja el bucket |
| `AuthService` | `login(credentials)` / `register(payload)` | `UserModel` | Supabase Auth + `profiles` |
| | `logout()` / `currentUserId()` | `void` / `string \| null` | sesión en signals (`user()`, `isLoggedIn()`) |
| `CatalogSectionsService` | `getSections()` | `CatalogItem[]` | **sin tabla** — mobiliario del home, siempre mock |

`CartService` y `ToastService` no entran aquí: son estado de cliente, no acceso a
datos, y no tienen rama de mock.

Los componentes consumen todo esto suscribiéndose en `ngOnInit()` y escribiendo
el resultado en un signal. Las listas principales (catálogo, Hub Market, Auto Hub)
y las páginas de detalle llevan además un signal `isLoading` para no mostrar
"no hay resultados" mientras los datos van en camino.

## Comandos

```bash
npm start                              # dev server en http://localhost:4200
npm run build                          # build de producción a dist/
npm test                               # Vitest, 62 pruebas
npx tsc -p tsconfig.app.json --noEmit  # solo type-check
```

El build debe terminar sin warnings.

## Documentación

| Archivo                                                    | Contenido                          |
| ---------------------------------------------------------- | ---------------------------------- |
| [`CLAUDE.md`](CLAUDE.md)                                   | Cómo trabajar en el repo + trampas conocidas |
| [`docs/VISION.md`](docs/VISION.md)                         | El producto, el público, el tono   |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)             | Estructura y flujo de datos        |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)               | Convenciones de código             |
| [`docs/BACKEND.md`](docs/BACKEND.md)                       | Supabase: setup, esquema, RLS      |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                        | Pendientes priorizados             |
| [`docs/AUDIT-2026-08-11.md`](docs/AUDIT-2026-08-11.md)     | Auditoría: qué se arregló          |
| [`brand/README.md`](brand/README.md)                       | Assets de marca y favicons         |
