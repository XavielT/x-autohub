# X AutoHub

**El hub central de los autos en RD.** Plataforma web para la comunidad automotriz
dominicana: compra y venta de vehículos, catálogo de piezas, servicios de taller y
comunidad.

🔗 **En vivo: [xautohubrd.com](https://xautohubrd.com)** · v1.0.0

Angular 21 · TypeScript 5.9 · SCSS · Supabase · Vitest

## Empezar

```bash
npm install
npm start          # http://localhost:4200
```

Arranca con datos de ejemplo, sin necesidad de backend. Para conectar la base de
datos real, sigue [`docs/BACKEND.md`](docs/BACKEND.md).

## Comandos

| Comando         | Qué hace                                     |
| --------------- | -------------------------------------------- |
| `npm start`     | Servidor de desarrollo con recarga automática |
| `npm run build` | Build de producción a `dist/`                 |
| `npm test`      | Pruebas unitarias con Vitest                  |
| `npm run watch` | Build en modo watch (configuración dev)       |

El build de producción debe terminar **sin warnings**.

## Los cinco pilares

Auto Hub y Hub Market están separados **a propósito**: uno es el inventario de la
empresa y el otro el de la comunidad. Comparten código, no contenido.

| Ruta          | Qué es                                                       | Inventario de |
| ------------- | ------------------------------------------------------------ | ------------- |
| `/auto-hub`   | Vehículos oficiales de X AutoHub, verificados por el equipo   | La empresa    |
| `/hub-market` | Clasificados publicados por usuarios                          | La comunidad  |
| `/catalogo`   | Tienda propia de piezas, con carrito y checkout               | La empresa    |
| `/servicios`  | Taller: mantenimiento, reparación, diagnóstico                | La empresa    |
| `/social-hub` | Feed, clubes y eventos                                        | La comunidad  |

## Rutas

| Ruta                              | Qué es                                    |
| --------------------------------- | ----------------------------------------- |
| `/`                               | Home: hero, destacados, catálogo, noticias |
| `/car-details/:id` · `/hub-market-part-details/:id` · `/accessory-details/:id` | Detalle de una publicación |
| `/auto-hub-details/:id` · `/hub-part-details/:id` | Detalle de un vehículo oficial o una pieza |
| `/news/:id`                       | Noticia completa                          |
| `/checkout`                       | Compra del catálogo (también sin cuenta)  |
| `/publicar`                       | Publicar en Hub Market · requiere sesión   |
| `/perfil`                         | Tus datos, tus publicaciones y tu actividad · requiere sesión |
| `/login` · `/registro`            | Sesión y alta de cuenta                   |
| `/admin/...`                      | Panel · ver abajo                         |

## Roles y permisos

Tres niveles, en `profiles.role`:

| Rol         | Puede                                                              |
| ----------- | ------------------------------------------------------------------ |
| `admin`     | Todo. Es **el único** que reparte roles.                            |
| `moderador` | Aprobar y rechazar publicaciones de Hub Market. Nada más.           |
| `user`      | El valor por defecto de cualquier cuenta nueva.                     |

El panel se reparte según eso:

| Ruta                | Quién entra   | Qué hace                                     |
| ------------------- | ------------- | -------------------------------------------- |
| `/admin/moderacion` | moderador+    | Cola de publicaciones que esperan revisión   |
| `/admin/inventario` | admin         | Catálogo, Auto Hub y noticias (alta y edición) |
| `/admin/pedidos`    | admin         | Pedidos del catálogo y su estado             |
| `/admin/usuarios`   | admin         | Cuentas, verificación, roles y usuarios de prueba |
| `/admin/versiones`  | admin         | Historial de versiones del sitio             |

> Los guards deciden qué se dibuja; **la seguridad está en la base**. RLS y las
> funciones del panel vuelven a comprobar el rol dentro de Postgres, así que
> quien fuerce una URL ve un error, no datos.

**El primer admin** de una base nueva se crea con
`node scripts/make-admin.mjs tu@correo.com` (necesita `.env.local` con la clave
`service_role`). A partir de ahí, los roles se reparten desde `/admin/usuarios`.

## Moderación de publicaciones

Lo que publica la comunidad **no se ve hasta que alguien lo aprueba**:

```
pendiente  →  recién publicada. Solo la ven su dueño y quien modera.
aprobado   →  visible en el sitio. Es lo único que sale en Hub Market.
rechazado  →  no se publica. Su dueño ve el motivo en /perfil.
```

Quien modera publica directo en `aprobado`. Al rechazar, el motivo es obligatorio
(mínimo 10 caracteres) **porque lo lee el vendedor**: un rechazo sin explicación
no le dice qué corregir.

## Artículos y usuarios de prueba

Sirve para meter contenido falso **en el sitio en vivo** —una pieza, un vehículo,
una publicación, una noticia— y probar el flujo completo sin que ningún visitante
se lo encuentre.

- Se marca desde `/admin/inventario` o desde la cola de moderación.
- Lo ven **solo** admin, moderadores y las cuentas marcadas como *usuario de
  prueba* (`/admin/usuarios`). Para el resto no existe: ni en listados, ni en
  destacados, ni por URL directa.
- Quien puede verlo, lo ve con un distintivo **PRUEBA**.
- Un usuario de prueba **sí puede comprar** una pieza de prueba: es justo para lo
  que existe.

Ser usuario de prueba **no es un rol**: quien lo tiene sigue siendo `user` y no
gana ningún permiso de escritura. Solo cambia lo que ve.

## Modo simulado

Sin credenciales de Supabase, la app usa datos de ejemplo y una sesión guardada en
el navegador. Todo funciona igual salvo que no hay backend, así que **los roles se
fingen por el correo con el que entras**:

| Correo        | Con qué entras          |
| ------------- | ----------------------- |
| `admin@…`     | admin                   |
| `mod@…`       | moderador               |
| `prueba@…`    | usuario de prueba       |
| cualquier otro | usuario normal          |

Se compara el handle completo, no un prefijo: `administracion@` **no** es admin.

Con credenciales configuradas, todo pasa a Postgres + Auth + Storage sin cambiar
una línea de los componentes: ningún componente sabe de dónde vienen los datos.

## Despliegue

`main` es lo que está en producción. **Todo push a `main` es una versión**: bump en
`package.json` y `package-lock.json`, tag anotado, entrada en la tabla `releases`
(que es lo que se ve en `/admin/versiones`) y `vercel --prod`. El detalle está en
[`CLAUDE.md`](CLAUDE.md).

## Documentación

Empieza por **[`CLAUDE.md`](CLAUDE.md)** si vas a escribir código aquí — incluye
las trampas conocidas de este repo, que son las que ya causaron un bug.

- [`docs/VISION.md`](docs/VISION.md) — qué es el producto y para quién
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — estructura y flujo de datos
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — convenciones de código
- [`docs/BACKEND.md`](docs/BACKEND.md) — Supabase: puesta en marcha, esquema y RLS
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — qué falta y en qué orden
- [`docs/AUDIT-2026-08-11.md`](docs/AUDIT-2026-08-11.md) — última auditoría
- [`brand/README.md`](brand/README.md) — assets de marca y favicons
