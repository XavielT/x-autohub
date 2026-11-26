/** Matemática del editor de fotos: el recorte y el tamaño de salida. Todo en píxeles de la vista. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Qué se está arrastrando: una esquina, un lado o el recuadro entero. */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/** Lado más corto que puede tener el recorte (px de la vista). */
export const MIN_CROP = 24;

/** Borde largo máximo de una foto del sitio (ver brand/README.md). */
export const MAX_SIDE = 1600;

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** El recorte más grande, centrado, con esa proporción (ancho/alto); sin proporción, toda la imagen. */
export function fitRect(width: number, height: number, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, w: width, h: height };
  let w = width;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

/**
 * Mueve o estira el recorte según lo arrastrado (`dx`, `dy`), sin salirse de la imagen
 * (`width` × `height`) ni quedar más chico que `MIN_CROP`. Con `ratio` mantiene la proporción: solo
 * las esquinas la respetan (los lados se usan sin proporción).
 */
export function dragRect(start: Rect, handle: Handle, dx: number, dy: number, width: number, height: number, ratio: number | null): Rect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, width - start.w), y: clamp(start.y + dy, 0, height - start.h) };
  }

  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP, width);
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, height);

  if (ratio && handle.length === 2) {
    // El ancho manda; el alto se deduce y, si no cabe, se acorta el ancho.
    let w = right - left;
    let h = w / ratio;
    const room = handle.includes('n') ? start.y + start.h : height - start.y;
    if (h > room) {
      h = room;
      w = h * ratio;
    }
    const roomX = handle.includes('w') ? start.x + start.w : width - start.x;
    if (w > roomX) {
      w = roomX;
      h = w / ratio;
    }
    if (w < MIN_CROP) {
      w = MIN_CROP;
      h = w / ratio;
    }
    left = handle.includes('w') ? start.x + start.w - w : start.x;
    top = handle.includes('n') ? start.y + start.h - h : start.y;
    right = left + w;
    bottom = top + h;
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** El tamaño final: el del recorte, achicado para que su lado largo no pase de `max`. Nunca agranda. */
export function outputSize(w: number, h: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
