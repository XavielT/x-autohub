/** Los 8 avatares del sitio: se guardan en `avatar_url` como su ruta (`assets/avatars/rueda.svg`). */
export const SITE_AVATARS = [
  { id: 'rueda', label: 'Rueda' },
  { id: 'volante', label: 'Volante' },
  { id: 'casco', label: 'Casco' },
  { id: 'llave', label: 'Llave' },
  { id: 'velocimetro', label: 'Velocímetro' },
  { id: 'carro', label: 'Carro' },
  { id: 'piston', label: 'Pistón' },
  { id: 'bandera', label: 'Bandera' },
] as const;

export function siteAvatarUrl(id: string): string {
  return `assets/avatars/${id}.svg`;
}

/** Lado (px) de la foto de perfil que se sube. */
export const AVATAR_SIZE = 512;

export interface CropRect {
  /** Esquina superior izquierda del cuadrado, en píxeles de la foto original. */
  sx: number;
  sy: number;
  /** Lado del cuadrado, en píxeles de la foto original. */
  size: number;
}

/**
 * El cuadrado que se recorta de una foto de `width`×`height`. Con zoom 1 es el cuadrado más grande
 * que cabe; con más zoom, uno más chico. `cx`/`cy` es el centro deseado (en píxeles de la foto) y se
 * ajusta para que el cuadrado nunca se salga de ella.
 */
export function cropRect(width: number, height: number, zoom: number, cx: number, cy: number): CropRect {
  const size = Math.min(width, height) / Math.max(zoom, 1);
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);
  return {
    sx: clamp(cx - size / 2, width - size),
    sy: clamp(cy - size / 2, height - size),
    size,
  };
}

/** Recorta y reduce a 512×512 JPEG (85 %). */
export async function renderAvatar(file: File, zoom: number, cx: number, cy: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const rect = cropRect(bitmap.width, bitmap.height, zoom, cx, cy);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bitmap, rect.sx, rect.sy, rect.size, rect.size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('blob');
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close?.();
  }
}
