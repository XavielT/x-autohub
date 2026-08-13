# X AutoHub

**El hub central de los autos en RD.** Plataforma web para la comunidad automotriz
dominicana: compra y venta de vehículos, catálogo de piezas, servicios de taller y
comunidad.

Angular 21 · TypeScript 5.9 · SCSS · Supabase · Vitest

## Empezar

```bash
npm install
npm start          # http://localhost:4200
```

Arranca con datos de ejemplo, sin necesidad de backend. Para conectar la base de
datos real, sigue [`docs/BACKEND.md`](docs/BACKEND.md) (15 minutos).

## Comandos

| Comando         | Qué hace                                     |
| --------------- | -------------------------------------------- |
| `npm start`     | Servidor de desarrollo con recarga automática |
| `npm run build` | Build de producción a `dist/`                 |
| `npm test`      | Pruebas unitarias con Vitest                  |
| `npm run watch` | Build en modo watch (configuración dev)       |

El build de producción debe terminar **sin warnings**.

## Secciones

| Ruta            | Qué es                                                    |
| --------------- | --------------------------------------------------------- |
| `/`             | Home: hero, vehículos destacados, catálogo, noticias      |
| `/auto-hub`     | Vehículos oficiales de X AutoHub, verificados             |
| `/hub-market`   | Clasificados publicados por la comunidad                  |
| `/catalogo`     | Tienda de piezas, con carrito y checkout                  |
| `/servicios`    | Servicios de taller                                       |
| `/social-hub`   | Feed de la comunidad, clubes y eventos                    |
| `/publicar`     | Publicar en Hub Market (requiere sesión)                  |
| `/login`        | Iniciar sesión · `/registro` para crear cuenta            |

> Sin credenciales de Supabase configuradas, la app usa datos de ejemplo y una
> sesión simulada guardada en el navegador. Con ellas, todo pasa a Postgres +
> Auth + Storage sin cambiar una línea de los componentes.

## Documentación

Empieza por **[`CLAUDE.md`](CLAUDE.md)** si vas a escribir código aquí.

- [`docs/VISION.md`](docs/VISION.md) — qué es el producto y para quién
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — estructura y flujo de datos
- [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — convenciones de código
- [`docs/BACKEND.md`](docs/BACKEND.md) — Supabase: puesta en marcha y esquema
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — qué falta y en qué orden
- [`docs/AUDIT-2026-08-11.md`](docs/AUDIT-2026-08-11.md) — última auditoría
- [`brand/README.md`](brand/README.md) — assets de marca y favicons
