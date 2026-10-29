# SEO — lo que hay que hacer fuera del código

El código ya hace su parte: prerenderizado (home, tienda, categorías, fichas, servicios, Auto Hub y
Hub Market), `SeoService` (título, descripción, `og:*` y canónico por página), JSON-LD, `robots.txt`
y `sitemap.xml` (se genera en cada build). Esto es lo que falta y no se puede hacer desde el
repositorio. En este orden:

1. **Verificar la propiedad en Google Search Console** (https://search.google.com/search-console),
   como propiedad de **dominio** de `xautohubrd.com`, con un registro **DNS TXT**. Xaviel administra
   el DNS: se agrega el TXT que Google da en el dominio raíz y se espera a que propague.
2. **Enviar el sitemap**: Search Console → Sitemaps → `https://xautohubrd.com/sitemap.xml`.
3. **Pedir indexación** de `/` y de `/tienda` (Inspección de URLs → "Solicitar indexación").
4. **Crear el Perfil de Negocio de Google** del taller (https://business.google.com), con la dirección
   de retiro que está en el panel (`/admin/ajustes`), el horario del taller y el teléfono/WhatsApp.
   Google manda un código postal o llamada para verificarlo.
5. **Poner el enlace del sitio en la bio de @xautohubrd** (Instagram) y en el Perfil de Negocio.
6. **A los 30 días**, revisar en Search Console → Indexación → **Páginas**: cuántas están
   indexadas, cuáles quedaron "Descubierta, actualmente sin indexar" y por qué.

## Nota honesta

Con prerenderizado, Google indexa bien las rutas estáticas y las fichas prerenderizadas (productos,
categorías, servicios, vehículos y publicaciones aprobadas). Lo dinámico —los resultados de
`/buscar`, los filtros de la tienda y de Auto Hub, el carrito, el perfil, `/pedido` y el panel— no se
indexa, y está bien que así sea: `robots.txt` bloquea `/admin`, `/perfil`, `/checkout` y `/pedido`.

Una ficha de Hub Market vendida o vencida sigue abierta para quien guardó el enlace, pero lleva
`noindex` y sale del sitemap. Un producto o vehículo de prueba nunca se anuncia.

## Estado del código (29/10/2026)

- `public/og-default.jpg` (1200×630, el logo de `brand/autohub-logo.png` sobre `#121212`) es la imagen de
  respaldo de `SeoService` y de `index.html`. Se generó con Pillow; si cambia el logo, hay que regenerarla.
- Cada página pública con contenido propio fija su título, descripción y URL canónica con `SeoService`:
  home (los de `index.html`), tienda, producto, servicios y servicio, `/cotizar`, `/agendar`, Auto Hub y Hub
  Market (listas y fichas), `/social-hub`, `/terminos-condiciones` y `/novedades`. Las rutas privadas
  (`/admin`, `/perfil`, `/checkout`, `/pedido`) no se anuncian: están en `robots.txt`.
- `/novedades` está en el sitemap pero se renderiza en el navegador, no prerenderizada.

## Pendiente de auditar

No se verificó en esta ronda y conviene revisarlo antes de pedir indexación:

- El JSON-LD (Organization, WebSite con SearchAction a `/buscar?q=`, Product, Service, Car,
  BreadcrumbList) contra el validador de schema.org, sobre el HTML de `dist/` tras un `npm run build`.
- Que `sitemap.xml` traiga `lastmod` real por URL (hoy lo genera `scripts/generate-sitemap.mjs`; no se revisó).
