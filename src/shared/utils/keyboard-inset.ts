/** Lo que el teclado en pantalla le deja a la página, medido con `window.visualViewport`. */
export interface KeyboardMetrics {
  /** Píxeles que el teclado tapa por abajo (0 con el teclado cerrado). */
  inset: number;
  /** Alto que queda visible para la página. */
  free: number;
}

/**
 * Avisa de cuánto tapa el teclado en pantalla, solo en ventanas de hasta `maxWidth` px.
 *
 * En Android el teclado se pone **encima** de la página sin achicarla: un elemento
 * `position: fixed; bottom: 0` queda detrás de él. Con `inset` se sube justo encima del
 * teclado y con `free` se limita su alto al espacio que queda.
 *
 * Devuelve la función que deja de escuchar, o `null` si no aplica (servidor, navegador sin
 * `visualViewport` o ventana ancha): ahí no hay nada que seguir y manda el CSS.
 */
export function trackKeyboard(maxWidth: number, onChange: (metrics: KeyboardMetrics) => void): (() => void) | null {
  if (typeof window === 'undefined' || !window.visualViewport) return null;
  if (!window.matchMedia(`(max-width: ${maxWidth}px)`).matches) return null;

  const vv = window.visualViewport;
  const update = () =>
    onChange({
      inset: Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)),
      free: Math.floor(vv.height),
    });

  update();
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
  };
}
