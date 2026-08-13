# Roadmap

Trabajo pendiente, ordenado por relación valor/esfuerzo. Sale de la auditoría del
2026-08-11 (`docs/AUDIT-2026-08-11.md`), donde ya se arregló todo lo que estaba
roto. Esto es lo que **queda**.

Cada punto dice **por qué** importa, no solo qué hacer.

---

## P0 — Lo que sigue

### 1. Conectar el proyecto de Supabase  ⬅️ **empieza por aquí**

El código está listo; falta crear el proyecto, correr las cuatro migraciones y
pegar dos valores en `src/environments/`. **15 minutos**, paso a paso en
`docs/BACKEND.md`.

Mientras no lo hagas, la app sigue funcionando con los mocks: `shouldUseMockData()`
devuelve true cuando no hay credenciales.

Al terminar, márcate como admin para poder gestionar el inventario propio:

```sql
update public.profiles set is_admin = true, is_verified = true
where email = 'tu@correo.com';
```

### 2. Fuentes: cuáles se quedan

`src/assets/fonts` pesa **7.3 MB** y el build copia la carpeta completa a `dist/`.
De 21 familias, la app **realmente aplica 4**:

| Familia          | Token                          | Usos  |
| ---------------- | ------------------------------ | ----- |
| Space Grotesk    | `--font-brand`, `--font-btns`  | 71    |
| Manrope          | `--font-body`, `--font-price`, `--font-date` | 71 |
| ROLNER           | `--font-brand2` + 2 directos   | 4     |
| Batman           | directo en el hero             | 1     |
| Designer         | `--font-highlight2`            | 1     |

Las otras **16 familias (~6.6 MB)** no se aplican en ningún estilo. Algunas están
declaradas en `styles.scss` con `@font-face` pero ningún selector las usa
(Gefika, Dimona, Spoiler-script, Ducks-Fiesta, Super-Wonder, Diary-Story,
Grime-Slime, Lemon-beach, Work-krow, Biotrip-Serif) y otras ni eso (Denham,
Summer, Space-Mono, Roboto, High-School, Quantro-Sans, baloba).

**No las borré porque son decisiones tuyas de diseño.** Cuando decidas:

```bash
du -sh src/assets/fonts/*/ | sort -rh   # ver el peso de cada una
```

Borrar las 16 no usadas baja `dist/` de 15 MB a ~8.5 MB. Si quieres conservarlas
como paleta para experimentar, muévelas a `brand/fonts-lab/` (fuera del build).

### 3. Convertir a WOFF2

Las fuentes que se quedan están en `.ttf`. WOFF2 pesa ~40% menos y lo soporta todo
navegador vivo. Space Grotesk y Manrope juntas bajarían de 308 KB a ~120 KB.

## P1 — Deuda que ya está costando

### 4. Unificar las cinco páginas de detalle

`car-details`, `auto-hub-details`, `hub-part-details`, `hub-market-part-details` y
`accessory-details` tienen **el mismo código de galería copiado cinco veces**:

```ts
selectImage(index) { ... }
prevImage()  { if (this.images.length <= 1) return; ... }
nextImage()  { if (this.images.length <= 1) return; ... }
```

Y el mismo `toggleDescription()` en dos de ellas.

**Qué hacer:** extraer un `<app-image-gallery [images]="images">` en `shared/ui/` y
un `<app-expandable-text [text]="..." [maxLength]="200">`. Cada página de detalle
se queda solo con lo que la hace distinta.

**Por qué importa:** cinco copias significa que un arreglo de galería hay que
hacerlo cinco veces, y ya hay divergencia entre ellas (unas manejan el caso
"artículo no encontrado", otras no).

> Esto **no** unifica Auto Hub con Hub Market como producto. Comparten la galería,
> no el inventario.

### 5. `accessory-details` está sin terminar

Es la única página que sigue siendo un borrador: siete `<p>` sin estilo, mientras
las otras cuatro páginas de detalle tienen diseño completo. Ya se le arreglaron dos
bugs (bindeaba el array de imágenes completo al `src`, y el precio sin formato),
pero **visualmente rompe el sitio**. Es alcanzable desde `/hub-market` filtrando
accesorios.

Lo más rápido: reusar la estructura de `hub-market-part-details`, que muestra
exactamente el mismo modelo (`HubMarketItemModel`).

### 6. El carrito solo acepta piezas del catálogo

`CartService` está tipado a `HubPartModel`, así que:

- No se puede comprar un accesorio de Hub Market.
- `cart-modal` y `checkout` acceden a `item.part.price` — el nombre `part` está
  incrustado en las plantillas.

**Qué hacer:** introducir un `CartLineItem` con lo mínimo que el carrito necesita
(`id`, `name`, `price`, `imageUrl`, `source: 'catalogo' | 'hub-market'`) y que los
servicios mapeen hacia él. El checkout deja de conocer el modelo de piezas.

### 7. Panel de administración

Auto Hub, el catálogo, las noticias y los eventos solo se pueden editar desde el
Table Editor de Supabase. Funciona, pero no es algo que se le pida a alguien que
no sea desarrollador.

Una ruta `/admin` protegida por `is_admin`, con formularios sobre las mismas
tablas, cierra el ciclo. Es la diferencia entre "tengo un backend" y "puedo
operar el negocio".

### 8. Enlaces del footer que no llevan a nada

`Privacidad`, `Contacto` y `Reportar problema` son `href="#"`. Un enlace que no
lleva a ningún lado es peor que no tenerlo. Hay que crear las tres páginas o
quitar los enlaces hasta que existan.

---

## P2 — Modernizar a Angular 21

El código funciona; esto es para que siga siendo mantenible.

### 9. ~~`inject()` en vez de constructor~~ ✅

Hecho durante la migración a Supabase: todos los componentes que tocaban un
servicio pasaron a `inject()`. Quedan constructores solo donde no inyectan nada.

### 10. ~~`@if` / `@for` en vez de `*ngIf` / `*ngFor`~~ ✅

Hecho. **Cero** `*ngIf` / `*ngFor` en el proyecto, y `CommonModule` se cambió por
imports puntuales (`DecimalPipe`, `SlicePipe`, `DatePipe`) donde hacían falta.

### 11. Route params como inputs

Las cinco páginas de detalle hacen `route.paramMap.subscribe(...)` en `ngOnInit`.
Con `withComponentInputBinding()` en el router, el `id` llega como un `@Input` y
desaparece la suscripción manual.

### 12. `ChangeDetectionStrategy.OnPush`

**Cero** componentes lo usan hoy. (La antigua `PROYECTO.md` afirmaba que todos lo
tenían; no era cierto.) Se vuelve relevante cuando el estado migre a signals — con
signals + OnPush el rendimiento sube sin esfuerzo extra.

### 13. Cargar `supabase-js` bajo demanda

El cliente pesa ~200 KB y hoy va en el bundle inicial (535 KB en total, 137 KB
transferidos) porque el navbar necesita la sesión desde el primer render.

Un `await import('@supabase/supabase-js')` dentro de `SupabaseService` lo sacaría
del chunk inicial, a costa de volver asíncrono el getter `db` y, con él, todos los
servicios. **Solo vale la pena si el tiempo de primera carga se vuelve un
problema medible** — no antes.

### 14. Nombres inconsistentes

- `cart.ts` exporta `CartService` → renombrar a `cart.service.ts`.
- El sufijo `Component` es irregular: `HomeComponent`, `CatalogoComponent` vs
  `AutoHub`, `CarDetails`, `Servicios`. Elegir uno y aplicarlo.
- Los mocks viven en `shared/models/` junto a las interfaces, excepto
  `checkout-options.mock.ts` que está en `shared/data/`. Unificar en
  `shared/mocks/`.

---

## P3 — Funciones nuevas

Ordenadas por lo que más le suma al producto.

### 15. Perfil de usuario y "mis publicaciones"

Ya hay sesión (`AuthService`), `/publicar` está protegido y el servicio expone
`getBySeller(uid)` y `deactivate(id)` — con las políticas RLS que las respaldan.
Falta solo la página: el usuario puede publicar y después no puede gestionarlo.

Es el hueco más obvio del flujo actual y el que menos trabajo cuesta cerrar.

### 16. Favoritos

Guardar vehículos y piezas. Encaja con el `Club X AutoHub` que ya se promociona en
la página y da una razón concreta para crear cuenta.

### 17. Publicar en Social Hub

El feed es de solo lectura. Falta el formulario para que un miembro publique su
build. Es lo que convierte el Social Hub de escaparate a comunidad.

### 18. Búsqueda global

Hoy cada pilar tiene su propio buscador y no se hablan. Un buscador en el navbar
que cruce Auto Hub + Hub Market + Catálogo.

### 19. Filtros de verdad en Auto Hub

`/auto-hub` solo filtra por marca y modelo, con el filtro de categoría comentado en
el código. Para vehículos hacen falta rangos: precio, año, kilometraje, tipo de
chasis, combustible, tracción. Todos esos campos ya existen en `AutoHubModel`.

### 20. Video del hero: poster y peso

`citroen-c3-flying.mp4` son 2.5 MB con `autoplay`, y compite con el contenido por
el ancho de banda en la primera carga. Agregarle un `poster` (un frame exportado a
JPEG) hace que se vea algo de inmediato. Re-codificarlo a ~800 KB con `ffmpeg`
(no está instalado en este entorno) sería el arreglo completo.

### 21. Layout de Auto Hub

`auto-hub.scss` tiene el grid comentado y el contenedor en
`flex-direction: column`, así que las tarjetas se apilan en una sola columna
incluso en pantalla ancha. Parece un experimento a medias más que una decisión.
**Confirmar con Xaviel** si va en grid.

---

## Limpieza mecánica

Rápido, sin riesgo, cuando haya un rato:

- **19 iconos SVG sin usar** en `src/assets/icons/` (~120 KB). Lista completa en la
  auditoría. Varios son la versión inactiva de un par (`network-icon.svg`) o
  quedaron de rediseños (`next-*`, `bag-*`, `crowd-*`).
- **4 imágenes sin usar** en `src/assets/imgs/cars/` (corvette, gtr, lambo-bg,
  porsche) y `catalog/turbo.jpg` — ya optimizadas, ~150 KB en total.
- **`'Trebuchet MS'` a mano en 20 lugares**, saltándose el sistema de tokens.
  Debería ser `var(--font-body)` (o un token nuevo si el look es intencional).
- **Tokens declarados y nunca usados** en `styles.scss`: `--font-heading`,
  `--font-card-title`, `--font-highlight`, `--font-highlight3`, `--font-body2`,
  `--SpaceIndigo`, `--HubDark`.
- **24 ramas de git ya fusionadas** (todas con 0 commits por delante de `main`):
  ```bash
  git branch -d $(git branch --merged main | grep -v main)
  git remote prune origin
  ```
- **Barras de scroll ocultas globalmente** (`::-webkit-scrollbar { display: none }`
  en `styles.scss`). Se ve limpio pero le quita al usuario la referencia de dónde
  está en una página larga. Alternativa: una barra fina en los colores de la marca.
  **Es tu decisión de diseño** — lo dejo señalado, no cambiado.
