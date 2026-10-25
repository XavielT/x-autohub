import { variantGallery, variantPhotos } from './variant-gallery';

const PRODUCTO = ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'];

describe('variant-gallery', () => {
  describe('variantPhotos', () => {
    it('sin opción, o sin fotos, no hay ninguna', () => {
      expect(variantPhotos(null)).toEqual([]);
      expect(variantPhotos(undefined)).toEqual([]);
      expect(variantPhotos({ imageUrl: null, imageUrls: [] })).toEqual([]);
      expect(variantPhotos({})).toEqual([]);
    });

    it('lee la lista, y si falta (un carrito anterior a la 0033) la foto sola', () => {
      expect(variantPhotos({ imageUrl: 'a.jpg', imageUrls: ['a.jpg', 'b.jpg'] })).toEqual(['a.jpg', 'b.jpg']);
      expect(variantPhotos({ imageUrl: 'a.jpg' })).toEqual(['a.jpg']);
    });
  });

  describe('variantGallery', () => {
    it('sin opción elegida, las fotos del producto y sin saltar', () => {
      expect(variantGallery(PRODUCTO, null)).toEqual({ images: PRODUCTO, focus: null });
    });

    it('una opción sin fotos propias no cambia nada', () => {
      expect(variantGallery(PRODUCTO, { imageUrls: [] })).toEqual({ images: PRODUCTO, focus: null });
    });

    it('con una sola foto, la galería se queda con todas y salta a esa (lo de antes de la 0033)', () => {
      expect(variantGallery(PRODUCTO, { imageUrl: 'c.jpg', imageUrls: ['c.jpg'] })).toEqual({ images: PRODUCTO, focus: 'c.jpg' });
      expect(variantGallery(PRODUCTO, { imageUrl: 'c.jpg' })).toEqual({ images: PRODUCTO, focus: 'c.jpg' });
    });

    it('con dos o más fotos, la galería es solo de la opción, en su orden', () => {
      expect(variantGallery(PRODUCTO, { imageUrls: ['d.jpg', 'b.jpg'] })).toEqual({ images: ['d.jpg', 'b.jpg'], focus: null });
    });

    it('una foto de la opción que el producto ya no tiene se descarta', () => {
      // Quedan dos buenas: galería de la opción, sin la vieja.
      expect(variantGallery(PRODUCTO, { imageUrls: ['a.jpg', 'vieja.jpg', 'b.jpg'] })).toEqual({ images: ['a.jpg', 'b.jpg'], focus: null });
      // Queda una sola buena: se comporta como una foto sola.
      expect(variantGallery(PRODUCTO, { imageUrls: ['vieja.jpg', 'b.jpg'] })).toEqual({ images: PRODUCTO, focus: 'b.jpg' });
      // No queda ninguna: como si no tuviera.
      expect(variantGallery(PRODUCTO, { imageUrls: ['vieja.jpg'] })).toEqual({ images: PRODUCTO, focus: null });
    });
  });
});
