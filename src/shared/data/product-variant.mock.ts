import { ProductVariantModel } from '../models/product.model';

/**
 * Las opciones de los productos que las tienen, en modo simulado. Reflejan la tabla
 * `product_variants` (migración 0023).
 *
 * Solo las alfombras (id 8) traen opciones: es el caso típico, un mismo accesorio en
 * varios colores. El resto del catálogo no tiene, y la tienda lo trata igual que antes.
 * El stock del producto (`hub-part.mock.ts`) es la suma de las opciones activas, como lo
 * deja el trigger de la base.
 */
export const PRODUCT_VARIANT_LABELS_MOCK: Readonly<Record<number, string>> = {
  8: 'Color',
};

export const PRODUCT_VARIANTS_MOCK: ProductVariantModel[] = [
  { id: 1, productId: 8, name: 'Negro', sku: 'ALF-NEG', stock: 8, sortOrder: 1, isActive: true },
  { id: 2, productId: 8, name: 'Gris', sku: 'ALF-GRI', stock: 5, sortOrder: 2, isActive: true },
  { id: 3, productId: 8, name: 'Beige', sku: 'ALF-BEI', stock: 3, sortOrder: 3, isActive: true },
];

/** La suma del stock de las opciones activas de un producto, o `null` si no tiene. */
export function variantStockOf(productId: number): number | null {
  const active = PRODUCT_VARIANTS_MOCK.filter((v) => v.productId === productId && v.isActive);
  return active.length > 0 ? active.reduce((sum, v) => sum + v.stock, 0) : null;
}
