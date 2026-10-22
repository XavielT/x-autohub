# Visión del producto — X AutoHub

> Esta visión sigue el pivote de octubre de 2026. El plan completo, con las
> decisiones cerradas y las fases, está en `docs/PIVOT-2026-10.md` y manda sobre
> este documento donde se contradigan.

## La idea en una frase

**Todo lo que tu carro necesita, en un solo lugar: accesorios, piezas y taller,
en RD.**

X AutoHub es una tienda en línea de accesorios y piezas para vehículos en
República Dominicana, con taller propio. Los vehículos y la comunidad siguen
aquí, pero en segundo plano.

## El problema que resuelve

Comprar algo para el carro en RD hoy es preguntar de taller en taller por
WhatsApp: no sabes si la pieza le sirve a tu modelo, el precio cambia según a
quién le preguntes, no sabes cuánto cuesta con envío ni cuándo llega, y después
tienes que buscar quién te lo instale.

X AutoHub junta eso en un solo sitio: precio claro, compatibilidad declarada por
vehículo, disponibilidad dicha sin rodeos (hay en stock, llega bajo pedido, o
está agotado), envío nacional o retiro en el taller, e instalación si la quieres.

## Para quién

En este orden, que es el orden en que se diseña:

1. **El dueño de carro común.** Quiere una alfombra, un cargador, unas luces, un
   juego de bujías para su Corolla 2015, y quiere saber si le sirve, cuánto
   cuesta con envío a Santiago y cuándo le llega.
2. **El entusiasta.** Busca piezas específicas y performance. Valora la
   compatibilidad bien declarada y poder hablar con alguien que sabe.
3. **El cliente del taller.** Tiene un problema o un mantenimiento pendiente.
   Quiere cotizar rápido y agendar sin llamar.
4. **La comunidad (vendedores, clubes).** Sigue teniendo su espacio en Hub
   Market y Comunidad, pero no es por quien se diseña el home.

## Los pilares

| Pilar          | Ruta                       | Rol        | Qué es                                                                |
| -------------- | -------------------------- | ---------- | --------------------------------------------------------------------- |
| **Tienda**     | `/tienda`                  | Principal  | Accesorios y piezas de X AutoHub. Carrito, checkout, pedidos          |
| **Servicios**  | `/servicios`               | Soporte    | Taller: instalación, mantenimiento, mecánica ligera, eléctrico, A/C   |
| **Vehículos**  | `/auto-hub`, `/hub-market` | Secundario | Auto Hub (oficiales) y Hub Market (de la comunidad)                   |
| **Comunidad**  | `/social-hub`              | Secundario | Feed, clubes, eventos. Hereda el hero. No se desarrolla más por ahora |

### Tienda

El pilar principal. Inventario propio **y** artículos bajo pedido; accesorios
universales **y** piezas por modelo con compatibilidad. Se cobra por
transferencia con comprobante o cerrando el pedido por WhatsApp (sin pasarela de
tarjeta en esta ronda). Se entrega por envío nacional o retiro en el taller.

> **Hoy** la tienda es `/catalogo` (17 categorías de texto, carrito y checkout
> con precios calculados en Postgres). `/tienda` y todo lo de arriba llega por
> fases: ver `docs/ROADMAP.md`. `/catalogo` redirigirá a `/tienda`.

### Servicios

El taller: instalación de lo que se vende, mantenimiento, mecánica ligera,
electricidad, aire acondicionado y diagnóstico. **No** mecánica pesada (motor,
transmisión). Cotización por WhatsApp, agenda de citas en la web y galería de
trabajos realizados.

### Vehículos

Dos inventarios que **no se funden**, agrupados bajo un mismo menú:

- **Auto Hub** (`/auto-hub`): vehículos **de X AutoHub**, revisados por el
  equipo. Si está aquí, la casa responde por él.
- **Hub Market** (`/hub-market`): los clasificados de la **comunidad** (vehículos,
  piezas y accesorios que publican los usuarios desde `/publicar`). Cada tarjeta
  lleva la etiqueta **"De la comunidad"** para separarla de la tienda oficial.
  Aquí X AutoHub es la plataforma, no el vendedor.

> Auto Hub y Hub Market conviven a propósito. Son dos promesas distintas al
> usuario y no deben fundirse en una sola lista.

### Comunidad

Antes Social Hub; la ruta `/social-hub` no cambia. Feed de builds y preguntas,
directorio de clubes por enfoque y provincia, y calendario de eventos. Hereda el
hero cinematográfico que antes abría el home. Queda congelado: si alguien lo usa
sigue funcionando, pero no recibe trabajo nuevo.

## Tono y marca

- **Idioma:** español dominicano. Directo, sin corporativismo. "¿Qué le hace
  falta a tu carro?", no "Explore nuestro catálogo".
- **Paleta:** negro (`--main: #121212`) con ámbar (`--Hub: #ffb300`) y naranja
  (`--primary: #ff5f00`). Oscuro, alto contraste, energía de garaje nocturno.
- **Tipografía:** Space Grotesk para marca y títulos, Manrope para cuerpo y
  precios, ROLNER como acento de marca.
- **Referencia de experiencia:** Amazon, eBay, Mercado Libre. Buscador arriba,
  categorías a un toque, tarjetas con precio claro, carrito siempre visible,
  checkout de pocos pasos.

**Los colores, tipografías y tokens de `src/styles.scss` no cambian con el
pivote.** Cambia la estructura, no la identidad.

## Qué no es

- No es un concesionario con catálogo estático.
- No es una red social genérica con tema de carros.
- No es un marketplace internacional. Es **RD**: los precios son en `RD$`, las
  ubicaciones son provincias dominicanas, los teléfonos son 809.
- No es un taller de mecánica pesada: motor y transmisión quedan fuera.
- No cobra con tarjeta todavía. Transferencia o WhatsApp.

## Estado actual (2026-10-22, v1.3.7)

El sitio está en vivo en `xautohubrd.com` (Vercel, desde la v1.0.0), con
Supabase como backend (Postgres, Auth y Storage). Todo el contenido publicado es
de prueba.

Lo que funciona hoy: los cinco pilares anteriores al pivote (Auto Hub, Hub
Market, Catálogo, Servicios, Social Hub) con su página, registro e inicio de
sesión, publicación de clasificados con moderación, carrito persistente y
checkout de invitado o con cuenta (precios calculados en Postgres), perfil con
"mis publicaciones", y un panel de administración (moderación, versiones,
pedidos, inventario, usuarios, ajustes). Dieciséis migraciones aplicadas.

**El pivote todavía no existe en el código.** El navbar, el home y las rutas
siguen siendo los de los cinco pilares. Esta documentación se adelanta a
propósito para que cada fase tenga un destino escrito. Ver `docs/ROADMAP.md`
para el orden.
