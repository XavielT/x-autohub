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
   función nueva, `patch` para un arreglo. Sigue en `0.x` hasta que el dominio
   apunte a Vercel y el sitio esté de verdad en vivo.
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
- **Una fuente puede descargar bien y aun así no servir.** ROLNER respondía 200
  con sus 19 KB completos, pero Chrome rechazaba el archivo y el navbar llevaba
  meses en Trebuchet MS. Un 200 no prueba nada: revisa
  `[...document.fonts].map(f => f.family + ':' + f.status)` y exige `loaded`,
  no `error`.
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
