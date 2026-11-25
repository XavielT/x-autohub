export type BadgePosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export interface BadgeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Relación ancho/alto de `assets/imgs/autohub-logo.png` (3100×826). */
export const LOGO_RATIO = 3100 / 826;

/** Lado largo máximo de la imagen que se descarga: evita lienzos que el navegador no puede crear. */
export const MAX_EDGE = 4096;

/** Presets: fracción (0 a 1) del espacio libre en horizontal y en vertical. */
export const PRESETS: readonly { value: BadgePosition; label: string; fx: number; fy: number }[] = [
  { value: 'tl', label: 'Arriba izquierda', fx: 0, fy: 0 },
  { value: 'tc', label: 'Arriba centro', fx: 0.5, fy: 0 },
  { value: 'tr', label: 'Arriba derecha', fx: 1, fy: 0 },
  { value: 'ml', label: 'Centro izquierda', fx: 0, fy: 0.5 },
  { value: 'mc', label: 'Centro', fx: 0.5, fy: 0.5 },
  { value: 'mr', label: 'Centro derecha', fx: 1, fy: 0.5 },
  { value: 'bl', label: 'Abajo izquierda', fx: 0, fy: 1 },
  { value: 'bc', label: 'Abajo centro', fx: 0.5, fy: 1 },
  { value: 'br', label: 'Abajo derecha', fx: 1, fy: 1 },
];

/**
 * Dónde cae la insignia sobre una imagen de `width`×`height`.
 *
 * `sizePct` es el ancho de la insignia como porcentaje del ancho de la imagen y `marginPct`
 * el margen al borde, también sobre el ancho: así se ve igual de grande en una foto de 700px
 * que en una de 4000px. `fx`/`fy` (0 a 1) mueven la insignia por el espacio que deja el margen:
 * 0 es pegada al borde izquierdo/superior y 1 al derecho/inferior.
 */
export function badgeRect(
  width: number,
  height: number,
  sizePct: number,
  marginPct: number,
  fx: number,
  fy: number,
): BadgeRect {
  const w = Math.round((width * sizePct) / 100);
  const h = Math.round(w / LOGO_RATIO);
  const m = Math.round((width * marginPct) / 100);
  const k = (n: number) => Math.min(1, Math.max(0, n));
  return {
    x: Math.round(m + k(fx) * Math.max(0, width - w - 2 * m)),
    y: Math.round(m + k(fy) * Math.max(0, height - h - 2 * m)),
    w,
    h,
  };
}

/** Escala `width`×`height` para que su lado largo no pase de `MAX_EDGE`. */
export function fitEdge(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= MAX_EDGE) return { width, height };
  const k = MAX_EDGE / long;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** `jetta mk4 2.jpg` → `jetta-mk4-2-xautohub` (sin extensión). */
export function outputName(original: string): string {
  const base = original.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'imagen'}-xautohub`;
}
