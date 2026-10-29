import { availabilityOf } from './product-availability';
import { makeProduct } from '../testing/product.fixture';

describe('availabilityOf', () => {
  it('con existencias: "En stock: N" y se puede comprar', () => {
    expect(availabilityOf(makeProduct({ stock: 25 }))).toEqual({
      kind: 'in_stock', label: 'En stock: 25', short: 'En stock', canBuy: true,
    });
  });

  it('sin existencias: agotado y no se puede comprar', () => {
    const a = availabilityOf(makeProduct({ stock: 0 }));

    expect(a.kind).toBe('out_of_stock');
    expect(a.label).toBe('Agotado');
    expect(a.canBuy).toBe(false);
  });

  it('bajo pedido nunca esta agotado, aunque el stock sea cero, y dice en cuántos días llega', () => {
    const a = availabilityOf(makeProduct({ fulfillment: 'on_order', stock: 0, leadTimeDays: 7 }));

    expect(a.kind).toBe('on_order');
    expect(a.canBuy).toBe(true);
    expect(a.label).toBe('Bajo pedido: llega en 7 días');
    expect(a.short).toBe('Bajo pedido · 7 días');
  });

  describe('con opciones', () => {
    const negro = { id: 1, productId: 1, name: 'Negro', sku: null, stock: 3, sortOrder: 1, isActive: true };

    it('con la opción elegida cuenta el stock de la opción, no el del producto', () => {
      const a = availabilityOf(makeProduct({ stock: 10, hasVariants: true }), negro);

      expect(a.label).toBe('En stock: 3');
    });

    it('una opción agotada es agotado aunque el producto tenga stock en otras', () => {
      const a = availabilityOf(makeProduct({ stock: 10, hasVariants: true }), { ...negro, stock: 0 });

      expect(a.kind).toBe('out_of_stock');
      expect(a.canBuy).toBe(false);
    });

    it('sin elegir usa el stock del producto, que es la suma de las opciones', () => {
      expect(availabilityOf(makeProduct({ stock: 7, hasVariants: true })).label).toBe('En stock: 7');
    });

    it('bajo pedido sigue sin agotarse aunque la opción no tenga stock', () => {
      const a = availabilityOf(makeProduct({ fulfillment: 'on_order', leadTimeDays: 5, hasVariants: true }), { ...negro, stock: 0 });

      expect(a.kind).toBe('on_order');
    });
  });

  it('un día va en singular, y sin plazo no inventa uno', () => {
    expect(availabilityOf(makeProduct({ fulfillment: 'on_order', leadTimeDays: 1 })).label).toBe('Bajo pedido: llega en 1 día');
    expect(availabilityOf(makeProduct({ fulfillment: 'on_order', leadTimeDays: null })).label).toBe('Bajo pedido');
  });
});
