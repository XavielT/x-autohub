import { ProductModel } from '../models/product.model';

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
 */
export function availabilityOf(product: ProductModel): Availability {
  if (product.fulfillment === 'on_order') {
    const days = product.leadTimeDays;
    return {
      kind: 'on_order',
      label: days ? `Bajo pedido: llega en ${days} ${days === 1 ? 'día' : 'días'}` : 'Bajo pedido',
      short: days ? `Bajo pedido · ${days} ${days === 1 ? 'día' : 'días'}` : 'Bajo pedido',
      canBuy: true,
    };
  }

  if (product.stock > 0) {
    return { kind: 'in_stock', label: `En stock: ${product.stock}`, short: 'En stock', canBuy: true };
  }

  return { kind: 'out_of_stock', label: 'Agotado', short: 'Agotado', canBuy: false };
}
