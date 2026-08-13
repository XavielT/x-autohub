# Convenciones de código

Describe lo que el código **ya hace** (y en los casos marcados 🔸, hacia dónde va).
Cuando toques un archivo, sigue el estilo del archivo; cuando crees uno nuevo,
sigue esto.

---

## Idioma

| Dónde                                    | Idioma                          |
| ---------------------------------------- | ------------------------------- |
| Texto visible al usuario                 | **Español** (dominicano)        |
| Nombres de clases, métodos, variables    | **Inglés**                      |
| Nombres de rutas                         | Español (`/publicar`, `/registro`) |
| Comentarios y documentación              | **Español**                     |
| Mensajes de commit                       | Inglés                          |

Los nombres de dominio se quedan como se llaman en el producto, aunque sean
español: `AutoHubModel`, `ServiciosCard`, `PublicarComponent`, `hubPart`.

Sobre acentos: el código actual mezcla texto con y sin acentos (`Vehiculos` vs
`Vehículos`). 🔸 Lo nuevo se escribe **con acentos correctos** en el texto visible.

---

## TypeScript

### Inyección de dependencias — usa `inject()`

```ts
// ✅ Nuevo código
export class SocialHubComponent {
  private readonly socialHub = inject(SocialHubService);
  private readonly auth = inject(AuthService);
}

// ⚠️ Patrón viejo. Ya no queda en componentes ni servicios; no lo reintroduzcas.
constructor(private route: ActivatedRoute, private service: HubPartService) {}
```

### Estado — usa signals

```ts
export class MiServicio {
  private _items = signal<Item[]>([]);        // privado, mutable
  items = this._items.asReadonly();           // público, solo lectura
  total = computed(() => this._items().length); // derivado
}
```

En componentes, `signal()` para estado local y `toSignal()` para consumir un
Observable de un servicio:

```ts
readonly posts = toSignal(this.socialHub.getPosts(), { initialValue: [] });
```

### Servicios

- Siempre `@Injectable({ providedIn: 'root' })`.
- Devuelven **siempre** `Observable<T>`, incluso en modo mock. Así cambiar entre
  mock y Supabase no altera ninguna firma ni obliga a tocar componentes.
- El interruptor mock/Supabase vive **dentro** del servicio:

```ts
getPosts(): Observable<SocialPostModel[]> {
  if (this.supabase.shouldUseMockData()) {
    return of(SOCIAL_POSTS_MOCK);
  }
  return from(
    this.supabase.db.from('social_posts').select('*, profiles(display_name)'),
  ).pipe(map((res) => unwrap(res).map(toSocialPost)));
}
```

- `unwrap()` lanza con el mensaje ya traducido si Postgrest devolvió error.
- **Nunca mapees a mano en el servicio**: la traducción fila → modelo vive en
  `core/supabase/mappers.ts`, en un solo lugar.
- **Un componente jamás importa un `*.mock.ts`.**

### Tipos

- `strict` y `strictTemplates` están activos. No los apagues.
- Nada de `any`. Si no sabes el tipo, usa `unknown` y estrecha.
- Uniones de literales en vez de `string` sueltos:
  `'gasoline' | 'diesel' | 'glp' | 'electric'`.
- Ojo: `AbstractControl.setValue(value, options)` tipa `options` como `Object`, así
  que un typo (`emiEvent`) **compila sin error**. Revísalo a mano.

---

## Plantillas

### Control de flujo — `@if` / `@for`

```html
@for (post of posts(); track post.id) {
  <article>...</article>
} @empty {
  <div class="empty-state">No hay nada para mostrar</div>
}
```

No queda ni un `*ngIf` / `*ngFor` en el proyecto, y `CommonModule` se reemplazó
por imports puntuales (`DecimalPipe`, `SlicePipe`, `DatePipe`). Mantenlo así.

Siempre pon `track` en un `@for`. Para desempaquetar un signal opcional sin
repetir la llamada, usa el alias de `@if`:

```html
@if (car(); as car) {
  <h1>{{ car.title }}</h1>   <!-- car ya es el valor, no el signal -->
}
```

### Formato de datos — usa los pipes

`LOCALE_ID` es `es-DO`, así que los pipes ya formatean en español dominicano.

| Dato       | Forma correcta                                | ❌ No hagas                          |
| ---------- | --------------------------------------------- | ------------------------------------ |
| Precio     | `RD$ {{ item.price \| number:'1.0-0' }}`      | `${{ item.price }}`                  |
| Fecha      | `{{ post.date \| date: 'd MMMM y' }}`         | `{{ post.date }}`                    |
| Cantidad   | `{{ club.members \| number }}`                | `toLocaleString('en-US')`            |

**La moneda es siempre `RD$`**, nunca `$` solo. El sitio es dominicano.

### Imágenes

```html
<!-- ✅ relativa a la base: sobrevive un deploy en sub-path -->
<img src="assets/icons/star-icon.svg" alt="Calificación" />

<!-- ❌ se rompe si la app no está en la raíz del dominio -->
<img src="/assets/icons/star-icon.svg" />
<img src="../../../assets/icons/star-icon.svg" />
```

- `alt` descriptivo si la imagen aporta información.
- `alt="" aria-hidden="true"` si es puramente decorativa (iconos junto a texto).
- `loading="lazy"` en imágenes que no se ven al cargar la página.

### Accesibilidad

- Todo control interactivo es `<button type="button">` o `<a>`, nunca un `<div>`
  con `(click)`.
- No metas un `<button>` dentro de un `<a>`. Usa un solo elemento con las clases
  del botón.
- `aria-label` en botones que solo tienen icono.
- `aria-expanded` en toggles; `role="tab"` + `aria-selected` en pestañas.

---

## SCSS

### Tokens: nunca hardcodees un color de marca

Todo vive en `:root` dentro de `src/styles.scss`.

```scss
// ✅
color: var(--Hub);
font-family: var(--font-brand);

// ❌
color: #ffb300;
font-family: 'Space-Grotesk', sans-serif;
```

**Colores principales**

| Token                  | Valor     | Uso                                  |
| ---------------------- | --------- | ------------------------------------ |
| `--main`               | `#121212` | Fondo de la página                   |
| `--secondary`          | `#212121` | Superficies elevadas                 |
| `--Hub`                | `#ffb300` | Ámbar de marca: acentos, CTAs, activo |
| `--Hub-translucid`     | `#ffb3002a` | Fondos de badge                     |
| `--Hub-rgb`            | `255,179,0` | Para `rgba(var(--Hub-rgb), 0.2)`    |
| `--primary`            | `#ff5f00` | Naranja secundario                   |
| `--main-ultra-light`   | `#929090` | Texto secundario                     |
| `--HubShadow`          | `#d0d0d0` | Glow en hover                        |

**Fuentes**

| Token             | Familia        | Uso                          |
| ----------------- | -------------- | ---------------------------- |
| `--font-brand`    | Space Grotesk  | Títulos, nombres, labels     |
| `--font-body`     | Manrope        | Párrafos, descripciones      |
| `--font-btns`     | Space Grotesk  | Botones                      |
| `--font-price`    | Manrope        | Precios                      |
| `--font-date`     | Manrope        | Fechas                       |
| `--font-brand2`   | ROLNER         | Acento de marca              |

Antes de usar un `@font-face` nuevo, **verifica que el archivo exista**. Un
`--font-body` roto pasó desapercibido en 59 lugares porque el navegador cae
silenciosamente al sans-serif del sistema.

### Nombres — BEM con el anidamiento de SCSS

```scss
.social {
  &__header { }        // .social__header
  &__title-highlight { }
  &__tab {
    &.is-active { }    // estado con prefijo is-
  }
}
```

Bloque = nombre del componente. Estados como `is-active`, `is-invalid`,
`drag-over`.

### La superficie de tarjeta estándar

Este patrón se repite en todo el sitio; respétalo para que todo se vea igual:

```scss
background-color: #1a1a1a;
border: 1px solid #2e2e2e;
border-radius: 16px;
box-shadow:
  0 0 0 1px rgba(var(--Hub-rgb), 0.06),
  0 8px 32px rgba(0, 0, 0, 0.5),
  0 32px 80px rgba(0, 0, 0, 0.4);
```

### Responsive

Mobile-first no es la convención actual del repo (usa `max-width`), pero **toda
página nueva debe funcionar a 375px**.

```scss
// ✅ se adapta solo
grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));

// ❌ 4 columnas de 70px en un teléfono
grid-template-columns: repeat(4, 1fr);
```

Breakpoints en uso: `415px`, `600px`, `700px`, `900px`, `1024px`.

### Presupuesto de estilos

Máximo **8 kB** por archivo de estilos de componente (16 kB = error). Si te pasas,
probablemente hay estilos repetidos que deberían ser un parcial en `src/styles/`
(como `_auth-shell.scss`, compartido por login y registro).

---

## Imágenes y assets

Reglas duras. Una foto de 12.5 MB ya se colcó en el repo una vez:

1. **Borde largo máximo 1600px.** Nada se muestra más grande.
2. **Fotos → JPEG** calidad ~82.
3. **PNG solo con transparencia real.** Un PNG opaco pesa ~10× lo que su JPEG.
4. **SVG para iconos**, siempre.
5. Nombres en `kebab-case`, descriptivos: `coilover-street-pro.jpg`.
6. Iconos: `nombre-icon.svg` = estado normal, `nombre-hub-icon.svg` = estado activo
   (versión ámbar).

Ver `brand/README.md` para el script de optimización.

---

## Archivos y nombres

| Tipo        | Archivo                  | Clase / símbolo        |
| ----------- | ------------------------ | ---------------------- |
| Página      | `pages/login/login.ts`   | `LoginComponent`       |
| Componente  | `car-card/car-card.ts`   | `CarCard`              |
| Servicio    | `auth.service.ts`        | `AuthService`          |
| Modelo      | `user.model.ts`          | `UserModel`            |
| Mock        | `hub-part.mock.ts`       | `HUB_PART_MOCK`        |
| Guard       | `auth.guard.ts`          | `authGuard`            |
| Interceptor | `http-error.interceptor.ts` | `httpErrorInterceptor` |

Todo en `kebab-case`. Selectores con prefijo `app-`.

Inconsistencias conocidas: `cart.ts` exporta `CartService` (debería llamarse
`cart.service.ts`), y los sufijos `Component` se aplican de forma irregular
(`HomeComponent` vs `AutoHub`). 🔸 En `docs/ROADMAP.md`.

---

## Pruebas

- Providers globales en `src/test-providers.ts`. No repitas `provideRouter()` ni
  `provideHttpClient()` en cada spec.
- Si el componente tiene un `@Input` requerido, el spec **debe** asignarlo:

```ts
const fixture = TestBed.createComponent(CatalogoCard);
fixture.componentRef.setInput('hubPart', HUB_PART_MOCK[0]);
await fixture.whenStable();
```

- Un spec que solo verifica `toBeTruthy()` es aceptable como mínimo, pero si el
  componente tiene lógica (validación, filtros, formato), pruébala.
- Si un servicio usa `localStorage`, limpia en `beforeEach` **antes** de crear el
  servicio: el estado inicial se lee en el constructor.

---

## Base de datos

- Postgres en `snake_case`, frontend en `camelCase`. La traducción va **solo** en
  `core/supabase/mappers.ts`.
- Si cambias el esquema: nueva migración en `supabase/migrations/` (nunca edites
  una ya ejecutada) + actualizar `database.types.ts` en el mismo commit.
- Los tipos de fila son `type`, **no `interface`**: una interface no satisface
  `Record<string, unknown>` y supabase-js resuelve todos los Insert a `never`.
- Toda tabla nueva necesita su política RLS en el mismo commit. La clave anon es
  pública; sin política, la tabla queda abierta o inaccesible.

## Git

- Una rama por función, nombrada en inglés y en `kebab-case`: `hub-market`,
  `car-details-ui-redesign`.
- Mensajes de commit en inglés, imperativo: `Add Social Hub feed and clubs view`.
- **Nunca** agregues coautores, colaboradores ni menciones de IA. Ver `CLAUDE.md`.
