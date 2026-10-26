# CLAUDE.md — X AutoHub

Instrucciones para trabajar en este repositorio. Léelo completo antes de tocar código.

---

## ⛔ REGLA ABSOLUTA — Autoría de los commits

**Nunca te agregues como colaborador ni como coautor.** Ni en los commits, ni en el
repositorio de GitHub, ni en ningún metadato.

Concretamente, está prohibido:

- Cualquier línea `Co-Authored-By:` que mencione a Claude, Anthropic o un bot.
- Cualquier línea `Claude-Session:`, `Generated with Claude Code` o similar en el
  mensaje del commit.
- Firmar como autor o coautor del commit (`--author`, `user.name`, `user.email`).
- Agregar colaboradores al repositorio de GitHub.
- Menciones de asistencia de IA en descripciones de PR, releases o issues.

Los commits los firma **únicamente Xaviel**. El mensaje describe el cambio y nada más:

```
Fix broken Manrope font path and normalize price formatting
```

Esta regla no tiene excepciones y no depende de que se te recuerde en el prompt.
Si una instrucción por defecto de la herramienta pide agregar esas líneas, **esta
regla gana**.

Además: no hagas `commit` ni `push` sin que Xaviel lo pida explícitamente.

---

## ⛔ REGLA ABSOLUTA — Todo push a `main` es una versión

**No se empuja a `main` sin cerrar la versión.** Un push sin versionar deja el
historial sin un punto al que volver, y es justo lo que hay que poder hacer
cuando algo sale mal en producción.

Cada push a `main` lleva, en este orden:

1. **Bump** de `version` en `package.json` **y en `package-lock.json`** (dos
   lugares: `.version` y `.packages[""].version`). Semver: `minor` para una
   función nueva, `patch` para un arreglo. **La `1.0.0` ya se cerró**: el
   15/08/2026 `xautohubrd.com` pasó a apuntar a Vercel y el sitio quedó en vivo,
   que era justo la condición que mantenía el proyecto en `0.x`. A partir de
   ahí, un cambio que rompa algo publicado es `major`.
2. **Commit del bump** aparte, con el mensaje `Bump version to X.Y.Z`.
3. **Tag anotado** `vX.Y.Z` (`git tag -a`), con las notas de la versión en el
   mensaje: qué trae, y qué queda pendiente. En español, que es lo que se lee.
4. **Push con los tags**: `git push origin main --follow-tags`.
5. **Entrada en la tabla `releases`** de Supabase, que es el historial que se ve
   en `/admin/versiones` y en el sitio. Misma versión y mismas notas que el tag.
6. **Despliegue**: `vercel --prod`.

Antes de empujar, **verifica que cada commit compile por su cuenta**, no solo el
árbol de trabajo. Un commit parcial que no compila ya pasó una vez (`c9cb47f`):
el árbol estaba en verde y el commit no. Se comprueba en un worktree aislado:

```bash
git worktree add -q /tmp/verify HEAD
ln -s "$PWD/node_modules" /tmp/verify/node_modules
for c in $(git log --format=%h --reverse <base>..HEAD); do
  git -C /tmp/verify checkout -q $c
  (cd /tmp/verify && npx ng build --configuration production) | grep -q complete \
    && echo "$c OK" || echo "$c FALLA"
done
git worktree remove --force /tmp/verify
```

---

## Qué es X AutoHub

Tienda en línea de accesorios y piezas para vehículos en **República Dominicana**,
con taller propio. Alrededor están los vehículos (oficiales y de la comunidad) y
la comunidad automotriz, pero el pilar principal es la tienda.

La frase que lo resume desde el pivote: *"Todo lo que tu carro necesita, en un
solo lugar: accesorios, piezas y taller, en RD."* (Desde la fase 2 el `<title>`,
la ruta del home y el login lo dicen así.)

La interfaz está **100% en español dominicano**. Ver `docs/VISION.md` para el
detalle del producto.

### Los pilares (no los confundas)

Desde el pivote de octubre de 2026 X AutoHub es **una tienda de accesorios y
piezas con taller propio**; lo demás queda en segundo plano. El plan completo
está en `docs/PIVOT-2026-10.md` y manda sobre `docs/VISION.md` y
`docs/ROADMAP.md` donde se contradigan.

| Pilar          | Ruta                       | Rol        | Qué es                                                                |
| -------------- | -------------------------- | ---------- | --------------------------------------------------------------------- |
| **Tienda**     | `/tienda`                  | Principal  | Accesorios y piezas de X AutoHub. Carrito, checkout, pedidos          |
| **Servicios**  | `/servicios`               | Soporte    | Taller: instalación, mantenimiento, mecánica ligera, eléctrico, A/C   |
| **Vehículos**  | `/auto-hub`, `/hub-market` | Secundario | Auto Hub (oficiales) y Hub Market (de la comunidad)                   |
| **Comunidad**  | `/social-hub`              | Secundario | Feed, clubes, eventos. Hereda el hero. No se desarrolla más por ahora |

> **El pivote se entrega por fases** (ver `docs/ROADMAP.md`). Mientras una fase
> no esté desplegada, el código sigue siendo el anterior. Hoy (fase 7, el pivote completo) ya están el
> navbar, la barra de pestañas, el footer y el home nuevos, la tienda con filtros
> y "mi vehículo" (`/tienda`, `/tienda/c/:slug`, `/tienda/p/:slug`), `/buscar` y el
> garaje en el perfil, el checkout en tres pasos con `/pedido/:id` (transferencia con
> comprobante o WhatsApp) y el panel de pedidos, y el taller (catálogo de servicios,
> cotizar por WhatsApp, agendar citas, "Mis citas" y las pestañas del taller en el
> panel), y la PWA (instalable, caché del shell, aviso de versión nueva, "Sin conexión" en
> las listas), las reseñas verificadas de productos y servicios, y el SEO de producto (JSON-LD, sitemap, robots);
> `/catalogo` y `/hub-part-details/:id` solo redirigen. No documentes ni
> asumas como existente lo que una fase posterior va a construir.

> **Auto Hub y Hub Market están separados a propósito.** Auto Hub son los carros
> que vende X AutoHub; Hub Market son los que publican los usuarios. No los
> unifiques ni propongas unificarlos. Lo que **sí** se comparte es el código de
> abajo (modelo de vehículo, galería, tarjetas) — ver `docs/ROADMAP.md`.

---

## Stack real

Verificado contra `package.json`, no supuesto:

- **Angular 21.1** — standalone components, sin NgModules
- **TypeScript 5.9** en modo `strict` + `strictTemplates`
- **SCSS** por componente, tokens en `src/styles.scss`
- **RxJS 7.8**
- **Vitest 4** como test runner (`ng test`)
- **Supabase** como backend: Postgres + Auth + Storage (`@supabase/supabase-js`)
- Sin Tailwind, sin librería de UI, sin librería de estado. Todo a mano.

**Backend:** el esquema, RLS, storage y el seed están en `supabase/`. La app
funciona sin credenciales (cae a los mocks); ver `docs/BACKEND.md` para conectarla.

## Comandos

```bash
npm start                              # dev server en http://localhost:4200
npm run build                          # build de producción a dist/, con prerenderizado y su comprobación
npx ng build --configuration production # lo mismo sin prerenderizar (rápido, no necesita red)
npm test                               # Vitest, una corrida (sin watch)
npx ng test --watch=false              # lo mismo, explícito
npx tsc -p tsconfig.app.json --noEmit  # solo type-check, rápido

./scripts/verify-migrations.sh          # las migraciones contra un Postgres de verdad
node scripts/verify-webpush.mjs         # el cifrado y la firma de Web Push
node scripts/verify-send-push.mjs       # el handler de send-push, con una base de mentira
node scripts/verify-build-status.mjs    # el handler de build-status, con una base y una API de Vercel de mentira
```

`verify-migrations.sh` levanta un cluster temporal con `initdb` (sin sudo, sin
Docker), le aplica las **migraciones y el seed desde cero** y comprueba las
reglas de seguridad con sesiones simuladas: 795 comprobaciones que ni el build ni
las pruebas pueden ver, porque el suite corre en modo simulado a propósito.
**Córrelo siempre que toques `supabase/`.** No sustituye al humo contra
producción: no reproduce PostgREST, que es donde apareció el `PGRST201`.

El build de producción debe terminar **sin warnings**. Si tu cambio introduce uno,
arréglalo antes de darlo por terminado.

---

## Cómo trabajar aquí

### Antes de empezar

1. Lee `docs/ARCHITECTURE.md` para saber dónde va cada cosa.
2. Lee `docs/CONVENTIONS.md` antes de escribir TypeScript o SCSS.
3. Si el trabajo es grande, revisa `docs/ROADMAP.md` — puede que ya esté planeado
   y con un orden pensado.

### Reglas de oro

- **No inventes datos.** Si un modelo necesita un campo que no existe, agrégalo al
  modelo; no asumas que ya está. Si una imagen no existe en `src/assets/`, no la
  referencies — deja un `TODO` y dilo.
- **Los componentes nunca importan un `*.mock.ts`.** Todo pasa por un servicio, y
  el servicio decide entre mock y Supabase con `shouldUseMockData()`.
- **Si tocas el esquema SQL, actualiza `database.types.ts` en el mismo commit.**
  Es lo único que evita que un `select` con una columna mal escrita llegue a
  producción.
- **Verifica antes de afirmar.** Este proyecto ya tuvo una fuente de contexto que
  describía Angular 17, Tailwind y una API REST completa — nada de eso existía.
  Si vas a documentar algo, léelo en el código primero.
- **No borres assets del usuario** (fuentes, imágenes, videos) sin preguntar. Son
  decisiones de diseño, no basura. Repórtalos y deja que Xaviel decida.
- **Un cambio, un propósito.** No mezcles un fix con un refactor.
- **Español en la UI, inglés en el código.** Ver `docs/CONVENTIONS.md`.

### Antes de decir que terminaste

```bash
npm run build   # sin warnings ni errores
npm test        # 140 archivos, 1499 pruebas, todo verde (cifra al 25/10/2026)
```

Si algo falla, dilo con la salida real. No reportes éxito parcial como éxito.

---

## Trampas conocidas de este repo

Cosas que ya causaron un bug. No las repitas:

- **Fotos como PNG.** Un JPEG de 350 KB se guardó como PNG de 12.5 MB. PNG solo
  para imágenes que de verdad usan transparencia. Borde largo máximo 1600px.
  Ver `brand/README.md`.
- **Rutas de assets.** Usa siempre la forma relativa a la base (`assets/imgs/x.jpg`),
  nunca `/assets/...` ni `../../../assets/...`. Las otras dos se rompen si la app
  se sirve desde un sub-path.
- **`@font-face` sin verificar el archivo.** `--font-body` (Manrope, usado 59
  veces) apuntaba a una carpeta equivocada y todo el sitio caía al sans-serif del
  sistema sin que nadie lo notara. Si tocas fuentes, confirma que el archivo existe.
- **Una fuente puede descargar bien y aun así no servir.** ROLNER respondía 200
  con sus 19 KB completos, pero Chrome rechazaba el archivo y el navbar llevaba
  meses en Trebuchet MS. Un 200 no prueba nada: revisa
  `[...document.fonts].map(f => f.family + ':' + f.status)` y exige `loaded`,
  no `error`.
- **El descuento de un cupón lo calcula Postgres y el frontend lo espeja.** `coupon_check()` (SQL)
  y `coupon-rules.ts` (modo simulado y formulario del panel) son la misma regla con los mismos
  mensajes: si cambias una, cambia la otra y las pruebas de `verify-migrations.sh`. El navegador
  manda solo el código, nunca un monto. La tabla `coupons` no la lee `anon` (si no, cualquiera
  descargaría los códigos), y los usos se cuentan de los pedidos no cancelados, no en un contador.
- **El stock de un producto con opciones es derivado, y se descuenta en tres sitios.** `product_variants_sync`
  deja `hub_parts.stock` como la suma de las opciones activas (y `has_variants`); no lo escribas a mano
  ni lo mandes desde un formulario como si fuera libre. Lo que se descuenta o se devuelve de una
  opción lo hacen `create_order()` y `set_order_status()` (y el modo simulado de `OrderService`): si
  cambias uno, cambia los tres. Una opción con pedidos no se borra (`restrict`), se apaga; y
  `saveVariants()` no borra y reinserta (los pedidos apuntan a la opción): compara con lo que había al
  abrir el formulario y solo toca lo que cambió, para no pisar el stock de una compra reciente.
- **Cambiar la firma de `create_order()` obliga a retirar la anterior**, o PostgREST responde
  `PGRST203`. Si el parámetro nuevo va al final con valor por defecto, el frontend viejo sigue
  funcionando contra la función nueva: se migra primero y se despliega después (lo contrario que
  al quitar una columna).
- **Un trigger BEFORE por fila que devuelve `new` en un DELETE cancela el borrado, sin
  error.** En un DELETE `new` es nulo, y devolver nulo en un BEFORE salta la operación. El
  guard de `site_settings` (0014) lo hacía y ningún DELETE sobre esa tabla funcionaba, ni el
  de una migración; se vio con `verify-migrations.sh` y lo arregló la 0021. Si un trigger
  cubre `delete`, devuelve `old` en ese caso.
- **Para quitar una columna que el frontend lee o escribe, el frontend va primero.** Con la
  columna ya borrada, los `select` que la piden y los `insert`/`update` que la mandan
  fallan hasta que se despliega el cambio. Se despliega el frontend sin la columna (que
  funciona con ella o sin ella) y después se migra. Y antes de borrar, comprobar contra la
  base real que nada pierde su única copia del dato (la 0021 lo hace con un `raise
  exception` previo). Una función con columnas de salida explícitas, como
  `search_products()`, hay que borrarla y crearla de nuevo.
- **La clave privada VAPID no va en el repositorio, nunca.** La pública está en `environment.vapidPublicKey`; la
  privada es solo un secreto de la Edge Function `send-push`. Si se pierde o se cambia, toca generar otro par y
  volver a activar los avisos en cada dispositivo (una suscripción solo sirve con la clave con la que se creó).
  Los avisos los pide la **base** (trigger `notify_status_change()`, 0028) cuando cambia el `status` de un pedido o una
  cita con dueño, con `pg_net` y tres secretos del Vault (`send_push_url`, `send_push_anon_key`, `send_push_secret`); sin
  ellos no avisa y **tampoco falla** el cambio de estado. `send-push` acepta ese secreto (`PUSH_WEBHOOK_SECRET`, el mismo
  valor, en la cabecera `x-push-secret`) o a un admin con su sesión. **El panel ya no llama a `send-push`**: si alguien
  lo vuelve a poner, cada cambio avisará dos veces. Y `send-push` recibe solo un id: el texto sale de la base, no de quien
  llama. Las funciones de `supabase/functions` no se compilan con la app ni se prueban con `ng test`; por eso existen los
  dos scripts de arriba.
- **Las estrellas de un producto no prueban que haya reseñas.** `hub_parts.stars_rating`
  es el dato sembrado hasta que entra la primera reseña real (entonces es el promedio), y
  `ProductModel.starsRating` no distingue una cosa de la otra. Para "¿hay opiniones de
  verdad?" —el JSON-LD `aggregateRating`, por ejemplo— usa `ReviewService.getStats()`
  (`review_stats()`). Declarar una calificación que no existe va contra las reglas de Google.
- **`is_verified_purchase` nunca viene del navegador.** Lo calcula el trigger
  `reviews_prepare()` (migración 0020) y pisa lo que se mande; las reseñas no tienen UPDATE
  (se borran y se reescriben) justo para no tener que congelar esa columna. No agregues un
  `update` sobre `reviews`.
- **`search_products()` devuelve columnas explícitas.** Una columna nueva en `hub_parts` no
  llega a `ProductModel` por ahí: hay que recrear la función (no sirve `create or replace`
  con otras columnas de salida). Por eso `review_count` existe en la tabla pero no en el
  modelo.
- **El prerenderizado vive en su propia configuración (`prerender`), no en `production`.** Si `server`/`outputMode` se meten
  en `production`, `ng test` los hereda y las pruebas dejan de arrancar ("PlatformLocation needs to be compiled using the JIT
  compiler"). `npm run build` ya usa `--configuration production,prerender`; un `ng build` pelado no prerenderiza.
- **Una página prerenderizada puede quedar congelada en "Cargando…" y publicarse así.** La app no usa zone.js, así que Angular
  solo espera lo que se registre como tarea pendiente: el `fetch` de `SupabaseService` lo hace, y en el servidor además lee el
  cuerpo y suelta la tarea un instante después (`SERVER_SETTLE_MS`), porque una consulta suele disparar la siguiente.
  `scripts/verify-prerender.mjs` (`postbuild`) falla el build si pasa. Cualquier otra fuente de datos asíncrona que no pase por
  Supabase (otro `fetch`, un temporizador) tendría que registrar su tarea con `PendingTasks`.
- **El cliente de Supabase pide un `WebSocket` al crearse**, aunque nadie use Realtime, y Node 20 no lo trae: sin el
  `NoWebSocket` de `supabase.service.ts` el prerenderizado revienta. No importes `@angular/common` en ese archivo: casi todo el
  proyecto lo carga primero y rompe el arranque de las pruebas.
- **No pongas `provideClientHydration` ni `withEventReplay`.** Sin `TransferState` los datos no coinciden en el primer pintado y
  el replay de eventos mete un `<script>` en línea que la CSP (`script-src 'self'`) bloquea. La continuidad visual la da
  `prerender-snapshot.ts`.
- **La republicación del sitio vive en la base (0026), y se apaga o se rompe sin ruido.** `mark_site_dirty()` anota los
  cambios del catálogo, `fire_site_rebuild()` (pg_cron cada 5 minutos) llama al deploy hook de Vercel guardado en el Vault como
  `vercel_deploy_hook`. Si el secreto falta, no falla: responde `sin enlace…` y deja todo anotado. Una columna de `hub_parts`
  que cambie con cada compra tiene que ir en la lista que ignora el trigger, o cada venta lanzará un build. La URL del hook
  nunca va en el repositorio.
- **La línea "cómo terminó el despliegue" de la barra de `/admin` sale de Vercel, con un token que no está en el repo.** La Edge
  Function `build-status` (solo admin, con su JWT) lee el último despliegue de producción con `VERCEL_TOKEN`,
  `VERCEL_PROJECT_ID` y `VERCEL_TEAM_ID`, secretos de la función. Sin ellos responde `configured: false` y la barra simplemente
  no dice nada del despliegue: no es un error. `getBuild()` nunca falla. Mientras un despliegue se construye, la barra vuelve a
  preguntar cada 10 s (hasta 6 min tras "Publicar ahora", 10 si ya venía en marcha) y para al cerrar el panel.
- **Las fichas de Auto Hub y de Hub Market se prerenderizan, y salen de la base en cada build.** Una por vehículo disponible
  (`/auto-hub-details/:id`) y una por publicación **aprobada** (`/car-details/:id`, `/hub-market-part-details/:id`,
  `/accessory-details/:id`, según su categoría). Un cambio en `auto_hub_vehicles` o `hub_market_items` pide un despliegue como
  los de la tienda (0029). Una ficha de prueba no se anuncia: `autoHubSeo()`/`hubMarketSeo()` (`community-seo.ts`) no se llaman con
  `isTest` y la página queda como "no encontrado". Cada ficha lleva su JSON-LD (`autoHubJsonLd()`/`hubMarketJsonLd()`, `structured-data.ts`), sin teléfono ni nombre de vendedor. `verify-prerender.mjs` falla el build si una ficha quedó con el título de la ruta
  ("Detalle de…"), con "no encontrado" o con otra URL canónica. **Si agregas una ruta de ficha nueva**, súmala a
  `app.routes.server.ts`, a `sitemap-lib.mjs` y a `verify-prerender.mjs`, o no se prerenderiza.
- **Una publicación de Hub Market vendida o vencida sale de los listados, del sitemap y del HTML, pero su ficha sigue abierta.**
  `sold_at` y `expires_at` (0030) las escriben solo `mark_publication_sold()` y `renew_publication()`, con el reloj de la base: un
  trigger las congela en cualquier update normal y en el insert (si no, el dueño podría darse plazo hasta 2099). El filtro vive en las
  consultas (`.is('sold_at', null).gt('expires_at', ahora)` en `HubMarketService`, y en `generate-sitemap.mjs`), **no en RLS**: la ficha
  tiene que seguir respondiendo para quien guardó el enlace (`app-publication-notice`). Vencer no escribe nada: lo único que lo avisa
  al HTML es el cron `expire-publications` (`mark_expired_publications()`, una vez al día). **El build prerenderizado pide esas
  columnas: la 0030 se aplica ANTES de desplegar**, o `npm run build` falla en las tres fichas de Hub Market.
- **El aviso de "tu publicación vence" lo pide la base, y `send-push` va ANTES que la migración.** `warn_expiring_publications()` (0031, cron
  diario 13:00 UTC) le pide a `send-push` `{ kind: 'listing', id }` (el id es un **entero**, no un uuid) por cada publicación a siete días de
  vencer, y deja anotado en `publication_expiry_notices` para qué `expires_at` ya avisó (una tabla aparte: una columna en
  `hub_market_items` dispararía `mark_site_dirty()` y un despliegue por aviso). Con la migración puesta y la función vieja, `send-push`
  respondería 400 y cada publicación quedaría marcada como avisada sin que nadie recibiera nada. `send-push` vuelve a comprobar que la
  publicación esté por vencer: el secreto no sirve para escribirle a un vendedor por otra cosa.
- **El aviso de "falló el despliegue" lo pide la base cada 10 minutos, y quien mira Vercel es `send-push`.** `check_deploy_failures()` (0032) solo hace de
  reloj: manda `{ kind: 'deploy' }` y nada más. `send-push` lee el último despliegue de producción con `VERCEL_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`
  (los secretos de `build-status`, compartidos por todo el proyecto) y, solo si terminó en `ERROR` y no está en `deploy_alerts`, avisa a los dispositivos de los admins (`profiles.role = 'admin'`). Lo anota en `deploy_alerts`
  **cuando ya sabe que hay a quién avisar** (justo antes de mandar, para no duplicar) y **lo deshace si el aviso no llegó a ningún dispositivo**, para que el siguiente sondeo
  lo reintente; esa tabla **no se limpia por edad** (0037), porque es lo que evita repetir el aviso de un fallo que sigue siendo el último. Si hay un despliegue posterior que salió bien, no avisa. Sin esos
  secretos no pregunta ni avisa, sin error. `deploy_alerts` no la lee nadie del navegador; `send-push` entra con `service_role` (que se salta RLS).
- **Un `endpoint` de push tiene que ser de un servicio conocido, y se valida DOS veces.** `is_push_endpoint()` (0037) lo exigen `register_push_subscription()`,
  `register_order_push()` y `register_appointment_push()`, y `send-push` lo vuelve a exigir antes de llamar (`PUSH_ENDPOINT`). Sin eso, quien tuviera el uuid de un pedido o
  una cita de invitado (o cualquier cuenta) podía registrar `https://servidor-ajeno/…` y hacer que la función le mandara un POST con un JWT VAPID firmado. La lista es corta a
  propósito (FCM, Mozilla, Apple, Windows): **si un navegador nuevo usa otro dominio, hay que sumarlo en los dos sitios y en `verify-send-push.mjs`**. No es un `check` de la
  tabla, para no romper las filas que ya hay. Los tests de los scripts usan `https://fcm.googleapis.com/fcm/send/…`, no `push.example`.
- **Lo que pide la base por `pg_net` es "a lo sumo una vez", y se sabe.** `net.http_post()` es asíncrono: devuelve un id al instante y la llamada real corre después. Los
  avisos que anotan "ya avisé" (`publication_expiry_notices`, `appointment_reminders`, `deploy_alerts` salvo el reintento de arriba) lo hacen al encolar, no al confirmar: si
  `send-push` responde 5xx o está desplegándose justo entonces, ese aviso se pierde y no se reintenta. Es un aviso y no un cobro; si algún día importara, hay que leer
  `net._http_response` en la corrida siguiente. Lo mismo `guestState()`: lo recuerda `localStorage` y no la base, así que si se borran los datos del sitio la tarjeta dice "apagado"
  aunque el dispositivo siga registrado (volver a activar lo re-registra sin duplicar).
- **Vender y renovar una publicación solo sirve si está aprobada** (0037): una pendiente o rechazada no se puede mover de fecha ni por su dueño ni por moderación; el estado manda.
  Una ficha de Hub Market vendida o vencida sigue abierta pero lleva `noindex` (`SeoPage.noindex`), y la ficha de un vehículo de Auto Hub que ya no está disponible dice "no encontrado".
  **`verify-prerender.mjs` no exige tarjetas** en `/auto-hub` ni en `/hub-market` si el sitemap no trae nada: todo vendido o vencido es un estado válido, no un fallo de build.
- **`[priority]` de `NgOptimizedImage` no puede cambiar después de pintarse (NG02953).** Una lista que se filtra u ordena no puede pasar `[priority]="first"`: la tarjeta que pasa a
  ser la primera cambia el input y, en desarrollo y en pruebas, revienta. `/auto-hub` fija el id de la tarjeta prioritaria **una vez**, al llegar los datos (`priorityId`). Con `track`
  por id la instancia se reutiliza, así que el input de cada tarjeta tiene que ser estable. Los filtros de `/auto-hub` viven también en la URL (`?tipo=suv&precio=900000`), con
  valores validados al leerlos (`autoHubFiltersFromParams`); solo se escribe en el navegador, nunca al prerenderizar.
- **Los favoritos son de una cuenta, y sin cuenta no hay (0038).** `favorites (user_id, part_id)` tiene RLS `auth.uid() = user_id` en select, insert y delete, **sin UPDATE**
  y sin acceso para `anon`; borrar un producto se lleva sus favoritos, y un trigger limita a 200 por persona con un `22023`. `FavoriteService` lee los ids una vez al iniciar sesión,
  actualiza al instante al tocar el corazón y **deshace el cambio si la base lo rechaza**; sin sesión `toggle()` solo avisa. En modo simulado viven en memoria. `app-favorite-button`
  va dentro de `app-catalogo-card` y de la ficha: hace `preventDefault` y `stopPropagation` para no abrir el enlace de la tarjeta. Es solo productos de la tienda, no vehículos.
- **El recordatorio de una cita lo pide la base cada hora, y `send-push` va ANTES que la migración.** `send_appointment_reminders()` (0036, cron al minuto 5) manda
  `{ kind: 'appointment_reminder', id }` por cada cita **confirmada** a entre 2 y 24 horas, de una cuenta con algún dispositivo o de un invitado con dispositivos de la cita
  (0035), y anota en `appointment_reminders` **para qué hora** ya recordó (reprogramar la habilita otra vez). `send-push` vuelve a comprobar estado y ventana (margen de 25 h por
  el cron horario): no se le escribe a nadie por una cita lejana, pasada o sin confirmar. Con la migración y la función vieja, `send-push` respondería 400 y cada cita quedaría
  marcada sin avisar. Sin secretos del Vault no recuerda ni marca.
- **Los avisos de un invitado son del pedido o de la cita, no de una cuenta, y la llave es el uuid.** `order_push_subscriptions` (0034) y
  `appointment_push_subscriptions` (0035) atan un dispositivo a **un pedido** o a **una cita**; `register_order_push()` y `register_appointment_push()` solo aceptan los
  **sin dueño** y **en marcha** (un pedido no entregado ni cancelado; una cita que no esté hecha, cancelada ni en `no_show`), hasta 3 dispositivos, y el uuid es toda la
  autorización (lo mismo que ya basta para ver `/pedido/:id`; el de la cita es el que recibe quien acaba de agendar). El navegador tiene **una** suscripción por dispositivo
  que puede servir a varios pedidos, citas y a una cuenta: por eso `PushService.guestState()` exige además que ese pedido o cita esté anotado en `localStorage`
  (`xah.orderPush` / `xah.appointmentPush`) y `disableForGuest()` **no** desuscribe el navegador. `notify_status_change()` avisa de un pedido o una cita sin dueño solo si
  tiene dispositivos. La tarjeta es `app-guest-avisos` (`kind`: `order` o `appointment`), en `/pedido/:id` y en la confirmación de `/agendar`.
  `send-push` borra los dispositivos de un pedido o cita al avisar un estado final. Los tres rechazos de la base usan el código `22023`: es el único que `translateDbError`
  deja pasar con su mensaje. `send-push` va **antes** que la migración.
- **Las fotos de una opción son una lista (`image_urls`), y `image_url` es su espejo.** `product_variants.image_urls` (0033) es la verdad; `image_url` queda como la primera
  para el frontend anterior y para el carrito (`variant.imageUrl` es la portada), y lo mantiene el trigger `product_variants_photos_sync`: **no escribas `image_url`
  desde el panel**, manda la lista. La ficha decide qué enseñar con `variantGallery()`: con **2 o más** fotos propias la galería es solo de la opción; con **una** se
  queda con todas y salta a esa (el comportamiento de la 0025); sin fotos, todas. Siguen siendo fotos **del producto** (`hub_parts.images`): una foto que el producto
  ya no tiene se descarta al mostrar. Máximo 8 por opción (un check, y `PHOTOS_MAX`). **La migración va antes que el frontend.**
- **El sitemap se genera en el `prebuild`** (`scripts/generate-sitemap.mjs` →
  `public/sitemap.xml`, ignorado por git) y lee Supabase en cada build. `vercel.json` fija
  `buildCommand: npm run build` para que también corra en Vercel; si alguien lo quita y
  Vercel vuelve a `ng build`, el sitemap desaparece sin avisar. Un producto `is_test` nunca
  entra.
- **El service worker no se prueba en `npm start`.** Solo existe en el build de producción
  (`!isDevMode()`). Para verlo: `npm run build` y servir `dist/x-autohub/browser` con
  fallback a `index.html`. Y el "offline" de DevTools/CDP corta la página pero **no al
  worker**, que sigue pidiendo los datos por su cuenta: una lista "sin red" que igual carga
  no es un bug de la app. Para ver el estado "Sin conexión" bloquea `*supabase.co*` con el
  service worker desactivado.
- **`ngsw.json` y `ngsw-worker.js` no pueden cachearse.** `vercel.json` les pone
  `no-cache`; si alguien lo quita, el navegador sirve el worker viejo y los usuarios se
  quedan en la versión anterior sin enterarse. Cada despliegue cambia los hashes de
  `ngsw.json`: es lo que dispara el aviso "Hay una versión nueva".
- **Los paquetes de Angular se instalan con la misma versión que `@angular/core`** (hoy 21.2.20), con
  `--legacy-peer-deps` si hace falta. `@angular/platform-server` sin fijar se resolvió a la última (21.2.25), que exige
  `core` 21.2.25: el árbol quedó inválido y `npm ci` (el de Vercel) habría fallado. Y `@angular/ssr` tiene que ser
  `>= 21.2.21` porque `@angular/build` lo pide como peer. Comprueba siempre con `npm ci --dry-run --ignore-scripts`.
- **`npm install` en Windows le quita los campos `libc` a `package-lock.json`**, y eso
  puede cambiar qué binarios nativos baja Linux (Vercel). Al agregar una dependencia, revisa
  `git diff package-lock.json`: tiene que mostrar solo el paquete nuevo.
- **Licencia de fuentes: está dentro del archivo.** La tabla `name` (IDs 7, 13,
  14) trae el copyright y la licencia aunque no haya ningún `.txt` al lado. Así
  se descubrió que Batman era `Shareware` y ROLNER `All Rights Reserved`. Ver
  `docs/CONVENTIONS.md`.
- **Los guards no pueden leer la sesión de forma sincrónica.** Con Supabase la
  restauración es asíncrona: en la primera carga `isLoggedIn()` es `false`
  aunque haya sesión. Un F5 sobre `/publicar` rebotaba a `/login` mientras el
  navbar ya mostraba al usuario. Los guards esperan `auth.whenReady()`. Con
  mocks no se ve, porque ahí la sesión se lee en el constructor.
- **`select('*')` sobre `profiles` falla.** La migración 0006 le quitó `email` y
  `phone` a las claves anon y authenticated (cualquiera podía descargar los
  correos de todos). Pide las columnas públicas, y para un `update` no devuelvas
  la fila completa. Ver `docs/BACKEND.md`.
- **RLS no filtra por columna.** Que la política diga "solo tu propia fila" no
  impide que esa fila traiga `is_admin = true`: así se pudo escalar a admin y
  cambiar el precio del catálogo. Para proteger columnas hacen falta permisos de
  columna o un trigger (migración 0005).
- **Las pruebas no ven a Supabase.** `provideHttpClientTesting` no lo intercepta
  (usa fetch), así que en cuanto `environment.ts` tuvo credenciales reales seis
  pruebas empezaron a pegarle a la base en vivo. `src/test-providers.ts` inyecta
  `TestSupabaseService` para forzar el modo mock; no lo quites.
- **`LOCALE_ID` es `es-DO`.** Los pipes `date` y `number` ya formatean en español
  dominicano. No pongas `toLocaleString('en-US')` a mano.
- **Precios siempre `RD$`** con `| number:'1.0-0'`. Nunca `$` solo.
- **`AbstractControl.setValue(value, options)` tipa `options` como `Object`**, así
  que un typo como `emiEvent` compila sin error. Revisa esos nombres a mano.
- **Para ver cómo queda en un teléfono, emula el dispositivo; no cambies el tamaño de la ventana.** Un navegador de escritorio (y un headless con `--window-size`) no baja de ~500px, y
  la página parece "cortada" sin estarlo. `node scripts/mobile-shot.mjs <url> 390 900 salida.png` emula un móvil por CDP (necesita Edge) y imprime `sw`/`cw`: si `sw` > `cw`, la página
  desborda a lo ancho. Así se vio que `/auto-hub` medía 706px en un teléfono de 390 por una foto de 500px fijos.
- **Grids fijos.** `repeat(4, 1fr)` sin media query deja tarjetas de 70px en un
  teléfono. Usa `repeat(auto-fit, minmax(Xpx, 1fr))`.
- **Especificaciones generadas por el CLI.** Los providers globales de prueba
  viven en `src/test-providers.ts`; no repitas `provideRouter`/`provideHttpClient`
  en cada spec. Si un componente tiene un `@Input` requerido, el spec debe usar
  `fixture.componentRef.setInput(...)`.
- **Una `interface` no satisface `Record<string, unknown>`** (no tiene índice
  implícito). Por eso los tipos de fila en `database.types.ts` son `type` y no
  `interface`: con `interface`, supabase-js resuelve todos los Insert a `never`.
- **La clave `service_role` de Supabase no va en el frontend**, nunca. Se salta
  todas las políticas RLS. Solo la `anon`.
- **Supabase no pasa por `HttpClient`** (usa fetch por dentro), así que los
  interceptores de Angular no lo ven. Sus errores se traducen en
  `core/supabase/supabase-error.ts`.
- **`revoke all ... from public` no le quita el permiso a `anon`.** Es el idiom
  que usan 0009, 0011 y 0012 para cerrar sus funciones `security definer`, y no
  cierra nada: en Supabase las funciones nuevas del esquema `public` nacen con un
  grant **directo** a `anon` y `authenticated` por los default privileges de la
  plataforma, y revocarle al pseudo-rol PUBLIC no toca esos grants. Se leyó
  `proacl` en la base en vivo: `anon` podía invocar `set_user_role()`. No era
  explotable porque las funciones comprueban el rol dentro, pero el idiom
  completo son **tres** líneas (`revoke all from public`, `revoke execute from
  anon`, `grant execute to authenticated`). Migración 0015.
- **Un trigger de congelado copiado de 0011 se bloquea a sí mismo.** Esas
  migraciones comparan `auth.role() <> 'service_role'`, y en una sesión SQL
  directa (una migración, el editor del dashboard, la Management API) no hay JWT:
  `auth.role()` es `null`, la condición se cumple y el trigger lanza. Si la
  migración inserta su propia fila semilla, **no se puede volver a ejecutar**,
  porque un `BEFORE INSERT` se dispara antes de que el `on conflict do nothing`
  resuelva el conflicto. Bloquea `anon` y `authenticated` por nombre, no "todo lo
  que no sea service_role".
- **Los grants por columna de 0006 restringen el SELECT, no el UPDATE.** El
  `revoke select` + `grant select (columnas)` sí funciona: `email` y `phone` no
  se pueden leer con las claves del navegador. Pero el UPDATE nunca se revocó, y
  los default privileges dan UPDATE sobre **todas** las columnas, `role`
  incluida. Lo que impide la escalada son las otras dos capas: la política de
  update (con `using` **y** `with check` en `auth.uid() = id`, que además impide
  cambiarse el propio id) y el trigger de congelado. O sea que el trigger no es
  el cinturón de seguridad: es el freno. Está todo comprobado en
  `scripts/verify-migrations.sh`.
- **Dos claves foráneas a la misma tabla rompen el embed de PostgREST.** La
  migración 0012 agregó `hub_market_items.reviewed_by → profiles`, y como
  `seller_id` ya apuntaba ahí, `select('*, profiles(display_name)')` pasó a
  responder `PGRST201` y **Hub Market se quedó vacío en producción**. Se nombra
  la clave: `profiles!hub_market_items_seller_id_fkey(display_name)`. No lo ve
  ningún modo de desarrollo —con mocks no hay PostgREST, y corriendo el SQL a
  mano tampoco, porque la ambigüedad la resuelve PostgREST y no Postgres— así
  que si agregas una columna que referencie una tabla ya referenciada, revisa
  todos los `select` con embed de esa tabla.
- **El texto de un `select` de supabase-js tiene que ser una sola cadena
  literal.** El tipo de la fila sale de leer ese texto; si lo armas con `'a, ' +
  'b'` (para que no quede una línea de 300 caracteres) TypeScript lo ensancha a
  `string` y cada fila pasa a ser `GenericStringError`, con un error por cada
  propiedad que uses. Una constante con la cadena entera en una línea, y un
  comentario que lo explique.
- **Una columna generada o un índice exigen funciones `IMMUTABLE`, y
  `unaccent()` es `STABLE`.** Para buscar sin acentos en un índice hay que
  envolverla (`xah_unaccent()`, migración 0017). Y la extensión va en el esquema
  `extensions`, no en `public`, donde PostgREST la expondría como rpc.
- **El seed no actualiza lo que ya existe** (`on conflict (id) do nothing`):
  regenerarlo cambia lo que recibe una base nueva, no una que ya tiene filas. Para
  la real, los datos nuevos se cargan por el panel o con un `update` explícito. Y
  una migración que agrega columnas `not null` a una tabla con datos se prueba
  **con datos**: `verify-migrations.sh` tiene una segunda base para eso, porque el
  recorrido "desde cero + seed" migra con la tabla vacía y nunca ejercita el
  backfill.

---

## Documentos

| Archivo                  | Para qué                                                        |
| ------------------------ | --------------------------------------------------------------- |
| `docs/PIVOT-2026-10.md`  | **El plan vigente del producto**: decisiones, modelo de datos, fases y prompts |
| `docs/VISION.md`         | Qué es el producto, para quién, y el tono de la marca            |
| `docs/ARCHITECTURE.md`   | Estructura de carpetas, flujo de datos, dónde va cada archivo    |
| `docs/CONVENTIONS.md`    | Convenciones de TS, plantillas, SCSS, nombres, imágenes          |
| `docs/BACKEND.md`        | Supabase: puesta en marcha, esquema, RLS, tareas frecuentes      |
| `docs/ROADMAP.md`        | Trabajo pendiente, priorizado, con el por qué de cada punto      |
| `docs/AUDIT-2026-08-11.md` | Auditoría completa: qué se encontró, qué se arregló, qué queda |
| `brand/README.md`        | Assets originales de marca y cómo regenerar los favicons         |
