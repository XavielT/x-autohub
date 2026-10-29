import { SocialMedia, SocialPostModel } from '../models/social-hub.model';

/** Máximo de archivos por publicación (el check de la migración 0045). */
export const SOCIAL_MEDIA_MAX = 4;
/** Lo más que pesa un video o una foto del feed (el límite del bucket `social-media`). */
export const SOCIAL_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

/** Lo que muestra una publicación: su `media`, o la `imageUrl` de las sembradas. */
export function mediaOf(post: Pick<SocialPostModel, 'media' | 'imageUrl'>): SocialMedia[] {
  if (post.media && post.media.length > 0) return post.media;
  return post.imageUrl ? [{ type: 'image', url: post.imageUrl }] : [];
}

export function isImageFile(file: Pick<File, 'type'>): boolean {
  return IMAGE_TYPES.includes(file.type);
}

export function isVideoFile(file: Pick<File, 'type'>): boolean {
  return VIDEO_TYPES.includes(file.type);
}

/** El error de un archivo que no se puede subir al feed, o null. */
export function socialMediaProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!isImageFile(file) && !isVideoFile(file)) return 'Solo se aceptan fotos JPG, PNG o WebP y videos MP4 o WebM.';
  if (file.size > SOCIAL_MEDIA_MAX_BYTES) return 'Cada archivo debe pesar menos de 25 MB.';
  return null;
}
