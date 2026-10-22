import { ProductModel } from '../models/product.model';

/**
 * Un producto válido para las pruebas, con todo lo que `ProductModel` exige.
 *
 * Existe para que un spec que solo se fija en el precio o en el nombre no tenga
 * que repetir las veinte propiedades de la tienda, y para que cuando el modelo
 * gane un campo se corrija aquí y no en cada spec. Los valores son los de un
 * artículo de inventario propio, universal y sin oferta: el caso más simple.
 */
export function makeProduct(overrides: Partial<ProductModel> = {}): ProductModel {
  const id = overrides.id ?? 1;
  return {
    id,
    category: 'frenos',
    categoryId: 6,
    slug: `producto-${id}`,
    sku: `XAH-${String(id).padStart(6, '0')}`,
    name: `Producto ${id}`,
    brand: 'Marca',
    shortDescription: 'Descripcion corta',
    imgUrl: 'assets/imgs/hub-parts/disco-brembo-gtr.jpg',
    starsRating: 4.5,
    price: 1000,
    compareAtPrice: null,
    description: 'Descripcion',
    stock: 10,
    isFeatured: false,
    fulfillment: 'stock',
    leadTimeDays: null,
    fitmentType: 'universal',
    installable: false,
    installationServiceId: null,
    specs: {},
    soldCount: 0,
    ...overrides,
  };
}
