# Roadmap

Trabajo hecho y pendiente. Hasta agosto de 2026 salía de la auditoría del
2026-08-11 (`docs/AUDIT-2026-08-11.md`); desde octubre el rumbo lo marca el
pivote del producto, descrito en `docs/PIVOT-2026-10.md`, que manda sobre este
archivo donde se contradigan.

Estado de partida del pivote: `v1.3.7`, sitio en vivo en `xautohubrd.com`.

Cada punto dice **por qué** importa, no solo qué hacer.

---

## El pivote: tienda de accesorios con taller (1.4.0 → 2.5.0)

X AutoHub pasa de cinco pilares al mismo nivel a **una tienda con taller**, con
vehículos y comunidad en segundo plano. Es el trabajo que sigue, en este orden,
una fase por sesión y un push a `main` con su versión cada una. Cada fase cierra
con el ritual de `CLAUDE.md` (build sin warnings, tests en verde,
`verify-migrations.sh` si tocó `supabase/`, bump, tag anotado, fila en
`releases`, `vercel --prod`).

| Fase | Qué entrega                                                       | Versión   | Toca `supabase/` | Estado       |
| ---- | ----------------------------------------------------------------- | --------- | ---------------- | ------------ |
| 0    | Documentación del pivote                                          | 1.4.0     | No               | hecha        |
| 1    | Esquema de tienda: categorías, producto, fitment, búsqueda, admin | 1.5.0     | 0017             | hecha        |
| 2    | Shell nuevo (navbar, barra inferior, footer) y home nuevo         | 2.0.0     | No               | hecha        |
| 3    | Tienda: listado con filtros, búsqueda, "mi vehículo", ficha       | 2.1.0     | No               | hecha        |
| 4    | Checkout nuevo, pedidos, comprobante, WhatsApp, Mis pedidos       | 2.2.0     | 0018             | hecha        |
| 5    | Servicios: catálogo, cotización, agenda, trabajos                 | 2.3.0     | 0019             | hecha        |
| 6    | PWA                                                               | 2.4.0     | No               | hecha        |
| 7    | Reseñas, SEO de producto, limpieza de código muerto               | **2.5.0** | 0020             | preparada    |

**Con la fase 7 el pivote queda completo.** Lo que sigue está abajo, en "Después del
pivote".

El orden está pensado para que el sitio nunca quede a medias en producción: la
fase 1 es invisible para el usuario; la 2 estrena la cara nueva sobre el
catálogo que ya existe; la 3 y la 4 lo convierten en tienda de verdad; la 5 y la
6 suman el taller y la app.

### Fase 1 — Esquema de tienda (1.5.0)

**Por qué:** todo lo demás se apoya en categorías jerárquicas, compatibilidad por
vehículo, disponibilidad (stock o bajo pedido) y una búsqueda que los cruce.
Hacerlo primero y sin UI pública permite probar el esquema y la seguridad sin
que el usuario lo note.

### Fase 2 — Shell y home nuevos (2.0.0)

**Por qué:** es lo que el visitante ve primero. Hoy el home abre con un hero que
no le dice qué hacer; el buscador, las categorías y "elige tu vehículo" sí. Es
`major` porque cambia cómo se navega el sitio publicado.

### Fase 3 — Tienda: listado, filtros, "mi vehículo" y ficha (2.1.0)

**Por qué:** sin filtros por vehículo y una ficha que diga "¿sirve para mi
carro?", una tienda de piezas es un catálogo mudo. La compatibilidad es la
diferencia con preguntar por WhatsApp.

**Hecho:** `/tienda` y `/tienda/c/:slug` con filtros en la URL; ficha
`/tienda/p/:slug` con galería, compatibilidad y disponibilidad; `/buscar`; el
garaje (`profile_vehicles`) en el perfil, con migración del vehículo del invitado;
los enlaces viejos (`/catalogo`, `?category=`, `/hub-part-details/:id`) siguen
funcionando. Se borraron las páginas `catalogo` y `hub-part-details`.

**Pendiente que dejó la fase:**
- **Filtro de marca en el RPC.** `search_products` no tiene `p_brand`, y la fase no
  tocaba Supabase, así que la marca se filtra en el cliente (trae páginas de 100 y
  corta). Es correcto pero no escala; cuando el inventario pase de unos cientos,
  agregar `p_brand` en una migración y quitar `searchByBrand`.
- **Precio de instalación** ("desde RD$ X") en la ficha: los servicios no tienen
  precio hasta la fase 5. Hoy dice "Instalación disponible" y el servicio.
- **Reseñas** en la ficha: hay un hueco con `TODO` para la fase 7.
- **Advisor de Supabase:** `search_path` mutable en `xah_unaccent`/`xah_slugify`; se arregla
  con una migración chica.

### Fase 4 — Checkout, pedidos y pago (2.2.0)

**Por qué:** hoy el checkout ofrece una tarjeta que no existe. Sin pasarela, el
flujo real es transferencia con comprobante o cierre por WhatsApp, y alguien
tiene que poder marcar `paid` en dos toques desde el teléfono, o no se hará.

**Hecho:** migración 0018 (estados, historial, `create_order()` con stock,
`set_order_status()`, comprobantes en un bucket privado, `get_order()`, `my_orders()`);
checkout en tres pasos; `/pedido/:id` con línea de tiempo y pago por transferencia
o WhatsApp; "Mis pedidos" en el perfil; panel de pedidos para el teléfono; cuentas
bancarias y dirección de retiro editables en `/admin/ajustes`; el carrito dice la
disponibilidad de cada línea y avisa cuando el stock bajó. 214 comprobaciones en
`verify-migrations.sh`.

**Pendiente que dejó la fase:**
- **Cargar las cuentas bancarias y la dirección de retiro reales** desde
  `/admin/ajustes`. Nacen como ejemplo y el sitio no las muestra: hasta entonces la
  transferencia funciona pidiendo los datos por WhatsApp.
- **Progreso de la subida del comprobante.** `supabase-js` no da progreso de subida
  (usa `fetch`); hoy la página deshabilita el botón y muestra una barra
  indeterminada. Con `XMLHttpRequest` o una URL firmada de subida habría porcentaje.
- **Correos transaccionales** (confirmación de pedido, pago confirmado): hoy el
  cliente se entera por `/pedido/:id` o por WhatsApp.
- **El precio de la instalación** sigue sin mostrarse en el checkout hasta la fase 5.
- **Cancelación por el cliente** y **reembolsos**: no hay; lo cancela un admin.
- **Un pedido por WhatsApp no tiene comprobante**: el pago lo acuerda el equipo y lo
  marca `paid`. Si quieren comprobante también ahí, es un cambio en
  `order_accepts_proof()`.

### Fase 5 — Servicios: catálogo, cotización, agenda y trabajos (2.3.0)

**Por qué:** el taller es el segundo pilar y hoy son cuatro tarjetas y un botón
de WhatsApp. Cotizar, agendar sin llamar y ver trabajos hechos es lo que
convierte una visita en un cliente, y habilita la instalación de lo que se
vende.

**Hecho:** migración 0019 (servicios con slug, categoría, precio, duración e imágenes;
horario del taller y cierres; citas; `available_slots()`, `book_appointment()`,
`set_appointment_status()`, `cancel_appointment()`; trabajos y su bucket público);
`/servicios` nueva, detalle, cotizar por WhatsApp y agendar en tres pasos; "Mis
citas" en el perfil con la regla de 24 horas; el panel del taller (Citas, Servicios,
Disponibilidad y Trabajos); la ficha de producto y `/pedido/:id` agendan la
instalación de verdad. 298 comprobaciones en `verify-migrations.sh`.

**Pendiente que dejó la fase:**
- **Poner los precios.** Los diez servicios nacen **a cotizar** (`price_from` nulo):
  "Desde RD$ X" es una promesa y la pone el taller desde el panel (`/admin/taller` →
  Servicios: cada tarjeta trae un campo "Desde RD$" y un botón "Guardar precio"; vacío
  = a cotizar, y el encabezado cuenta cuántos siguen sin precio). Hasta entonces
  el checkout y la ficha dicen "a cotizar".
- **Revisar el horario de ejemplo** (lunes–viernes 8:00–17:00, sábado 8:00–13:00,
  franjas de 60 min, 2 citas a la vez). Está marcado `is_example` y el panel lo
  avisa; ya se puede agendar con él, y toda cita pasa por confirmación.
- **Subir fotos reales de trabajos.** La base no trae ninguno: `/servicios` no pinta
  la sección hasta que se publique el primero.
- **Una cita ocupa solo su hora de inicio.** `duration_minutes` es informativo: un
  trabajo de tres horas no bloquea tres franjas. Si hace falta, `available_slots()`
  tendría que contar las franjas que cubre cada cita.
- **No hay "cambiar la hora" de una cita** (ni el cliente ni el admin): se cancela y se
  vuelve a agendar. Un invitado solo cancela por WhatsApp.
- **Avisos al confirmar una cita** (correo o WhatsApp automático): hoy el cliente ve el
  estado en "Mis citas" y el equipo escribe a mano.
- **El panel edita un solo tramo por día** (no mañana y tarde por separado).
- **Fotos de la cotización**: no se suben (no hay a dónde); se mandan por el chat.

### Fase 6 — PWA (2.4.0)

**Por qué:** el cliente de una tienda de accesorios entra desde el teléfono. Una
app instalable con barra de pestañas y shell en caché se siente como Mercado
Libre y no como una página, sin cachear precios ni stock.

**Pendiente tras la entrega (a mano, en un teléfono de verdad):**

- Lighthouse PWA en verde contra `xautohubrd.com`.
- Instalar en un Android y en un iPhone, y abrir sin red: tiene que verse el shell.
- Las fotos de Storage probablemente no se cachean (ver "La PWA" en
  `docs/ARCHITECTURE.md`); revisarlo cuando haya fotos reales ahí.

### Fase 7 — Reseñas, SEO y limpieza (2.5.0)

**Por qué:** las reseñas con compra verificada dan confianza, el SEO de producto
trae tráfico sin pagar, y la limpieza retira el código que el pivote dejó sin
dueño.

**Qué trae:** la migración 0020 (`reviews`, la compra verificada calculada por un trigger,
las estrellas de cada pieza recalculadas, `review_stats()`), el bloque de reseñas en la
ficha de producto y en el detalle de servicio, el JSON-LD `Product` y `Service`, el
`sitemap.xml` generado en cada build y `robots.txt`. Y la limpieza: se borraron
`page-counter-overview`, `home-featured-vehicles`, `home-featured-catalog`, `home-news`,
`StatsService`, el interruptor del contador en `/admin/ajustes`, `HubPartModel` y
`HubPartService` (nada los importaba, comprobado con grep).

**Pendiente tras la entrega:**

- **Search Console:** enviar `https://xautohubrd.com/sitemap.xml` y probar una ficha con el
  Rich Results Test de Google (el JSON-LD lo pone JavaScript; Googlebot lo ejecuta).
- **No hay moderación previa de reseñas**: se publican al instante y el admin puede
  borrarlas después (botón "Borrar (moderación)"). Si llega spam, el siguiente paso es
  un estado `pending`, no un cambio de esta migración.
- **Una reseña no se edita**, se borra y se escribe otra (decisión de la 0020).
- **`hub_parts.category` y los restos del contador del home: eliminados** (migración 0021,
  versión 2.5.2). Se quitaron la columna, `get_site_stats()` y la fila `stats_mode`; el
  plan lo condicionaba a que ningún `select` la leyera y para eso hubo que quitarla antes del
  frontend (ver "Limpieza de lo que dejó el pivote" en `docs/BACKEND.md`).
- **Las tarjetas muestran `stars_rating`**, que sin reseñas es el valor sembrado de antes.
  `search_products()` no devuelve `review_count` (columnas explícitas: añadirlo obliga a
  recrear la función, como se hizo en la 0021 para quitar `category`), así que la tarjeta no
  puede distinguir una estrella real de una sembrada. Si molesta, ese es el cambio.
- **Una reseña de un pedido de invitado no se verifica** (no hay a quién atribuirlo).
- **Assets sin uso: borrados (2026-10-23).** Eran 17 archivos: 14 iconos `.svg` de
  `src/assets/icons/` (`chat-round`, `home-hub2`, `market`, `market-hub`, `network`,
  `network-hub`, `next`, `next-hub`, `next-fat`, `next-hub-fat`, `not-found`, `not-found-w`,
  `speedometer`, `star-rounded`) y las fotos `cars/corvette.jpg`, `cars/lambo-bg.jpg` y
  `cars/porsche.jpg`. **Ojo, la lista anterior de aquí traía 10 de más**: `home-icon`, `bag-icon`,
  `cart-hub-icon`, `crowd-icon`, `crowd-hub-icon`, `auto-icon`, `auto-hub-icon`,
  `network2-icon`, `network2-hub-icon` y `services-icon` **sí se usan**: el navbar y la barra de
  pestañas arman el nombre en código (`assets/icons/${names[...]}.svg`) y un grep del nombre
  completo no los ve. Antes de borrar un asset, busca también el nombre sin la extensión y
  las plantillas de texto, y mira las tablas de la base. (Las dos `OFL.txt` de las fuentes son
  licencias: se quedan.)

---

## Después del pivote

Fuera de la ronda, a propósito (ver `docs/PIVOT-2026-10.md` §9). Cada uno con su porqué:

- **Pasarela de tarjeta (Azul/CardNet vía función serverless).** Hoy se paga por
  transferencia o se cierra por WhatsApp; la tarjeta convierte más, pero exige una
  función que no filtre la clave del comercio, conciliación y el manejo de contracargos.
- **Notificaciones push.** La PWA ya es instalable; falta avisar "tu pedido salió" o "tu
  cita se confirmó" (hoy el equipo escribe a mano). Pide una Edge Function y un permiso
  explícito del usuario.
- **Inventario multi-almacén** y **facturación con NCF.** Solo tienen sentido con más de un
  punto de venta y con volumen que obligue a facturar.
- **Renderizado en servidor** (o prerender) para el SEO: hoy el JSON-LD y el contenido los
  pone JavaScript. Es un proyecto aparte.
- **Trabajo nuevo en Social Hub**, que sigue sin desarrollarse a propósito.

---

## Variantes de producto (2.7.0) ✅

Hecho: un producto con opciones (color, talla…), cada una con su propio stock; la ficha, la tarjeta, el
carrito, el checkout y el pedido las dicen, y el panel las edita (`product_variants`, migración 0023). El
stock del producto es la suma de las opciones activas. Ver "Variantes de producto" en `docs/BACKEND.md`.

**Lo que queda fuera, a propósito (y por qué):**

- **Una sola dimensión.** "Rojo / M" se escribe en el nombre. Una matriz color × talla con stock por celda
  es otro proyecto, y casi todo accesorio es una cosa o la otra.
- **Precio por opción.** Todas comparten el precio del producto: la tarjeta, el JSON-LD y los cupones hablan
  de uno solo. Si una talla cuesta distinto, es otro producto.
- **Fotos por opción.** La galería es del producto; que cambie al elegir un color pide una imagen por
  opción en la tabla y en el formulario.
- **Reseñas por opción.** Las reseñas son del producto.
- **Elegir la opción desde la tarjeta.** Hoy el botón lleva a la ficha.

---

## Cupones y descuentos (2.6.0) ✅

Hecho: tres tipos (porcentaje con tope, monto fijo y envío gratis), compra mínima, vigencia, usos
en total y por cliente, el campo en el checkout, el descuento en `/pedido` y en el panel de pedidos, y
`/admin/cupones`. Todo el cálculo es de Postgres (`validate_coupon()` y `create_order()`); ver
"Cupones y descuentos" en `docs/BACKEND.md`.

**Lo que queda fuera, a propósito (y por qué):**

- **Un solo cupón por pedido.** Acumular cupones obliga a decidir el orden y qué tope manda;
  nadie lo ha pedido.
- **Cupones por producto o por categoría.** Hoy el descuento es sobre todo el subtotal. Serían
  columnas nuevas en `coupons` y una cuenta por línea dentro de `create_order()`.
- **Cupones automáticos** (sin código, por ejemplo "10 % la primera compra"). Es otra regla:
  se aplica sola, no se escribe.
- **El límite por cliente de un invitado se salta cambiando de correo.** No hay forma honesta de
  evitarlo sin cuenta; para un tope firme usa los usos en total.
- **Avisar al cliente de un cupón** (correo o WhatsApp): hoy los códigos se reparten a mano.

---

## Hecho

### ~~Apuntar `xautohubrd.com` a Vercel~~ ✅ **hecho**

El DNS ya apunta a Vercel. Comprobado como avisaba este mismo punto —un 200 no
prueba nada— leyendo las cabeceras: `server: Vercel` y `x-vercel-cache: HIT` en
el apex, y `www` redirigiendo al apex. El sitio real vive ahí desde la v1.0.0.

**La otra mitad, tambien hecha:** el **Site URL** de Supabase Auth estaba en
`http://localhost:4200` y ahora apunta a `https://xautohubrd.com`. Las Redirect
URLs siguen incluyendo localhost, asi que el desarrollo local no se toca.

No rompia nada todavia —`mailer_autoconfirm` esta en `true`, o sea que el
registro no manda correo de confirmacion, y no hay flujo de "olvide mi
contraseña"—, pero Site URL es el destino por defecto de los enlaces que Supabase
manda por correo y la app **no pasa `emailRedirectTo`** en ningun sitio. El dia
que se active la confirmacion o se agregue recuperacion de contraseña, esos
enlaces ya apuntan al sitio y no a la maquina de quien programo.

### Seguridad del backend — **ya corregida y verificada**

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

### Fuentes sin licencia — **resuelto en la v0.1.0**

Se retiraron las cuatro que no tenían licencia comercial (Batman, ROLNER,
Designer, Dimona) y Biotrip-Serif, que decía `Personal use only`. Las reemplazan
Chakra Petch y Orbitron, ambas SIL OFL 1.1 y distribuidas con su `OFL.txt`.

Todo está ya en WOFF2 y con subconjunto latino: `src/assets/fonts` pesa **336 KB**.

Lo que quedó sin resolver (Gefika y Spoiler-script) está en "Pendiente que no
depende del pivote".

### ~~El carrito no sobrevive una recarga~~ ✅ **hecho**

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

### Panel de administración — **hecho**

`/admin` con seis secciones: moderación, versiones, pedidos, inventario, usuarios
y ajustes. Ver `docs/BACKEND.md`.

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

### ~~El distintivo "PRUEBA" no se leia sobre las tarjetas del panel~~ ✅ **hecho**

Era `#c62828` sobre `#c6282824`. El fondo translucido toma el color de lo que
tiene detras: sobre el fondo de la pagina daba 3.1:1, pero sobre las tarjetas del
panel (`--main-light`) se quedaba en **1.6:1**, y a 11px eso no se lee. Ahora va
relleno con el mismo rojo y letra blanca: **5.6:1**, y ya no depende del fondo.

El rojo y la forma no cambian — lo unico que cambia es cual de las dos partes
lleva el color. Es tambien como ya se dibujaban los distintivos de rol del panel.

> Sigue habiendo **cuatro copias** de este estilo: el componente
> `shared/ui/test-badge` y una en cada uno de `admin-moderacion`,
> `admin-usuarios` y `admin-inventario`. Hubo que cambiar las cuatro a mano. Lo
> que toca es que las tres del panel usen el componente.

### ~~`inject()` en vez de constructor~~ ✅

Hecho durante la migración a Supabase: todos los componentes que tocaban un
servicio pasaron a `inject()`. Quedan constructores solo donde no inyectan nada.

### ~~`@if` / `@for` en vez de `*ngIf` / `*ngFor`~~ ✅

Hecho. **Cero** `*ngIf` / `*ngFor` en el proyecto, y `CommonModule` se cambió por
imports puntuales (`DecimalPipe`, `SlicePipe`, `DatePipe`) donde hacían falta.

---

## Pendiente que no depende del pivote

Lo que ya estaba en la lista antes del pivote y no cabe en ninguna de sus fases.
Ordenado por relación valor/esfuerzo. Donde una fase del pivote toca el mismo
terreno, se dice.

### Fuentes: Gefika y Spoiler-script

Quedan dos sin usar y sin licencia documentada, **Gefika** (`--font-heading`) y
**Spoiler-script** (`--font-highlight`). No se renderizan en ningún lado; hay que
resolver sus derechos antes de darles uso. Ver `docs/CONVENTIONS.md`.

**Por qué:** cargar una fuente sin saber si se puede usar comercialmente es el
mismo error que obligó a retirar Batman y ROLNER.

### Unificar las páginas de detalle (galería duplicada)

`car-details`, `auto-hub-details`, `hub-part-details` y `hub-market-part-details`
tienen **el mismo código de galería copiado cuatro veces** (`selectImage`,
`prevImage`, `nextImage`, y el mismo `toggleDescription()` en dos de ellas).
`accessory-details` no lo tiene porque muestra solo la primera imagen.

**Qué hacer:** extraer un `<app-image-gallery [images]="images">` en `shared/ui/`
y un `<app-expandable-text [text]="..." [maxLength]="200">`. Cada página de
detalle se queda solo con lo que la hace distinta.

**Por qué importa:** cuatro copias significa que un arreglo de galería hay que
hacerlo cuatro veces. **Ojo:** la fase 3 ya extrajo `shared/ui/image-gallery` para la
ficha nueva (`/tienda/p/:slug`). Falta migrar a él las cuatro páginas de detalle
de arriba, que siguen con su copia (`hub-part-details` ya no existe).

> Esto **no** unifica Auto Hub con Hub Market como producto. Comparten la galería,
> no el inventario.

### `accessory-details` está sin terminar

Es la única página de detalle que sigue siendo un borrador: `<h1>`, una imagen y
cuatro `<p>` sin estilo (más el botón de WhatsApp y el estado "no encontrado"),
mientras las otras tienen diseño completo. Es alcanzable desde `/hub-market`
filtrando accesorios.

Lo más rápido: reusar la estructura de `hub-market-part-details`, que muestra
exactamente el mismo modelo (`HubMarketItemModel`).

**Por qué:** la fase 2 le pone la etiqueta "De la comunidad" a las tarjetas de
Hub Market; la página a la que llevan debería estar a la altura.

### El carrito solo acepta piezas del catálogo

`CartService` está tipado a `ProductModel` (`CartItem.part`), así que no se puede
comprar un accesorio de Hub Market, y `cart-modal` y `checkout` acceden a
`item.part.price`: el nombre `part` está incrustado en las plantillas.

**Cómo quedó con el pivote:** la fase 1 convirtió `HubPartModel` en alias
deprecado de `ProductModel` (la fase 7 lo borró), y la fase 4 reescribió el checkout. Hub Market sigue sin vender dentro del sitio (el
contacto es por WhatsApp), de modo que el `CartLineItem` con `source:
'catalogo' | 'hub-market'` que proponía este punto **ya no hace falta**; basta
con que el carrito hable de `ProductModel`.

### ~~Enlaces del footer que no llevan a nada~~ ✅ **resuelto en la fase 2**

El footer nuevo no trae `Privacidad`, `Contacto` ni `Reportar problema`: no hay
nada detrás de ellos y un enlace que no lleva a ningún lado es peor que no tenerlo.
Contacto pasó a ser la línea de WhatsApp (809-953-9782). **Pendiente:** si hace
falta una página de privacidad (hay formularios que recogen correos y teléfonos),
es un trabajo aparte y legal, no de interfaz.

### Route params como inputs

Las páginas de detalle hacen `route.paramMap.subscribe(...)` en `ngOnInit`. Con
`withComponentInputBinding()` en el router (hoy no está puesto), el `id` llega
como un `@Input` y desaparece la suscripción manual.

**Por qué:** la fase 3 estrena `/tienda/p/:slug` y `/tienda/c/:slug`; es el
momento natural de adoptarlo, pero cambia todas las páginas con parámetros a la
vez, así que decídelo aparte.

### `ChangeDetectionStrategy.OnPush`

**53** componentes ya lo usan; la versión anterior de este punto decía "cero" y
era falsa. Falta saber cuáles no, y migrarlos. (La antigua `PROYECTO.md`
afirmaba que todos lo tenían; tampoco era cierto.)

### Cargar `supabase-js` bajo demanda

El cliente pesa ~200 KB y hoy va en el bundle inicial (**630 kB** en total,
**167 kB** transferidos, medido el 22/10/2026) porque el navbar necesita la
sesión desde el primer render. La fase 2 sumó 45 kB al shell (navbar, buscador,
barra de pestañas, footer) y por eso el presupuesto de aviso de `angular.json`
subió de 600 a 700 kB; el error sigue en 1 MB. Esta es la palanca que queda si
el margen se acaba: sacar `supabase-js` del bundle inicial.

Un `await import('@supabase/supabase-js')` dentro de `SupabaseService` lo sacaría
del chunk inicial, a costa de volver asíncrono el getter `db` y, con él, todos los
servicios. **Solo vale la pena si el tiempo de primera carga se vuelve un
problema medible** — no antes. La fase 2 es el punto donde revisar la cifra.

### Nombres inconsistentes

- El sufijo `Component` es irregular: `HomeComponent`, `CatalogoComponent` vs
  `AutoHub`, `CarDetails`, `Servicios`. Elegir uno y aplicarlo.
- Los mocks viven en `shared/models/` junto a las interfaces, excepto los de
  `shared/data/`. Unificar en `shared/mocks/`.

(`cart.ts` ya se llama `cart.service.ts`: ese punto está hecho.)

### Perfil: gestionar las publicaciones

`/perfil` existe y lista las publicaciones del usuario (`getBySellerId`), pero la
página no llama a `deactivate()`: el servicio y las políticas RLS que la respaldan
están, falta el botón. El usuario puede publicar y no puede retirar lo suyo desde
su perfil.

### Favoritos

Guardar vehículos y piezas. Encaja con el `Club X AutoHub` que ya se promociona en
la página y da una razón concreta para crear cuenta.

### Publicar en Social Hub

El feed es de solo lectura. Falta el formulario para que un miembro publique su
build. **Congelado por el pivote**: Comunidad no recibe trabajo nuevo por ahora.

### Filtros de verdad en Auto Hub

`/auto-hub` solo filtra por marca y modelo, con el filtro de categoría comentado en
el código. Para vehículos hacen falta rangos: precio, año, kilometraje, tipo de
chasis, combustible, tracción. Todos esos campos ya existen en `AutoHubModel`.

### Video del hero: poster y peso

`citroen-c3-flying.mp4` sigue en `src/assets/videos/` (792 KB en disco; la
versión anterior de este punto decía 2.5 MB) y lo usa `home-welcome` con
`autoplay`. La fase 2 lo mudó a `/social-hub` (la Comunidad), donde ya no es lo
primero que carga el sitio. Sigue faltando un `poster` (un frame exportado a
JPEG) para que se vea algo de inmediato.

### Layout de Auto Hub

`auto-hub.scss` tiene el grid comentado y el contenedor en
`flex-direction: column`, así que las tarjetas se apilan en una sola columna
incluso en pantalla ancha. Parece un experimento a medias más que una decisión.
**Confirmar con Xaviel** si va en grid.

---

## Limpieza mecánica

Rápido, sin riesgo, cuando haya un rato. Los assets los decide Xaviel (ver
`CLAUDE.md`); aquí se listan, no se borran.

- **Iconos SVG sin usar** en `src/assets/icons/` (la auditoría contó 19; hoy hay
  44 archivos en la carpeta y el número exacto hay que recalcularlo). Varios son
  la versión inactiva de un par (`network-icon.svg`) o quedaron de rediseños
  (`next-*`, `bag-*`, `crowd-*`). La fase 2 cambia el navbar y puede dejar más.
- **4 imágenes sin usar** en `src/assets/imgs/cars/` (corvette, gtr, lambo-bg,
  porsche) y `catalog/turbo.jpg`; sin recomprobar contra el código de hoy.
- **`'Trebuchet MS'` a mano en 26 lugares** de los `.scss`, saltándose el sistema
  de tokens (la auditoría contó 20). Debería ser `var(--font-body)` (o un token
  nuevo si el look es intencional).
- **Tokens declarados y nunca usados** en `styles.scss` (0 usos de `var(--x)`
  medidos el 22/10/2026): `--font-heading`, `--font-card-title`,
  `--font-highlight`, `--font-body2`, `--SpaceIndigo`. La lista anterior traía
  dos errores: `--HubDark` **sí se usa** (3 veces) y `--font-highlight3` **no
  existe** en `styles.scss`.
- **Ramas de git ya fusionadas:** la lista de 24 ramas ya no es cierta (hoy solo
  `develop` y `main` figuran como fusionadas). Revisa con
  `git branch --merged main` y `git remote prune origin` antes de borrar nada.
- **Barras de scroll ocultas globalmente** (`::-webkit-scrollbar { display: none }`
  en `styles.scss`). Se ve limpio pero le quita al usuario la referencia de dónde
  está en una página larga. Alternativa: una barra fina en los colores de la marca.
  **Es tu decisión de diseño** — lo dejo señalado, no cambiado.
