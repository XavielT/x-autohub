/** Borde largo máximo de una foto de publicación (ver `brand/README.md`). */
export const IMAGE_MAX_EDGE = 1600;
/** Calidad JPEG de la copia que se sube. */
export const IMAGE_QUALITY = 0.85;
/** Lo más que se acepta de entrada, antes de comprimir. */
export const IMAGE_INPUT_MAX_BYTES = 10 * 1024 * 1024;

const INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Dimensiones que caben en `maxEdge` por el lado largo, sin agrandar nunca. */
export function fitWithin(width: number, height: number, maxEdge = IMAGE_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** El error de una foto que no se puede aceptar, o null. */
export function imageInputProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!INPUT_TYPES.includes(file.type)) return 'Solo se aceptan imágenes JPG, PNG o WebP.';
  if (file.size > IMAGE_INPUT_MAX_BYTES) return 'Cada foto debe pesar menos de 10 MB.';
  return null;
}

/**
 * Reduce una foto a 1600 px de borde largo y la guarda como JPEG al 85 %. Un PNG de 12 MB queda en
 * unos cientos de KB. Si el navegador no puede decodificarla o la copia no gana nada, devuelve el
 * archivo original.
 */
export async function compressImage(file: File, maxEdge = IMAGE_MAX_EDGE, quality = IMAGE_QUALITY): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG no tiene transparencia: se rellena de blanco para que no quede negro.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    // Un JPEG pequeño que ya cabía no mejora recomprimiéndolo.
    if (file.type === 'image/jpeg' && blob.size >= file.size && width === bitmap.width) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close?.();
  }
}
