# Arquitectura

Estado real del proyecto al **2026-10-23** (v2.6.0; el pivote está completo desde la 2.5.0). Si cambias la
estructura, actualiza este archivo en el mismo commit.

> **El pivote de octubre de 2026 está completo (fase 7).** Ya existen el esquema de la
> tienda (fase 1), la cara nueva (fase 2: navbar con buscador y menú de
> categorías, barra de pestañas, footer por pilares, home de tienda) y la tienda
> de verdad (fase 3: `/tienda` con filtros, "mi vehículo", ficha por slug,
> `/buscar` y el garaje en el perfil) y los pedidos (fase 4: checkout en tres
> pasos, `/pedido/:id`, comprobante de transferencia o cierre por WhatsApp, "Mis
> pedidos" y el panel) y el taller (fase 5: catálogo de servicios, cotizar por WhatsApp,
> agenda de citas, "Mis citas", trabajos realizados y las cuatro pestañas del taller
> en el panel) y la PWA (fase 6: instalable, caché del shell y aviso de versión nueva). y, en la fase 7, las reseñas verificadas, el SEO de producto (JSON-LD, sitemap, robots) y la
> limpieza del código muerto. Lo que sigue (pasarela de tarjeta) está en
> `docs/ROADMAP.md`; el plan original, en `docs/PIVOT-2026-10.md`.

## Estructura de carpetas

```
x-autohub/
├── CLAUDE.md                  Instrucciones de trabajo (leer primero)
├── docs/                      Esta documentación
├── brand/                     Logos originales en alta. NO entra al build.
├── supabase/                  Esquema SQL, RLS, storage, funciones y seed
│   ├── migrations/            0001 a 0025 (ver docs/BACKEND.md)
│   ├── functions/             club-welcome (Edge Function)
│   └── seed.sql               Generado por scripts/generate-seed.mjs
├── scripts/                   generate-seed, generate-sitemap (+ sitemap-lib), make-admin,
│                              setup-smtp, verify-migrations.sh
├── public/                    Se copia tal cual a la raíz de dist/ (favicons, iconos de la
│                              app incl. los maskable, manifest.webmanifest, robots.txt;
│                              sitemap.xml se GENERA antes de cada build y no se versiona)
├── ngsw-config.json           Qué cachea el service worker (ver "La PWA")
├── vercel.json                CSP y cabeceras (ngsw-*.js sin caché, manifest con su tipo)
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
    │   │   ├── auth.guard.ts         authGuard + guestGuard
    │   │   ├── admin.guard.ts        adminGuard
    │   │   └── moderator.guard.ts    moderatorGuard (admin y moderador)
    │   ├── supabase/
    │   │   ├── supabase.service.ts   Cliente perezoso + shouldUseMockData()
    │   │   ├── supabase.service.testing.ts  TestSupabaseService (fuerza modo mock)
    │   │   ├── database.types.ts     Tipos espejo del esquema SQL
    │   │   ├── mappers.ts            snake_case ↔ camelCase
    │   │   └── supabase-error.ts     Errores de Postgrest → español
    │   └── http/
    │       └── http-error.interceptor.ts    Errores de HttpClient → toast
    │
    ├── app/
    │   ├── app.ts / app.html         Shell: navbar, outlet, footer, cart, selector de
    │   │                             vehículo (@defer), toast y barra de pestañas
    │   ├── app.config.ts             Providers raíz, LOCALE_ID es-DO
    │   ├── app.routes.ts             ⭐ Todas las rutas, lazy + títulos + guards
    │   ├── components/               Los bloques del home, y el hero de la Comunidad
    │   │   ├── home-search/ home-categories/ home-vehicle-picker/
    │   │   ├── home-offers/ home-bestsellers/ home-new-arrivals/  (usan home-product-row)
    │   │   ├── home-services-banner/ home-trust-strip/
    │   │   ├── home-vehicles/ home-community/
    │   │   └── home-welcome/             Hero con video: ahora abre /social-hub
    │   └── pages/                    Una carpeta por página (26)
    │       ├── home/  auto-hub/  auto-hub-details/
    │       ├── tienda/  producto/  buscar/  checkout/  pedido/
    │       ├── hub-market/  car-details/  hub-market-part-details/
    │       ├── accessory-details/  publicar/
    │       ├── servicios/  servicio/  cotizar/  agendar/  social-hub/  new-details/
    │       ├── login/  registro/  perfil/ (con mi-garaje/ y mis-citas/)  baja/
    │       ├── admin/  (moderacion, versiones, pedidos, taller, inventario,
    │       │            usuarios, ajustes). taller/ trae las pestañas Citas,
    │       │            Servicios, Disponibilidad y Trabajos. inventario/ trae además las pestañas
    │       │            Categorías y Marcas y modelos y los editores de
    │       │            compatibilidad y de especificaciones de la pieza
    │       └── terminos-condiciones/  not-found/
    │
    ├── shared/                Reutilizable entre páginas
    │   ├── components/            Componentes con lógica o datos
    │   │   ├── navbar/  mobile-tab-bar/  footer/  logo-hub/
    │   │   ├── search-box/  vehicle-form/  vehicle-picker-modal/  store-filters/
    │   │   ├── car-card/  autohub-card/  hub-market-card/
    │   │   ├── catalogo-card/  grid-catalog-card/  servicios-card/  new-card/
    │   │   ├── service-card/  service-works/
    │   │   ├── cart-modal/  toast/  club-channel/
    │   │   ├── install-prompt/  update-toast/  offline-state/   (la PWA)
    │   │   ├── coupon-box/              El campo "¿Tienes un cupón?" del checkout
    │   │   ├── reviews/                 Reseñas: promedio, distribución, lista y formulario
    │   ├── ui/                    Presentacionales puros, sin dependencias
    │   │   ├── highlight-badge/  info-badge/  image-gallery/
    │   │   └── location-select/  test-badge/
    │   ├── models/                Interfaces de los modelos (product.model.ts: la tienda)
    │   ├── data/                  Mocks (*.mock.ts), locations, showcase-stats
    │   ├── utils/                 slugify, product-search (la búsqueda en memoria),
    │   │                          category-tree, contact (el WhatsApp de la tienda), test-visibility,
    │   │                          phone, whatsapp…
    │   ├── testing/               product.fixture.ts (un ProductModel para los specs)
    │   └── services/              30 servicios, todos providedIn: 'root'
    │
    ├── styles/
    │   ├── _auth-shell.scss       Parcial compartido por login y registro
    │   ├── _forms.scss            Parcial de formularios
    │   ├── _whatsapp-btn.scss     Botón de WhatsApp compartido
    │   └── _home-section.scss     Mixin del estilo común de los bloques del home
    │
    └── assets/
        ├── fonts/                 5 carpetas: Chakra-Petch, Orbitron,
        │                          main-fonts (Space-Grotesk, manrope), Gefika
        │                          y spoiler-script (estas dos sin uso, ver ROADMAP)
        ├── icons/                 SVG. Convención: *-hub-icon.svg = estado activo
        ├── imgs/                  Fotos de vehículos, piezas, noticias
        └── videos/                Video de fondo del hero
```

## Modelo de datos

> **Nota sobre el pivote.** Lo de abajo es el modelo **de hoy**. El pivote lo
> extiende (categorías jerárquicas, `ProductModel`, compatibilidad por vehículo,
> pedidos con comprobante, citas de servicio, reseñas) sin renombrar ninguna tabla
> existente. El detalle de lo que viene, tabla por tabla y migración por
> migración, está en la **sección 4 de `docs/PIVOT-2026-10.md`**. Hasta que cada
> fase se despliegue, no asumas que esas tablas ni esos modelos existen.

Hoy hay **tres modelos de artículo** porque representan tres inventarios distintos:

| Modelo               | Archivo                       | Representa                                  | Se usa en                            |
| -------------------- | ----------------------------- | ------------------------------------------- | ------------------------------------ |
| `AutoHubModel`       | `auto-hub.model.ts`           | Vehículo **propio**, verificado             | `/auto-hub`, `/auto-hub-details/:id` |
| `HubMarketItemModel` | `hub-market-item.model.ts`    | Publicación de **usuario** (3 categorías)   | `/hub-market` y sus 3 detalles       |
| `ProductModel`       | `product.model.ts`            | Producto de la **tienda propia** (tabla `hub_parts`) | `/tienda`, carrito, checkout, panel |

El archivo `product.model.ts` trae además
`ProductCategoryModel`, `VehicleMakeModel`, `VehicleModelModel`,
`ProductFitmentModel`, `ProfileVehicleModel` y los tipos de la búsqueda.

Otros: `CatalogItem` (tarjetas de categoría del home), `NewCardModel` (noticias),
`ServiciosCardModel` (servicios), `UserModel` (sesión), `SocialPostModel` /
`SocialClubModel` / `SocialEventModel` (Social Hub), `Checkout*` (checkout).

`CarCardModel` es solo un alias de `HubMarketItemModel`.

> Los modelos nuevos de la tienda (categorías, vehículos, compatibilidad, garaje)
> no son un cuarto inventario: son lo que describe a `ProductModel` y a quien
> compra. El detalle está en la sección 4 de `docs/PIVOT-2026-10.md`.

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
| `CartService` | `items`, `isOpen` + computed de totales | Solo acepta `ProductModel`; persiste en `localStorage` |
| `VehicleService` | `selected`: el vehículo elegido para filtrar la tienda | `localStorage` sin sesión, el garaje (`profile_vehicles`) con sesión |
| `ToastService`| cola de toasts, auto-cierre a 3s        | Renderizado por `<app-toast>`     |
| `AuthService` | sesión de Supabase Auth + perfil       | `user`, `isLoggedIn`, `isRestoring` |

El patrón es siempre el mismo: signal privado `_x`, expuesto como
`x = this._x.asReadonly()`, derivados con `computed()`.

## El shell de la aplicación

`app.html` monta lo que vive **fuera** del `<router-outlet>` y por lo tanto
persiste en todas las rutas:

```html
<header><app-navbar/></header>             <!-- sticky: el buscador y el carrito siempre a mano -->
<div class="app-content">                 <!-- padding-bottom en el teléfono, por la barra de pestañas -->
  <router-outlet/>
  <app-footer/>
</div>
<app-cart-modal/>                         <!-- panel lateral, controlado por CartService.isOpen -->
@defer (when pickerOpen()) { <app-vehicle-picker-modal/> }   <!-- se descarga al abrirlo -->
<app-toast/>                              <!-- notificaciones -->
<app-update-toast/>                       <!-- "Hay una versión nueva · Actualizar", arriba -->
<app-install-prompt/>                     <!-- banner de instalar, fijo encima de la barra; solo ≤ 900 px -->
<app-mobile-tab-bar/>                     <!-- solo ≤ 900 px: Inicio · Categorías · Buscar · Carrito · Cuenta -->
```

Implicación: login y registro **también** se ven con navbar y footer. Es
intencional — el usuario nunca pierde la navegación.

## La PWA

Instalable y con caché del shell; **los datos nunca se cachean**. Una PWA que muestra un
precio viejo es peor que una página lenta.

| Pieza | Dónde | Qué hace |
| ----- | ----- | -------- |
| `manifest.webmanifest` | `public/` | Nombre, colores `#121212`, `standalone`, `es-DO`, iconos 192/512 y sus `maskable` |
| `ngsw-config.json` | raíz | `app`: prefetch de index, JS, CSS, fuentes y manifest (~1.9 MB). `assets`: lazy, sin los videos. `dataGroups`: solo `/storage/v1/object/public/**` de Supabase; **nada** de `/rest/v1/` ni `/auth/v1/` |
| `provideServiceWorker` | `app.config.ts` | Solo en producción (`!isDevMode()`), `registerWhenStable:30000` |
| `InstallPrompt` | `shared/components/install-prompt` | Chrome/Edge/Android: `beforeinstallprompt` + botón. Safari iOS: pasos a mano. Nunca en `standalone`. "Ahora no" = 30 días (`localStorage`) |
| `PwaUpdateService` + `UpdateToast` | `shared/services`, `shared/components` | `VERSION_READY` → aviso → `activateUpdate()` + recarga. Busca al volver a la pestaña |
| `OnlineService` + `OfflineState` | `shared/services`, `shared/components` | `online$` e `isOnline`. Tienda, servicios, Auto Hub y Hub Market dicen "Sin conexión · Reintentar" cuando falla la red |

`vercel.json` sirve `ngsw.json`, `ngsw-worker.js`, `safety-worker.js` y `worker-basic.min.js`
con `Cache-Control: no-cache` (si el navegador cacheara el worker, los usuarios se quedarían
en la versión vieja para siempre) y el manifest como `application/manifest+json`.

**Límite conocido:** las imágenes de Storage se piden con `<img>` sin `crossorigin`, y el
service worker no guarda respuestas opacas por omisión (guardarlas gasta mucha cuota: Chrome
cuenta ~7 MB por cada una). Con la config actual el `dataGroup` queda armado pero es probable
que no guarde esas fotos. Hoy el catálogo usa assets locales, así que no se pudo comprobar;
revisar cuando las fotos reales estén en Storage.

## Reseñas y SEO de producto (fase 7)

| Pieza | Dónde | Qué hace |
| ----- | ----- | -------- |
| `ReviewService` | `shared/services` | `getStats` (`review_stats()`), `getReviews` (verificadas primero, 10 por página), `getMine`, `create`, `remove`. El modo simulado espeja las reglas pero **no puede verificar compras** |
| `<app-reviews target targetId>` | `shared/components/reviews` | El bloque de la ficha de producto y del detalle de servicio. Avisa las estadísticas con `(statsChange)` |
| `JsonLdService` + `structured-data.ts` | `shared/services`, `shared/utils` | `Product` en la ficha y `Service` en el detalle, como `<script type="application/ld+json" data-ld="…">` en el `<head>` |
| `scripts/generate-sitemap.mjs` | `prebuild` | `public/sitemap.xml`: páginas fijas, categorías y cada ficha de producto y servicio. Con credenciales lee Supabase (solo lo que ve un anónimo, sin `is_test`); sin ellas, los mocks; sin red, solo las fijas |
| `public/robots.txt` | — | Bloquea panel, cuenta, pedidos y búsqueda; apunta al sitemap |

- **`aggregateRating` solo con reseñas reales**, y sale de `review_stats()`, no de
  `ProductModel.starsRating` (que puede ser el dato sembrado). Un producto de prueba no
  lleva JSON-LD. Las URLs del JSON-LD son las canónicas (`SITE_URL`), no las de donde corra.
- **El JSON-LD lo pone JavaScript**: el sitio se renderiza en el navegador, así que lo ve
  quien ejecuta JS (Googlebot sí). Un renderizado en servidor sería otro proyecto.
- `vercel.json` fija `buildCommand: npm run build` para que el `prebuild` (el sitemap)
  corra también en Vercel.

## Notificaciones push

| Pieza | Dónde | Qué hace |
| ----- | ----- | -------- |
| `PushService` | `shared/services/push.service.ts` | `state` (`unsupported`, `needs-install`, `blocked`, `off`, `on`), `enable()`, `disable()` y `notify(kind, id)`. `SwPush` es opcional: en desarrollo y en las pruebas no hay service worker. Si guardar el dispositivo falla, deshace la suscripción del navegador |
| `<app-avisos>` | `pages/perfil/avisos` | "Avisos en este dispositivo". No se pinta donde no se pueden activar; en iPhone sin instalar sí, para explicar qué falta |
| `AdminService.setOrderStatus()` / `AdminServicesService.setAppointmentStatus()` | `shared/services` | Tras un cambio de estado que **salió bien**, llaman a `push.notify()`. Nunca hacen fallar el cambio |
| `send-push` + `webpush.mjs` | `supabase/functions/send-push` | La Edge Function y la criptografía de Web Push. No se compilan con la app |
| `environment.vapidPublicKey` | `src/environments` | La clave pública VAPID. La privada es un secreto de la función |

- El service worker de Angular ya sabe mostrar el aviso y abrir la ruta al tocarlo (`data.onActionClick`): no hay código propio
  para eso. El formato del mensaje lo arma `send-push`.
- Dos scripts prueban lo que `ng test` no ve: `scripts/verify-webpush.mjs` y `scripts/verify-send-push.mjs`.

## Variantes de producto (color, talla…)

| Pieza | Dónde | Qué hace |
| ----- | ----- | -------- |
| `ProductVariantModel` | `shared/models/product.model.ts` | Una opción: nombre, SKU, **stock propio**, orden, si se ofrece. `ProductModel` gana `hasVariants` y `variantLabel` |
| `ProductService.getVariants()` / `getVariantsFor()` | `shared/services` | Las opciones activas de un producto, o de varios en una sola lectura (el carrito) |
| `CartItem.variant` | `shared/services/cart.service.ts` | Una línea del carrito es la pareja **producto + opción**: el mismo producto en dos colores son dos líneas. `addToCart()` devuelve `false` si el producto tiene opciones y no se eligió una. `lineStock()` y `lineName()` dicen el stock y el nombre de una línea |
| `availabilityOf(producto, opción?)` | `shared/utils/product-availability.ts` | Con opción, las existencias son las de la opción; sin ella, la suma |
| La ficha | `pages/producto` | Selector de opciones (`role="radiogroup"`); la agotada se marca y no se puede elegir; "Agregar" sin elegir pide elegir |
| La tarjeta | `shared/components/catalogo-card` | Con opciones dice "Elige color" y el botón abre, dentro de la propia tarjeta, la lista para elegir ahí mismo. Las opciones se piden al abrirla (una sola vez), no al pintar la tarjeta: 24 tarjetas no hacen 24 consultas |
| `<app-image-gallery [focus]>` | `shared/ui/image-gallery` | La foto a la que saltar (la de la opción elegida). Una foto que no está entre las de la galería, o nula, no la mueve; cambiar de producto sí vuelve a la primera |
| `AdminCatalogService.getVariants()` / `saveVariants()` | `shared/services` | Lo del panel. `saveVariants` **no borra y reinserta** (una opción tiene identidad): compara con lo que había al abrir el formulario y solo toca lo que cambió, así que el stock de una opción no se pisa si alguien compró mientras estaba abierto |
| `<app-variant-editor>` | `pages/admin/inventario/variant-editor` | La lista editable: nombre, existencias, SKU, "se ofrece", subir/bajar y quitar |
| `variant-rules.ts` | `shared/utils` | Las reglas de la lista (nombre, repetidos, stock entero, SKU) para avisar antes de ir a la red |

- **El stock de una pieza con opciones no se edita a mano**: el panel lo enseña como la suma y la
  lista de piezas no ofrece el campo; lo recalcula un trigger de la base al guardar las opciones.
- Si cambias la forma en que se descuenta el stock, cámbiala en `create_order()`, en `set_order_status()`
  y en el modo simulado de `OrderService` (mismos mensajes que la base).

## Cupones y descuentos

| Pieza | Dónde | Qué hace |
| ----- | ----- | -------- |
| `CouponService` | `shared/services` | `validate()`: prueba un código con el carrito (`validate_coupon()`). El modo simulado guarda sus cupones en `localStorage` |
| `AdminCouponsService` | `shared/services` | Crear, editar, apagar y borrar (`/admin/cupones`); la lista trae los usos (`admin_coupon_usage()`) |
| `coupon-rules.ts` | `shared/utils` | **Espejo de `coupon_check()`**: mismas reglas, mismo orden, mismos mensajes. Lo usa el modo simulado y valida el formulario del panel |
| `<app-coupon-box>` | `shared/components/coupon-box` | Prueba el código, enseña el ahorro y, con un cupón puesto, **lo vuelve a probar** si cambia el subtotal, el envío o el correo (un envío gratis deja de valer al pasar a retiro) |
| `AdminCupones` | `pages/admin/cupones` | La pestaña del panel: estado de cada cupón (activo, apagado, vencido, por empezar, agotado) y su formulario |

- **El checkout manda solo el código** (`CheckoutSubmitPayload.couponCode`); el descuento que se ve
  antes de confirmar es una estimación y el definitivo lo calcula `create_order()`. `/pedido/:id` y
  el panel de pedidos muestran el descuento y el código.
- Si cambias una regla en `coupon_check()`, cámbiala también en `coupon-rules.ts` (y en las pruebas de
  `verify-migrations.sh`): un modo simulado más permisivo que la base hace que el checkout "funcione"
  en desarrollo y falle en producción.

## Rutas

28 rutas de primer nivel más el comodín, todas con `loadComponent` (lazy) y
`title`, salvo dos que solo redirigen: `/catalogo` → `/tienda` (conserva los query
params) y `/hub-part-details/:id` → `/tienda/p/:slug` (la resuelve
`productIdRedirectGuard`, porque ese enlace se llegó a compartir); `/admin` tiene además siete rutas hijas (`taller` trae cuatro pestañas propias). Ver `src/app/app.routes.ts`,
que está agrupado por pilar y comentado.

Protegidas por `authGuard`: `/publicar`, `/perfil`.
Protegidas por `guestGuard` (redirigen si ya hay sesión): `/login`, `/registro`.
`/admin` usa `moderatorGuard` en el padre y **cada sección se protege por su
cuenta** (`adminGuard` salvo `moderacion`); ver el comentario en el archivo.
`**` → `NotFound`. Debe quedar siempre de último.

**La tienda** vive en `/tienda` (todo), `/tienda/c/:slug` (una categoría) y
`/tienda/p/:slug` (la ficha). Los filtros viajan en la URL (`marca`, `min`, `max`,
`stock`, `compat`, `orden`; `shared/utils/store-filters.ts`) para que una búsqueda se
pueda compartir y recargar; el vehículo **no** viaja, es de quien mira. Siguen
funcionando los enlaces viejos `?category=<texto>` y `?categoria=<slug>`
(`legacy-categories.ts`). `/buscar?q=` separa lo de la tienda de lo que publica la
comunidad en Hub Market.

**El taller** (fase 5). `/servicios` es el catálogo agrupado por categoría, con los
trabajos realizados (solo si ya hay publicados), una línea de lo que **no** se hace y
dónde y cuándo se atiende; `/servicios/:slug` es el detalle. `cotizar` y `agendar` van
**antes** de `:slug` en las rutas (si no, "agendar" se leería como un servicio).
**Cotizar** no guarda nada: redacta el mensaje de WhatsApp (las fotos no se suben: se le
dice al cliente que las mande por el chat). **Agendar** son tres pasos (servicio → día y
hora → datos) con un calendario hecho a mano; las horas salen de `available_slots()` y
`book_appointment()` las vuelve a validar. La cita nace `requested` y la confirma el
equipo. Las horas son **siempre las de Santo Domingo** (`shared/utils/service-time.ts`).
"Mis citas" vive en `/perfil#citas`; el panel (`/admin/taller/*`) trae la agenda, el
catálogo, el horario con sus cierres y los trabajos. Ver `docs/BACKEND.md`.

**El pedido** (fase 4). `/checkout` son tres pasos (Entrega → Pago → Confirmar) y los
totales que muestra el último son una estimación: los de verdad los calcula
`create_order()` en Postgres y los muestra `/pedido/:id`. Esa página es **pública por
id** (el uuid es la llave; `get_order()` no devuelve nada personal) y pide a los
buscadores que no la indexen. Muestra la línea de tiempo (`order-status.ts`),
y según el pago: las cuentas y "Subir comprobante" (transferencia; bucket privado
`payment-proofs`) o el botón que abre WhatsApp con el pedido ya escrito. "Mis
pedidos" vive en `/perfil#pedidos`. El panel (`/admin/pedidos`) ofrece solo los
botones de estado que `set_order_status()` aceptaría. Ver `docs/BACKEND.md`.

**Compatibilidad** (`product-compat.ts`): un universal sirve siempre; uno
específico solo con un fitment que cubra el vehículo; uno específico **sin**
fitments cargados dice "Consultar compatibilidad", nunca "compatible".
**Disponibilidad** (`product-availability.ts`) es la única definición de "En stock:
N", "Bajo pedido: llega en N días" y "Agotado"; la tarjeta y la ficha la leen de ahí.

## Base de datos

25 tablas en Postgres. Ver `supabase/migrations/` y `docs/BACKEND.md`.

| Grupo                | Tablas                                                        |
| -------------------- | ------------------------------------------------------------- |
| Cuentas              | `profiles` (espeja `auth.users` vía trigger), `profile_vehicles` (el garaje) |
| Tienda               | `product_categories`, `vehicle_makes`, `vehicle_models`, `product_fitments` (más las columnas nuevas de `hub_parts`) |
| Administración       | `releases` (historial de versiones), `site_settings`          |
| Inventario propio    | `auto_hub_vehicles`, `hub_parts`, `services`, `news`           |
| Comunidad            | `hub_market_items`, `social_posts`, `social_clubs`, `social_events` |
| Comercio             | `shipping_options`, `payment_methods`, `orders`, `order_items` |
| Avisos               | `push_subscriptions` (dispositivos con notificaciones; se escribe solo con `register_push_subscription()`) |
| Opciones             | `product_variants` (color, talla…; cada una con su stock, y el del producto es la suma de las activas) |
| Cupones              | `coupons` (solo admin; los pedidos guardan `discount`, `coupon_id` y una copia de `coupon_code`) |
| Reseñas              | `reviews` (de productos y servicios; la compra verificada la calcula un trigger) |
| Marketing            | `club_subscriptions`                                           |

Decisiones que conviene conocer:

- **Los ids son `bigint`, no uuid** (salvo `profiles` y `orders`), para que rutas
  como `/car-details/101` y los modelos `id: number` siguieran funcionando.
- **`vehicleSpecs` está aplanado** en columnas `spec_*` en vez de jsonb, para
  poder filtrar por rango (año, kilometraje) con índices. El mapper lo rearma.
- **`seller_name` y `author_name` están denormalizados**: el contenido sembrado
  no tiene usuario real detrás. Cuando hay `seller_id`, el nombre sale del join
  con `profiles` y esa columna queda de respaldo.
- **RLS está activo en las 21 tablas.** La clave anon es pública; las políticas
  son lo único que protege los datos.

## Build

- Bundle inicial: **644 kB** (~170 kB transferidos, medido el 2026-10-23; el límite de aviso es 700 kB, subido desde 600 en la fase 2 porque el shell ahora trae el navbar, el buscador, la barra de pestañas y el footer). Cada
  página es un chunk aparte; el cliente de Supabase (~200 kB) va en el inicial
  porque el navbar necesita la sesión desde el primer render.
- `dist/` total: **6.2 MB**. `src/assets/fonts` pesa 308 KB y el video del hero
  792 KB.
- Budgets en `angular.json`: inicial 700 kB warning / 1 MB error; estilo por
  componente 12 kB / 16 kB (el default de 4 kB es irreal para páginas completas; el
  aviso subió de 8 a 12 kB en la fase 4 porque el checkout de tres pasos pesa
  ~10.8 kB de CSS. Si otra página lo pasa, partir sus estilos antes que subirlo).
- Producción sustituye `environment.ts` por `environment.production.ts`.

## Pruebas

- 127 archivos, 1344 pruebas, todas pasando (2026-10-23). Corren siempre en modo mock (los
  environments de prueba no traen credenciales), así que ninguna toca la red.
- Providers globales en `src/test-providers.ts`, declarado como `providersFile` en
  `angular.json` y agregado al `include` de `tsconfig.spec.json`.
- Incluye `provideHttpClientTesting()`: ninguna prueba llega a la red.
