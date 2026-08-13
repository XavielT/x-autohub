# Arquitectura

Estado real del proyecto al **2026-08-11**. Si cambias la estructura, actualiza
este archivo en el mismo commit.

## Estructura de carpetas

```
x-autohub/
├── CLAUDE.md                  Instrucciones de trabajo (leer primero)
├── docs/                      Esta documentación
├── brand/                     Logos originales en alta. NO entra al build.
├── supabase/                  Esquema SQL, RLS, storage y seed
│   ├── migrations/            0001_schema, 0002_rls, 0003_storage
│   └── seed.sql               Generado por scripts/generate-seed.mjs
├── scripts/generate-seed.mjs  Convierte los mocks en seed.sql
├── public/                    Se copia tal cual a la raíz de dist/ (favicons)
├── angular.json               Build, budgets, fileReplacements, providersFile
└── src/
    ├── index.html             <title>, meta description, Open Graph, favicons
    ├── main.ts                bootstrapApplication(App, appConfig)
    ├── styles.scss            ⭐ Tokens globales: colores, fuentes, @font-face
    ├── test-providers.ts      Providers globales del TestBed
    │
    ├── environments/
    │   ├── app-environment.ts        Interfaz AppEnvironment (no se reemplaza)
    │   ├── environment.ts            Dev: credenciales de Supabase
    │   └── environment.production.ts Prod (fileReplacements lo sustituye)
    │
    ├── core/                  Infraestructura transversal, sin UI
    │   ├── guards/
    │   │   └── auth.guard.ts         authGuard + guestGuard
    │   ├── supabase/
    │   │   ├── supabase.service.ts   Cliente perezoso + shouldUseMockData()
    │   │   ├── database.types.ts     Tipos espejo del esquema SQL
    │   │   ├── mappers.ts            snake_case ↔ camelCase
    │   │   └── supabase-error.ts     Errores de Postgrest → español
    │   └── http/
    │       └── http-error.interceptor.ts    Errores de HttpClient → toast
    │
    ├── app/
    │   ├── app.ts / app.html         Shell: navbar, outlet, cart, toast, footer
    │   ├── app.config.ts             Providers raíz, LOCALE_ID es-DO
    │   ├── app.routes.ts             ⭐ Todas las rutas, lazy + títulos + guards
    │   ├── components/               Secciones que solo usa el Home
    │   │   ├── home-welcome/             Hero con video de fondo
    │   │   ├── page-counter-overview/    Contadores (280+ vehículos, etc.)
    │   │   ├── home-featured-vehicles/   Últimos vehículos de Hub Market
    │   │   ├── home-featured-catalog/    Grid de categorías del catálogo
    │   │   └── home-news/                Noticias
    │   └── pages/                    Una carpeta por ruta (18)
    │       ├── home/  auto-hub/  auto-hub-details/
    │       ├── catalogo/  hub-part-details/  checkout/
    │       ├── hub-market/  car-details/  hub-market-part-details/
    │       ├── accessory-details/  publicar/
    │       ├── servicios/  social-hub/  new-details/
    │       ├── login/  registro/
    │       └── terminos-condiciones/  not-found/
    │
    ├── shared/                Reutilizable entre páginas
    │   ├── components/            13 componentes con lógica o datos
    │   │   ├── navbar/  footer/  logo-hub/
    │   │   ├── car-card/  autohub-card/  hub-market-card/
    │   │   ├── catalogo-card/  grid-catalog-card/  servicios-card/  new-card/
    │   │   ├── cart-modal/  toast/  club-channel/
    │   ├── ui/                    Presentacionales puros, sin dependencias
    │   │   ├── highlight-badge/
    │   │   └── info-badge/
    │   ├── models/                Interfaces + mocks (conviven hoy)
    │   ├── data/                  checkout-options.mock.ts
    │   └── services/              14 servicios, todos providedIn: 'root'
    │
    ├── styles/
    │   └── _auth-shell.scss       Parcial compartido por login y registro
    │
    └── assets/
        ├── fonts/                 21 familias (solo ~4 en uso — ver ROADMAP)
        ├── icons/                 SVG. Convención: *-hub-icon.svg = estado activo
        ├── imgs/                  Fotos de vehículos, piezas, noticias
        └── videos/                Video de fondo del hero
```

## Modelo de datos

Hoy hay **tres modelos de artículo** porque representan tres inventarios distintos:

| Modelo               | Archivo                       | Representa                                  | Se usa en                            |
| -------------------- | ----------------------------- | ------------------------------------------- | ------------------------------------ |
| `AutoHubModel`       | `auto-hub.model.ts`           | Vehículo **propio**, verificado             | `/auto-hub`, `/auto-hub-details/:id` |
| `HubMarketItemModel` | `hub-market-item.model.ts`    | Publicación de **usuario** (3 categorías)   | `/hub-market` y sus 3 detalles       |
| `HubPartModel`       | `hub-part.model.ts`           | Pieza de la **tienda propia**               | `/catalogo`, carrito, checkout       |

Otros: `CatalogItem` (tarjetas de categoría del home), `NewCardModel` (noticias),
`ServiciosCardModel` (servicios), `UserModel` (sesión), `SocialPostModel` /
`SocialClubModel` / `SocialEventModel` (Social Hub), `Checkout*` (checkout).

`CarCardModel` es solo un alias de `HubMarketItemModel`.

> La duplicación de **lógica** entre los tres (galería de imágenes, tarjetas,
> páginas de detalle) sí es deuda técnica y está en `docs/ROADMAP.md`. La
> duplicación de **modelos** es intencional: son tres inventarios con dueños
> distintos.

## Flujo de datos

```
Componente
    ↓  Observable<T>
Servicio  →  SupabaseService.shouldUseMockData()
                 ├── true  → *.mock.ts local
                 └── false → supabase.db.from('tabla')…
                                  ↓
                              mappers.ts (fila → modelo)
```

Los servicios son la **única** puerta a los datos: ningún componente importa un
`*.mock.ts` ni conoce Supabase. Todos devuelven `Observable<T>`, tanto en modo
mock como real, para que cambiar de uno a otro no altere ninguna firma.

`shouldUseMockData()` es true si `environment.useMockData` lo pide **o** si no
hay credenciales configuradas — así el repo se puede clonar y correr sin backend.

Supabase usa `fetch` internamente, así que **no pasa por los interceptores de
Angular**. Sus errores se traducen en `core/supabase/supabase-error.ts`;
`httpErrorInterceptor` queda para llamadas ajenas a Supabase.

## Estado de la aplicación

Sin librería de estado. Todo con **signals de Angular** dentro de servicios raíz:

| Servicio      | Estado                                  | Notas                             |
| ------------- | --------------------------------------- | --------------------------------- |
| `CartService` | `items`, `isOpen` + computed de totales | Solo acepta `HubPartModel`        |
| `ToastService`| cola de toasts, auto-cierre a 3s        | Renderizado por `<app-toast>`     |
| `AuthService` | sesión de Supabase Auth + perfil       | `user`, `isLoggedIn`, `isRestoring` |

El patrón es siempre el mismo: signal privado `_x`, expuesto como
`x = this._x.asReadonly()`, derivados con `computed()`.

## El shell de la aplicación

`app.html` monta lo que vive **fuera** del `<router-outlet>` y por lo tanto
persiste en todas las rutas:

```html
<header><app-navbar/></header>
<router-outlet/>
<app-cart-modal/>   <!-- panel lateral, controlado por CartService.isOpen -->
<app-toast/>        <!-- notificaciones -->
<app-footer/>
```

Implicación: login y registro **también** se ven con navbar y footer. Es
intencional — el usuario nunca pierde la navegación.

## Rutas

18 rutas, todas con `loadComponent` (lazy) y `title`. Ver `src/app/app.routes.ts`,
que está agrupado por pilar y comentado.

Protegidas por `authGuard`: `/publicar`.
Protegidas por `guestGuard` (redirigen si ya hay sesión): `/login`, `/registro`.
`**` → `NotFoundComponent`. Debe quedar siempre de último.

## Base de datos

13 tablas en Postgres. Ver `supabase/migrations/0001_schema.sql` y
`docs/BACKEND.md`.

| Grupo                | Tablas                                                        |
| -------------------- | ------------------------------------------------------------- |
| Cuentas              | `profiles` (espeja `auth.users` vía trigger)                   |
| Inventario propio    | `auto_hub_vehicles`, `hub_parts`, `services`, `news`           |
| Comunidad            | `hub_market_items`, `social_posts`, `social_clubs`, `social_events` |
| Comercio             | `shipping_options`, `payment_methods`, `orders`, `order_items` |
| Marketing            | `club_subscriptions`                                           |

Decisiones que conviene conocer:

- **Los ids son `bigint`, no uuid** (salvo `profiles` y `orders`), para que rutas
  como `/car-details/101` y los modelos `id: number` siguieran funcionando.
- **`vehicleSpecs` está aplanado** en columnas `spec_*` en vez de jsonb, para
  poder filtrar por rango (año, kilometraje) con índices. El mapper lo rearma.
- **`seller_name` y `author_name` están denormalizados**: el contenido sembrado
  no tiene usuario real detrás. Cuando hay `seller_id`, el nombre sale del join
  con `profiles` y esa columna queda de respaldo.
- **RLS está activo en las 13 tablas.** La clave anon es pública; las políticas
  son lo único que protege los datos.

## Build

- Bundle inicial: **535 kB** (~137 kB transferidos). Cada página es un chunk
  aparte; el cliente de Supabase (~200 kB) va en el inicial porque el navbar
  necesita la sesión desde el primer render.
- `dist/` total: **15 MB**, dominado por `assets/fonts` (7.3 MB) y el video (2.5 MB).
- Budgets en `angular.json`: inicial 600 kB warning / 1 MB error; estilo por
  componente 8 kB / 16 kB (el default de 4 kB es irreal para páginas completas).
- Producción sustituye `environment.ts` por `environment.production.ts`.

## Pruebas

- 42 archivos, 62 pruebas, todas pasando. Corren siempre en modo mock (los
  environments de prueba no traen credenciales), así que ninguna toca la red.
- Providers globales en `src/test-providers.ts`, declarado como `providersFile` en
  `angular.json` y agregado al `include` de `tsconfig.spec.json`.
- Incluye `provideHttpClientTesting()`: ninguna prueba llega a la red.
