# Roadmap

Trabajo pendiente, ordenado por relación valor/esfuerzo. Sale de la auditoría del
2026-08-11 (`docs/AUDIT-2026-08-11.md`), donde ya se arregló todo lo que estaba
roto. Esto es lo que **queda**.

Cada punto dice **por qué** importa, no solo qué hacer.

---

## P0 — Lo que sigue

### 1. ~~Apuntar `xautohubrd.com` a Vercel~~ ✅ **hecho**

El DNS ya apunta a Vercel. Comprobado como avisaba este mismo punto —un 200 no
prueba nada— leyendo las cabeceras: `server: Vercel` y `x-vercel-cache: HIT` en
el apex, y `www` redirigiendo al apex. El sitio real vive ahí desde la v1.0.0.

**Lo que quedó a medias de este punto:** en Supabase → Authentication → URL
Configuration, el **Site URL sigue siendo `http://localhost:4200`**. Las
Redirect URLs sí incluyen el dominio real (y localhost), así que hoy no rompe
nada:

- `mailer_autoconfirm` está en **true**, o sea que no se manda correo de
  confirmación al registrarse;
- y no hay flujo de "olvidé mi contraseña" en la app (no existe ninguna llamada a
  `resetPasswordForEmail`).

Pero Site URL es el destino por defecto de los enlaces que Supabase manda por
correo, y la app **no pasa `emailRedirectTo`** en ningún sitio. El día que se
active la confirmación de correo o se agregue recuperación de contraseña, esos
enlaces van a apuntar a `localhost:4200` y no van a funcionar para nadie. No se
cambió aquí porque cambiarlo hoy tampoco es gratis: haría que los correos del
desarrollo local apunten a producción, y ahora mismo no arregla nada visible.
Cuando se toque cualquiera de las dos cosas, este es el primer paso.

### 2. Seguridad del backend — **ya corregida y verificada**

Las migraciones 0004, 0005 y 0006 están ejecutadas. Se deja constancia de lo que
se encontró, porque son las trampas a no repetir (ver también `CLAUDE.md`):

| | Problema | Cómo se cerró |
| --- | --- | --- |
| 1 | **Escalada de privilegios.** Cualquier usuario registrado podía ponerse `is_admin = true` editando su propio perfil. Reproducido: una cuenta nueva cambió el precio de una pieza a RD$ 1 y pudo leer todos los pedidos. | Trigger `freeze_profile_privileges` (0005). Solo la `service_role` mueve `is_admin` / `is_verified`. |
| 2 | **El precio lo ponía el navegador.** `subtotal`, `total` y `unit_price` viajaban desde el cliente sin contrastarse con el catálogo. | La función `create_order` los calcula en Postgres; el cliente solo manda pieza y cantidad (0005). |
| 3 | **Checkout de invitado roto.** El pedido se creaba pero la app fallaba después, así que un reintento generaba duplicados. | Todo en una transacción dentro de `create_order` (0005). |
| 4 | **Correos y teléfonos públicos.** `profiles` era legible por cualquiera con la clave anon. | Permisos de columna (0006). Ver `docs/BACKEND.md`. |

Verificado repitiendo cada ataque contra la base después del arreglo.

Para gestionar el inventario propio necesitas ser admin. Regístrate y corre:

```bash
node scripts/make-admin.mjs tu@correo.com
```

### 3. Fuentes — **resuelto en la v0.1.0**

Se retiraron las cuatro que no tenían licencia comercial (Batman, ROLNER,
Designer, Dimona) y Biotrip-Serif, que decía `Personal use only`. Las reemplazan
Chakra Petch y Orbitron, ambas SIL OFL 1.1 y distribuidas con su `OFL.txt`.

Todo está ya en WOFF2 y con subconjunto latino: `src/assets/fonts` pesa **336 KB**.

Quedan dos sin usar y sin licencia documentada, **Gefika** (`--font-heading`) y
**Spoiler-script** (`--font-highlight`). No se renderizan en ningún lado; hay que
resolver sus derechos antes de darles uso. Ver `docs/CONVENTIONS.md`.

## P1 — Deuda que ya está costando

### 3.5. ~~El carrito no sobrevive una recarga~~ ✅ **hecho**

`cart.service.ts` ahora lo guarda en `localStorage` (`x-autohub.cart`). Antes
vivía solo en memoria: un F5, un enlace compartido o volver desde otra pestaña lo
dejaba vacío.

Guardar no era todo el trabajo, y por eso no fueron cuatro líneas: **lo guardado
envejece**. Al arrancar se pinta lo guardado enseguida (para que el contador no
parpadee en 0) y después se reconcilia contra el catálogo — cada pieza toma su
nombre y su precio de la base, y la que ya no está en el catálogo se cae del
carrito.

Eso último importa porque `create_order()` **recalcula los precios en Postgres**
(migración 0005): con un precio viejo en pantalla, alguien vería RD$ 2,850 y le
cobrarían RD$ 3,100. Si el catálogo no responde no se toca nada — mejor un precio
de ayer que un carrito vacío por un fallo de red.

De paso se arregló algo que estorbaba para probar: **`/checkout` ya se puede
abrir por URL directa** con el carrito lleno. Antes cualquier carga completa de
página lo vaciaba y el checkout caía en "Tu carrito está vacío".

### 4. Unificar las cinco páginas de detalle

`car-details`, `auto-hub-details`, `hub-part-details`, `hub-market-part-details` y
`accessory-details` tienen **el mismo código de galería copiado cinco veces**:

```ts
selectImage(index) { ... }
prevImage()  { if (this.images.length <= 1) return; ... }
nextImage()  { if (this.images.length <= 1) return; ... }
```

Y el mismo `toggleDescription()` en dos de ellas.

**Qué hacer:** extraer un `<app-image-gallery [images]="images">` en `shared/ui/` y
un `<app-expandable-text [text]="..." [maxLength]="200">`. Cada página de detalle
se queda solo con lo que la hace distinta.

**Por qué importa:** cinco copias significa que un arreglo de galería hay que
hacerlo cinco veces, y ya hay divergencia entre ellas (unas manejan el caso
"artículo no encontrado", otras no).

> Esto **no** unifica Auto Hub con Hub Market como producto. Comparten la galería,
> no el inventario.

### 5. `accessory-details` está sin terminar

Es la única página que sigue siendo un borrador: siete `<p>` sin estilo, mientras
las otras cuatro páginas de detalle tienen diseño completo. Ya se le arreglaron dos
bugs (bindeaba el array de imágenes completo al `src`, y el precio sin formato),
pero **visualmente rompe el sitio**. Es alcanzable desde `/hub-market` filtrando
accesorios.

Lo más rápido: reusar la estructura de `hub-market-part-details`, que muestra
exactamente el mismo modelo (`HubMarketItemModel`).

### 6. El carrito solo acepta piezas del catálogo

`CartService` está tipado a `HubPartModel`, así que:

- No se puede comprar un accesorio de Hub Market.
- `cart-modal` y `checkout` acceden a `item.part.price` — el nombre `part` está
  incrustado en las plantillas.

**Qué hacer:** introducir un `CartLineItem` con lo mínimo que el carrito necesita
(`id`, `name`, `price`, `imageUrl`, `source: 'catalogo' | 'hub-market'`) y que los
servicios mapeen hacia él. El checkout deja de conocer el modelo de piezas.

### 7. Panel de administración — **hecho**

`/admin` con cuatro secciones: historial de versiones, pedidos, inventario y
usuarios. Ver `docs/BACKEND.md`.

El inventario da de alta y edita por completo piezas, vehículos y noticias:
todos los campos, incluidas las imágenes, que se suben al bucket `inventory`
(escritura solo de admin, migración 0008). Ya no hace falta el Table Editor de
Supabase para el trabajo del día a día.

Al editar, quitar una foto que vivía en Storage la borra del bucket después de
guardar, para no dejar objetos que nada referencia. Las fotos sembradas apuntan a
`assets/imgs/...`, archivos del repo, y se ignoran en esa limpieza.

Lo que no tiene el panel es **borrar** un artículo. A propósito: un pedido con
líneas apunta a `hub_parts` y borrar una pieza vendida dejaría el histórico
señalando a nada. Ocultarla (`is_active = false`) hace el mismo trabajo sin ese
riesgo, y ya está.

### 8. Enlaces del footer que no llevan a nada

`Privacidad`, `Contacto` y `Reportar problema` son `href="#"`. Un enlace que no
lleva a ningún lado es peor que no tenerlo. Hay que crear las tres páginas o
quitar los enlaces hasta que existan.

---

## P2 — Modernizar a Angular 21

El código funciona; esto es para que siga siendo mantenible.

### 9. ~~`inject()` en vez de constructor~~ ✅

Hecho durante la migración a Supabase: todos los componentes que tocaban un
servicio pasaron a `inject()`. Quedan constructores solo donde no inyectan nada.

### 10. ~~`@if` / `@for` en vez de `*ngIf` / `*ngFor`~~ ✅

Hecho. **Cero** `*ngIf` / `*ngFor` en el proyecto, y `CommonModule` se cambió por
imports puntuales (`DecimalPipe`, `SlicePipe`, `DatePipe`) donde hacían falta.

### 11. Route params como inputs

Las cinco páginas de detalle hacen `route.paramMap.subscribe(...)` en `ngOnInit`.
Con `withComponentInputBinding()` en el router, el `id` llega como un `@Input` y
desaparece la suscripción manual.

### 12. `ChangeDetectionStrategy.OnPush`

**Cero** componentes lo usan hoy. (La antigua `PROYECTO.md` afirmaba que todos lo
tenían; no era cierto.) Se vuelve relevante cuando el estado migre a signals — con
signals + OnPush el rendimiento sube sin esfuerzo extra.

### 13. Cargar `supabase-js` bajo demanda

El cliente pesa ~200 KB y hoy va en el bundle inicial (535 KB en total, 137 KB
transferidos) porque el navbar necesita la sesión desde el primer render.

Un `await import('@supabase/supabase-js')` dentro de `SupabaseService` lo sacaría
del chunk inicial, a costa de volver asíncrono el getter `db` y, con él, todos los
servicios. **Solo vale la pena si el tiempo de primera carga se vuelve un
problema medible** — no antes.

### 14. Nombres inconsistentes

- `cart.ts` exporta `CartService` → renombrar a `cart.service.ts`.
- El sufijo `Component` es irregular: `HomeComponent`, `CatalogoComponent` vs
  `AutoHub`, `CarDetails`, `Servicios`. Elegir uno y aplicarlo.
- Los mocks viven en `shared/models/` junto a las interfaces, excepto
  `checkout-options.mock.ts` que está en `shared/data/`. Unificar en
  `shared/mocks/`.

---

## P3 — Funciones nuevas

Ordenadas por lo que más le suma al producto.

### 15. Perfil de usuario y "mis publicaciones"

Ya hay sesión (`AuthService`), `/publicar` está protegido y el servicio expone
`getBySeller(uid)` y `deactivate(id)` — con las políticas RLS que las respaldan.
Falta solo la página: el usuario puede publicar y después no puede gestionarlo.

Es el hueco más obvio del flujo actual y el que menos trabajo cuesta cerrar.

### 16. Favoritos

Guardar vehículos y piezas. Encaja con el `Club X AutoHub` que ya se promociona en
la página y da una razón concreta para crear cuenta.

### 17. Publicar en Social Hub

El feed es de solo lectura. Falta el formulario para que un miembro publique su
build. Es lo que convierte el Social Hub de escaparate a comunidad.

### 18. Búsqueda global

Hoy cada pilar tiene su propio buscador y no se hablan. Un buscador en el navbar
que cruce Auto Hub + Hub Market + Catálogo.

### 19. Filtros de verdad en Auto Hub

`/auto-hub` solo filtra por marca y modelo, con el filtro de categoría comentado en
el código. Para vehículos hacen falta rangos: precio, año, kilometraje, tipo de
chasis, combustible, tracción. Todos esos campos ya existen en `AutoHubModel`.

### 20. Video del hero: poster y peso

`citroen-c3-flying.mp4` son 2.5 MB con `autoplay`, y compite con el contenido por
el ancho de banda en la primera carga. Agregarle un `poster` (un frame exportado a
JPEG) hace que se vea algo de inmediato. Re-codificarlo a ~800 KB con `ffmpeg`
(no está instalado en este entorno) sería el arreglo completo.

### 21. Layout de Auto Hub

`auto-hub.scss` tiene el grid comentado y el contenedor en
`flex-direction: column`, así que las tarjetas se apilan en una sola columna
incluso en pantalla ancha. Parece un experimento a medias más que una decisión.
**Confirmar con Xaviel** si va en grid.

---

## Limpieza mecánica

Rápido, sin riesgo, cuando haya un rato:

- **19 iconos SVG sin usar** en `src/assets/icons/` (~120 KB). Lista completa en la
  auditoría. Varios son la versión inactiva de un par (`network-icon.svg`) o
  quedaron de rediseños (`next-*`, `bag-*`, `crowd-*`).
- **4 imágenes sin usar** en `src/assets/imgs/cars/` (corvette, gtr, lambo-bg,
  porsche) y `catalog/turbo.jpg` — ya optimizadas, ~150 KB en total.
- **`'Trebuchet MS'` a mano en 20 lugares**, saltándose el sistema de tokens.
  Debería ser `var(--font-body)` (o un token nuevo si el look es intencional).
- **Tokens declarados y nunca usados** en `styles.scss`: `--font-heading`,
  `--font-card-title`, `--font-highlight`, `--font-highlight3`, `--font-body2`,
  `--SpaceIndigo`, `--HubDark`.
- **24 ramas de git ya fusionadas** (todas con 0 commits por delante de `main`):
  ```bash
  git branch -d $(git branch --merged main | grep -v main)
  git remote prune origin
  ```
- **Barras de scroll ocultas globalmente** (`::-webkit-scrollbar { display: none }`
  en `styles.scss`). Se ve limpio pero le quita al usuario la referencia de dónde
  está en una página larga. Alternativa: una barra fina en los colores de la marca.
  **Es tu decisión de diseño** — lo dejo señalado, no cambiado.
