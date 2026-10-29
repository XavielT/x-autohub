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
- **Inventario multi-almacén** y **facturación con NCF.** Solo tienen sentido con más de un
  punto de venta y con volumen que obligue a facturar.
- **Trabajo nuevo en Social Hub**, que sigue sin desarrollarse a propósito.

---

## Pulido de la tienda y novedades (2.30.0) ✅

Hecho (el prompt 08 sustituye al 04b, que no llegó a correrse y queda **absorbido** aquí): "Mi vehículo" con selector
buscable y modelo escrito a mano (0040, y "Crear modelo" en el panel); home con video, íconos de categoría (0041) y una sola
tarjeta de vehículo; tildes y ñ en toda la interfaz; `/publicar` con subida de fotos comprimidas (1600 px, JPEG 85 %),
reordenar, visor y mapa con su CSP; moderación completa; listados de Auto Hub y Hub Market con filtros buscables,
pestañas y estado vacío; fichas de vehículo rediseñadas con relacionados; tarjeta de producto cuadrada con respaldo;
esqueletos de carga y barra de progreso; sugerencias del buscador con trigramas y alias (0042); perfil con foto
(recorte a 512×512 o uno de 8 avatares del sitio); modal de novedades y `/novedades` (0044); `/servicios` con chips;
comunidad con me gusta, comentarios y video (0045); descripciones reales en Auto Hub (0046); título y descripción
propios en cada ruta pública y `og-default.jpg` (`docs/SEO.md`).

Pendiente:

- **Aplicar las migraciones 0040 a 0046 y correr `./scripts/verify-migrations.sh` donde haya Postgres.** Ninguna se ejecutó
  todavía contra una base. La 0043 no existe a propósito: el bucket `avatars` ya estaba en la 0003.
- Esqueletos en el home, el checkout y el feed de la comunidad; el spinner de botón (`aria-busy`) está en los formularios
  principales, no en todos.
- Medir la latencia del buscador antes y después (se dejó el debounce, la caché por prefijo y la precarga de supabase-js,
  pero no hay cifras).
- Los `raise exception` de las migraciones siguen sin tildes (hay que redefinir cada función en una migración nueva).
- Gefika (títulos) no trae `¿` ni `¡`.

---

## Republicación automática (2.11.0 a 2.14.0) ✅

Hecho: un cambio de producto, opción, categoría, servicio o ajuste del sitio hace que la base pida un despliegue a Vercel
(*deploy hook*) 3 minutos después del último cambio, con un tope de uno cada 10 minutos. Las compras no cuentan (solo el
stock que llega a cero o sale de él). Ver "Republicar el sitio" en `docs/BACKEND.md`.

La 2.12.0 le sumó la barra de `/admin` (hay cambios sin publicar o el sitio está al día) con el botón "Publicar ahora", y que una
reseña nueva o borrada también cuente. La 2.14.0 le sumó **cómo terminó el despliegue** (en cola, construyendo, listo, falló), leído de
la API de Vercel por la Edge Function `build-status`.

**Lo que queda fuera:**

- **Avisar cuando un despliegue falla sin que nadie tenga abierto el panel.** Hecho en la 2.19.0 (ver abajo).

---

## Revisión de código y endurecimiento (2.23.1) ✅

Hecho: una revisión de todo lo publicado desde la 2.14.0 encontró nueve problemas; se corrigieron seis y los otros tres quedaron documentados como limitaciones. Lo más grave: cualquiera con
el uuid de un pedido o una cita de invitado podía registrar un `endpoint` de push ajeno y hacer que `send-push` le mandara un POST con un JWT VAPID firmado (un SSRF a ciegas); ahora el
endpoint tiene que ser de un servicio de push conocido, en la base y en la función (migración 0037). También: el prerender ya no falla si no hay publicaciones ni vehículos, una ficha
vendida o vencida no se indexa, un vehículo no disponible no se anuncia, el aviso de despliegue se reintenta si no llegó a nadie, y vender o renovar solo sirve para lo aprobado.

**Lo que se dejó, a propósito:**

- **Las llamadas de `pg_net` son "a lo sumo una vez".** Un 5xx de `send-push` justo en ese momento pierde el aviso. Arreglarlo exige leer `net._http_response`; para un aviso no vale la complejidad.
- **`localStorage` decide si la tarjeta de un invitado dice "activado".** Si se borran los datos del sitio dice "apagado" aunque siga registrado; activar de nuevo no duplica.

---

## Recordatorio de una cita (2.23.0) ✅

Hecho: una cita confirmada recibe un aviso push cuando faltan menos de 24 horas ("Mañana tienes tu cita en el taller a las 9:00 a. m."), tanto si es de una cuenta como de un
invitado que activó los avisos. Es un cron cada hora (migración 0036) y un solo recordatorio por hora de cita: si se reprograma, avisa de nuevo.

**Lo que queda fuera:**

- **Quien no activó los avisos no recibe nada.** El recordatorio es solo push; no hay correo ni SMS, y el WhatsApp del taller sigue siendo manual.
- **Un segundo recordatorio** (dos horas antes). Es uno solo, entre 24 y 2 horas antes.
- **Dejar de recibirlo sin quitar los demás avisos.** Se apagan todos juntos desde el perfil o la tarjeta del dispositivo.

---

## Avisos de una cita de invitado (2.22.0) ✅

Hecho: quien agenda una cita del taller sin cuenta puede activar, en la pantalla de confirmación, avisos push de esa cita (confirmada, en trabajo, lista). Es el mismo
mecanismo que los pedidos de invitado, con su propia tabla (migración 0035) y un componente compartido (`app-guest-avisos`).

**Lo que queda fuera:**

- **Volver a la cita después.** No hay una página de la cita para un invitado (solo existe la confirmación al agendar), así que el aviso se ofrece ahí y no se puede
  activar más tarde ni desde otro dispositivo.
- **Recordatorio de la cita** (el día antes): hecho en la 2.23.0 (ver abajo).

---

## Avisos a invitados (2.21.0) ✅

Hecho: quien compró sin cuenta puede activar, desde la página de su pedido, avisos push de ese pedido (pago confirmado, en camino, listo para retirar…). La
suscripción queda atada al pedido y no a una cuenta; el uuid del pedido es la llave, como para ver la página. Hasta 3 dispositivos por pedido, solo mientras
el pedido está en marcha, y se borran al entregarse o cancelarse (migración 0034).

**Lo que queda fuera:**

- **Citas de invitado.** Hecho en la 2.22.0 (ver abajo).
- **Ofrecerlo en el checkout.** Pedir el permiso de notificaciones antes de comprar estorba; se ofrece ya con el pedido hecho.
- **Quien guardó el enlace en otro navegador.** Los avisos son del dispositivo donde se activaron.

---

## Varias fotos por opción (2.20.0) ✅

Hecho: cada opción de un producto (color, medida) puede tener hasta 8 fotos, elegidas entre las del producto con casillas en el panel. Al elegir una
opción con 2 o más fotos propias, la ficha enseña solo esas; con una sola, salta a ella como antes; sin fotos, deja todas. La portada (la primera) es la
del carrito y el checkout (migración 0033).

**Lo que queda fuera:**

- **Subir una foto directamente a una opción.** Siguen siendo fotos del producto; una que solo exista para una opción hay que cargarla primero en el producto.
- **Ordenar las fotos de una opción distinto del producto.** El orden de la opción es el del producto, a propósito: no hay un segundo orden que arreglar.
- **Quitar `image_url`.** Se queda como espejo mientras pueda haber un frontend que la escriba.

---

## Aviso si falla un despliegue (2.19.0) ✅

Hecho: si el último despliegue de producción termina en error, los admins reciben un aviso push ("Falló el despliegue del sitio") con el
primer renglón del mensaje del commit, aunque nadie tenga el panel abierto. La base pregunta cada 10 minutos (migración 0032) y
`send-push` mira Vercel; un aviso por despliegue fallido.

**Lo que queda fuera:**

- **Avisar que ya se arregló.** Cuando el siguiente despliegue sale bien no llega nada; la barra de `/admin` lo muestra.
- **Webhook de Vercel.** Se descartó a propósito: pide plan Pro y el sondeo cada 10 minutos basta para un aviso que tarda, como mucho, 10 minutos.
- **Reintentar si nadie tenía los avisos activados.** Se anota y no se repite.

---

## JSON-LD de Auto Hub y Hub Market (2.16.0) ✅

Hecho: las fichas de Auto Hub declaran un `Car` (marca, modelo, año, kilometraje, combustible, tracción, carrocería) con su oferta en DOP,
vendida por X AutoHub como `AutoDealer`. Las de Hub Market son un `Car` (vehículos) o un `Product` (piezas y accesorios), con la condición
nueva o usada y **sin vendedor**: es una persona y su nombre no se publica. Una publicación pendiente o rechazada no declara nada.
`verify-prerender.mjs` exige el bloque, que parsee, que su `url` sea la canónica y que traiga precio.

**Lo que queda fuera:**

- **`aggregateRating` de vehículos**: no hay reseñas de vehículos.
- **Disponibilidad real**: sigue siendo `InStock` a propósito; lo vendido y lo vencido ya no se prerenderiza (2.17.0), así que lo que
  queda en el HTML está a la venta.

---

## Aviso de vencimiento por push (2.18.0) ✅

Hecho: a siete días de vencer, el vendedor recibe un aviso push ("Tu publicación está por vencer") que lo lleva a /perfil, donde renueva
con un toque. Lo pide la base una vez al día y lo manda `send-push` (migración 0031). Un solo aviso por cada plazo: renovar habilita el
siguiente.

**Lo que queda fuera:**

- **Correo.** Solo llega a quien activó los avisos en un dispositivo; no hay canal de correo en el proyecto.
- **Un segundo aviso el último día.** Es un solo aviso a los siete días.

---

## Vendido y caducidad de Hub Market (2.17.0) ✅

Hecho: una publicación tiene `sold_at` y `expires_at` (60 días). Su dueño la marca vendida o la renueva desde /perfil (con un aviso a
una semana de vencer); lo vendido y lo vencido sale de los listados, la búsqueda, el sitemap y el HTML prerenderizado, pero la ficha
sigue abierta con un aviso y sin WhatsApp. Un cron diario avisa al HTML de lo que venció (migración 0030).

**Lo que queda fuera:**

- **Avisarle al dueño que su publicación está por vencer**: hecho en la 2.18.0 (push; por correo sigue sin haber).
- **Que Auto Hub tenga lo mismo.** Sus vehículos son de X AutoHub y los maneja el panel con `is_available`; no lleva plazo.
- **Estado "vendido" visible en el listado** (una etiqueta en la tarjeta): hoy simplemente deja de salir.

---

## Prerenderizado de Auto Hub y Hub Market (2.15.0) ✅

Hecho: el listado de Auto Hub y la ficha de cada vehículo disponible, el listado de Hub Market y la ficha de cada publicación
aprobada (las tres rutas por categoría) salen como HTML estático, con título (`Toyota Corolla 2020 | Auto Hub — X AutoHub`),
descripción (kilometraje, combustible, lugar y precio), `og:image` y canónico; entran al sitemap y a `verify-prerender.mjs`. Los
cambios de `auto_hub_vehicles` y `hub_market_items` republican el sitio (migración 0029). 77 páginas en total.

**Lo que queda fuera:**

- **Avisar que una publicación se vendió.** Hecho en la 2.17.0 (ver arriba): vendido y caducidad.

---

## Prerenderizado (2.10.0) ✅

Hecho: 61 páginas (home, tienda, categorías, fichas de producto, taller y servicios, términos) salen como HTML estático en
cada build, con su título, descripción, JSON-LD y etiquetas `og:*` y canónico; los enlaces de una ficha ya enseñan el producto
en WhatsApp. Ver "Prerenderizado" en `docs/ARCHITECTURE.md`.

**Lo que queda fuera, a propósito (y por qué):**

- **Hidratación.** Haría que el cliente reutilice el DOM del servidor, pero obliga a que cada página pinte en su primer
  cuadro lo mismo que el servidor (con los datos ya en la mano, por `TransferState`); con datos que llegan por `fetch` hay que
  tocar los servicios uno a uno. Mientras tanto, una capa mantiene el HTML visible hasta que la app está lista.
- **Que un cambio en el panel republique el sitio** — hecho en la 2.11.0 (ver abajo).
- **Social Hub.** Es contenido de la comunidad y de poca prioridad de búsqueda; se prerenderiza agregando su ruta a
  `app.routes.server.ts` (y al `verify-prerender.mjs`). **Auto Hub y Hub Market ya están** (2.15.0, ver abajo).
- **JSON-LD de los vehículos** — hecho en la 2.16.0 (ver abajo).
- **Prerenderizar `/buscar` y las páginas con filtros** (`/tienda?marca=…`): dependen de la consulta, no de una ruta.

---

## Notificaciones push (2.8.0 y 2.13.0) ✅

Hecho: la sección "Avisos en este dispositivo" del perfil, la tabla `push_subscriptions`, la Edge Function
`send-push` y el aviso automático cuando el equipo cambia el estado de un pedido o una cita. Ver "Notificaciones
push" en `docs/BACKEND.md`.

La 2.13.0 los pasó de la mano del panel a un trigger de la base (`pg_net`): un cambio de estado hecho por cualquier
camino avisa. Sigue necesitando los secretos VAPID y los del Vault.

**Lo que queda fuera, a propósito (y por qué):**

- **Avisos a invitados.** Hecho en la 2.21.0 (ver abajo), desde `/pedido/:id` y no en el checkout.
- **Avisos de marketing** (ofertas, el club). Es otro permiso y otra conversación: hoy solo son avisos de lo que
  el cliente ya pidió.
- **Reintentos.** Si el servicio de push falla (un 500), el aviso se pierde; no hay cola.
- **Elegir qué avisar** (solo pedidos, solo citas). Hoy es todo o nada por dispositivo.

---

## Variantes de producto (2.7.0 y 2.9.0) ✅

**2.9.0 (el pulido):** cada opción puede apuntar a una de las fotos del producto y la ficha salta a ella al elegir; el
carrito y el checkout usan esa foto; y la tarjeta deja elegir la opción ahí mismo, sin abrir la ficha.

Hecho: un producto con opciones (color, talla…), cada una con su propio stock; la ficha, la tarjeta, el
carrito, el checkout y el pedido las dicen, y el panel las edita (`product_variants`, migración 0023). El
stock del producto es la suma de las opciones activas. Ver "Variantes de producto" en `docs/BACKEND.md`.

**Lo que queda fuera, a propósito (y por qué):**

- **Una sola dimensión.** "Rojo / M" se escribe en el nombre. Una matriz color × talla con stock por celda
  es otro proyecto, y casi todo accesorio es una cosa o la otra.
- **Precio por opción.** Todas comparten el precio del producto: la tarjeta, el JSON-LD y los cupones hablan
  de uno solo. Si una talla cuesta distinto, es otro producto.
- **Reseñas por opción.** Las reseñas son del producto.
- **Subir una foto directamente a una opción.** Hoy cada opción elige una de las fotos del producto (2.9.0); una
  foto que solo exista para una opción habría que cargarla primero en el producto.
- **Varias fotos por opción.** Hecho en la 2.20.0 (ver abajo).

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

### ~~Unificar las páginas de detalle (galería duplicada)~~ ✅ **la galería, resuelta**

Hecho: `car-details`, `auto-hub-details`, `hub-market-part-details` y `accessory-details` usan `app-image-gallery`; se borraron sus carruseles y ~250 líneas de SCSS. También el texto expandible: `app-expandable-text` (`shared/ui/`) sustituye al `toggleDescription()` de `car-details` y `auto-hub-details`. Visto en escritorio; falta el teléfono. Lo que sigue es el texto original, por historia.

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

### ~~`accessory-details` está sin terminar~~ ✅ **resuelto**

Hecho: la ficha ya tiene el diseño de Hub Market (dos columnas, categoría, vendedor, precio, WhatsApp, "Ver más en Hub Market") y usa `app-image-gallery` (miniaturas y zoom) en vez de mostrar solo la primera foto. Lo que sigue es el texto original del punto, por historia.

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

### ~~Cargar `supabase-js` bajo demanda~~ ✅ (2.29.0)

Hecho sin tocar las 157 consultas: `SupabaseService.db` devuelve un proxy (`lazy-client.ts`) que graba la cadena y la repite sobre el cliente real cuando se espera; `client()` da el cliente como promesa para lo
sincrónico (`onAuthStateChange`). El JS inicial bajó de ~167 KB a ~129 KB transferidos (`ng build`: 448 KB sin comprimir). Mediciones en `docs/ROADMAP.md` más arriba y con `scripts/mobile-perf.mjs`;
**Resultado medido en producción (Slow 4G, CPU x4, dos corridas):** LCP del home 3,1–3,3 s → 2,7–2,9 s (mejora real, modesta); `/auto-hub` 3,0 s → 2,8–3,1 s (sin cambio claro); `/tienda` 1,3 s (igual).
Por qué `/auto-hub` no mejora: su foto cuenta como LCP cuando la lista vuelve a pintarse con los datos, y ahora esos datos esperan primero a que llegue el módulo de `supabase-js` (lo pide AuthService al arrancar, pero
solo después de que el JS principal corre). Lo que seguiría: que el HTML precargue ese módulo (su nombre lleva hash, hay que sacarlo del build) o que Angular hidrate en vez de repintar (descartado a propósito, ver `CLAUDE.md`).
**2.29.2 (precarga del módulo desde el HTML):** el A/B con `STRIP_PRELOAD=1` (seis corridas intercaladas, mismo sitio) salió **demasiado ruidoso para concluir**: hubo corridas de 15 a 50 s por la red emulada, con
medianas de `/auto-hub` de 4,4 s con la precarga y 9,8 s sin ella, y la del home igual en ambos. No hay señal de daño y sí una débil de mejora en `/auto-hub`, así que se queda; la teoría es sólida (el módulo baja en
paralelo con el JS principal). Para medir bien haría falta un entorno de red estable o muchas más corridas. `scripts/mobile-perf.mjs` ya mata los procesos de Edge que lanza (antes quedaban vivos y ensuciaban las corridas siguientes).
Sesión verificada en producción con la cuenta de admin: se restaura, el panel carga y favoritos inserta y borra. Ver la trampa en `CLAUDE.md`.

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

### ~~Favoritos~~ ✅ (2.25.0)

Hecho: una persona con cuenta guarda productos de la tienda con el corazón de la tarjeta y de la ficha, y los ve en "Mis favoritos" del perfil. Tabla `favorites` (0038) con RLS y tope de 200. **Fuera, a propósito:** vehículos de Auto Hub y publicaciones de Hub Market (son únicos y se venden: guardarlos pide aviso de vendido, que es otro trabajo), y favoritos sin cuenta (`localStorage`): la razón de guardarlos era dar un motivo para crearla. **2.27.0:** el menú de la cuenta tiene "Mis favoritos (N)", que lleva a la sección del perfil (`/perfil#favoritos`).

### Publicar en Social Hub

El feed es de solo lectura. Falta el formulario para que un miembro publique su
build. **Congelado por el pivote**: Comunidad no recibe trabajo nuevo por ahora.

### ~~Filtros de verdad en Auto Hub~~ ✅ (2.24.0)

Hecho: `/auto-hub` filtra por tipo de chasis, combustible, tracción, precio máximo, año mínimo y kilometraje máximo, ordena (recientes, precio, año, kilometraje) y cuenta los resultados. La regla vive en `shared/utils/auto-hub-filters.ts` (pura, con sus pruebas); la página solo guarda los filtros en una señal. Los filtros son del navegador: no hay consulta nueva a la base. **2.26.0:** los filtros también viven en la URL (`/auto-hub?tipo=suv&precio=900000&orden=precio-asc`), así que una búsqueda se comparte; lo que llegue de la URL se valida. **Pendiente:** revisar el panel de filtros en un teléfono real.

### ~~Video del hero: poster y peso~~ ✅ (2.24.1)

Hecho: el video lleva `poster="assets/imgs/hero-poster.jpg"` (un cuadro del propio video, 1280x720, 65 KB) y `preload="metadata"`, así que la comunidad muestra una imagen al instante en vez de un hueco mientras el MP4 (792 KB) llega. El video sigue donde estaba.

### ~~Layout de Auto Hub~~ ✅ (2.28.0)

Hecho: `/auto-hub` es un grid de una a tres columnas (`repeat(auto-fill, minmax(min(100%, 340px), 1fr))`) y la tarjeta es vertical (foto 4:3 arriba, texto recortado a tres líneas). **Arregló además un desbordamiento real en teléfono:** la foto medía 500px fijos y en 390px la página medía 706px de ancho (`scrollWidth`). Comprobado con emulación móvil por CDP (Edge headless), no solo con el ancho de la ventana.

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
