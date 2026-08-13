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

## Qué es X AutoHub

Plataforma web para la comunidad automotriz de **República Dominicana**. No es un
concesionario ni una tienda: es el punto de encuentro donde alguien compra un
carro, encuentra la pieza que necesita, contrata un taller y sigue la escena.

El texto del hero lo resume: *"El hub central de los autos en RD"*.

La interfaz está **100% en español dominicano**. Ver `docs/VISION.md` para el
detalle del producto.

### Los cinco pilares (no los confundas)

| Pilar          | Ruta           | Qué es                                                                 | Inventario de     |
| -------------- | -------------- | ---------------------------------------------------------------------- | ----------------- |
| **Auto Hub**   | `/auto-hub`    | Vehículos **oficiales de X AutoHub**, verificados por el equipo         | La empresa        |
| **Hub Market** | `/hub-market`  | Clasificados **publicados por usuarios**: vehículos, piezas, accesorios | La comunidad      |
| **Catálogo**   | `/catalogo`    | Tienda **propia** de piezas, con carrito y checkout                     | La empresa        |
| **Servicios**  | `/servicios`   | Taller: mantenimiento, reparación, diagnóstico. Contacto por WhatsApp   | La empresa        |
| **Social Hub** | `/social-hub`  | Comunidad: feed, clubes y eventos                                      | La comunidad      |

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
npm run build                          # build de producción a dist/
npm test                               # Vitest, una corrida (sin watch)
npx ng test --watch=false              # lo mismo, explícito
npx tsc -p tsconfig.app.json --noEmit  # solo type-check, rápido
```

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
npm test        # 42 archivos, 62 pruebas, todo verde
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
- **`LOCALE_ID` es `es-DO`.** Los pipes `date` y `number` ya formatean en español
  dominicano. No pongas `toLocaleString('en-US')` a mano.
- **Precios siempre `RD$`** con `| number:'1.0-0'`. Nunca `$` solo.
- **`AbstractControl.setValue(value, options)` tipa `options` como `Object`**, así
  que un typo como `emiEvent` compila sin error. Revisa esos nombres a mano.
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

---

## Documentos

| Archivo                  | Para qué                                                        |
| ------------------------ | --------------------------------------------------------------- |
| `docs/VISION.md`         | Qué es el producto, para quién, y el tono de la marca            |
| `docs/ARCHITECTURE.md`   | Estructura de carpetas, flujo de datos, dónde va cada archivo    |
| `docs/CONVENTIONS.md`    | Convenciones de TS, plantillas, SCSS, nombres, imágenes          |
| `docs/BACKEND.md`        | Supabase: puesta en marcha, esquema, RLS, tareas frecuentes      |
| `docs/ROADMAP.md`        | Trabajo pendiente, priorizado, con el por qué de cada punto      |
| `docs/AUDIT-2026-08-11.md` | Auditoría completa: qué se encontró, qué se arregló, qué queda |
| `brand/README.md`        | Assets originales de marca y cómo regenerar los favicons         |
