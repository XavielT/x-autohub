import { ProductVariantModel } from '../models/product.model';

/** Lo que la ficha le pasa a `app-image-gallery`: qué fotos enseñar y a cuál saltar. */
export interface VariantGallery {
  images: readonly string[];
  focus: string | null;
}

/** Las fotos propias de una opción, o `[]`. Un carrito guardado antes de la 0033 solo trae `imageUrl`. */
export function variantPhotos(variant: Pick<ProductVariantModel, 'imageUrl' | 'imageUrls'> | null | undefined): string[] {
  if (!variant) return [];
  if (variant.imageUrls?.length) return variant.imageUrls;
  return variant.imageUrl ? [variant.imageUrl] : [];
}

/**
 * Qué enseña la ficha al elegir una opción.
 *
 * - **Dos o más fotos propias**: la galería es solo de esa opción. Es el caso de un color con su juego
 *   de fotos: ver las del color de al lado mezcladas confunde.
 * - **Una sola**: la galería se queda con todas las del producto y salta a esa (lo que hacía la 0025). Con
 *   una sola foto no hay "juego" que aislar, y esconder las demás le quitaría al cliente fotos del producto.
 * - **Ninguna**, o ninguna que siga en el producto (alguien la quitó): todas las del producto, sin saltar.
 *
 * Una foto de la opción que ya no está entre las del producto se descarta: la galería no puede enseñar algo
 * que el producto ya no tiene.
 */
export function variantGallery(
  productImages: readonly string[],
  variant: Pick<ProductVariantModel, 'imageUrl' | 'imageUrls'> | null | undefined,
): VariantGallery {
  const own = variantPhotos(variant).filter((url) => productImages.includes(url));
  if (own.length >= 2) return { images: own, focus: null };
  return { images: productImages, focus: own[0] ?? null };
}
