/**
 * Mantiene a la vista la página prerenderizada mientras el navegador arranca la app.
 *
 * El sitio no usa hidratación: al arrancar, Angular vacía `<app-root>` y pinta la página desde
 * cero, y una ficha de producto empieza en "Cargando el producto…" hasta que llega su consulta.
 * Sin esto, quien abre un enlace vería el producto (el HTML prerenderizado), luego un "Cargando…"
 * de medio segundo y luego el producto otra vez.
 *
 * Aquí el HTML prerenderizado se pasa a una capa encima (`#prerender-snapshot`, sin interacción y
 * oculta a los lectores de pantalla) antes de arrancar; cuando la app ya tiene sus datos y está
 * estable, la capa se quita y queda la app de verdad. Si algo se atora, se quita sola a los 4
 * segundos: nunca puede dejar una página congelada por encima.
 *
 * Las rutas que no se prerenderizan (carrito, pedidos, cuenta, panel…) llegan con `<app-root>`
 * vacío y esto no hace nada.
 */
export const SNAPSHOT_ID = 'prerender-snapshot';

/** Lo máximo que puede quedarse la capa, pase lo que pase. */
export const SNAPSHOT_MAX_MS = 4000;

/** Un respiro después de que la app diga que está estable, para que alcance a pintar. */
export const SNAPSHOT_SETTLE_MS = 80;

/**
 * Pasa el contenido de `<app-root>` a la capa y devuelve la función que la quita (se puede llamar
 * varias veces). Sin contenido prerenderizado, no hace nada y devuelve una función vacía.
 */
export function holdPrerenderedPage(doc: Document, maxMs = SNAPSHOT_MAX_MS): () => void {
  const root = doc.querySelector('app-root');
  if (!root?.firstElementChild) return () => undefined;

  const snapshot = doc.createElement('div');
  snapshot.id = SNAPSHOT_ID;
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.setAttribute('inert', '');
  // Encima de todo, ocupando el ancho; el alto lo da su contenido. Sin interacción: lo que se
  // toque en esos instantes no hace nada, como en una página que todavía carga.
  snapshot.style.cssText =
    'position:absolute;top:0;left:0;right:0;z-index:2147483000;pointer-events:none;background:var(--main,#121212)';

  while (root.firstChild) snapshot.appendChild(root.firstChild);
  root.insertAdjacentElement('afterend', snapshot);

  let released = false;
  let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => release(), maxMs);

  function release(): void {
    if (released) return;
    released = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    snapshot.remove();
  }

  return release;
}
