import { ProductModel, ProductVariantModel } from '../models/product.model';

export type AvailabilityKind = 'in_stock' | 'on_order' | 'out_of_stock';

export interface Availability {
  kind: AvailabilityKind;
  /** La frase completa, para la ficha: "En stock: 4". */
  label: string;
  /** La corta, para la tarjeta: "En stock". */
  short: string;
  /** Si se puede agregar al carrito. Un agotado no. */
  canBuy: boolean;
}

/**
 * Qué le decimos al cliente de la disponibilidad de un producto.
 *
 * Es la única definición: la tarjeta, la ficha y (en la fase 4) el checkout dicen
 * lo mismo porque leen esto, no cada uno su propia cuenta. Un producto bajo
 * pedido nunca está "agotado" (no depende del inventario) y uno de inventario sin
 * existencias sí.
 *
 * Con una `variant` (la opción elegida en la ficha o la de una línea del carrito) las
 * existencias son las de esa opción. Sin ella, un producto con opciones usa su stock, que
 * es la suma de las activas: "hay" si queda alguna opción con unidades.
 */
export function availabilityOf(product: ProductModel, variant: ProductVariantModel | null = null): Availability {
  if (product.fulfillment === 'on_order') {
    const days = product.leadTimeDays;
    return {
      kind: 'on_order',
      label: days ? `Bajo pedido: llega en ${days} ${days === 1 ? 'día' : 'días'}` : 'Bajo pedido',
      short: days ? `Bajo pedido · ${days} ${days === 1 ? 'día' : 'días'}` : 'Bajo pedido',
      canBuy: true,
    };
  }

  const stock = variant ? variant.stock : product.stock;

  if (stock > 0) {
    return { kind: 'in_stock', label: `En stock: ${stock}`, short: 'En stock', canBuy: true };
  }

  return { kind: 'out_of_stock', label: 'Agotado', short: 'Agotado', canBuy: false };
}
