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

  it('bajo pedido nunca esta agotado, aunque el stock sea cero, y dice en cuantos dias llega', () => {
    const a = availabilityOf(makeProduct({ fulfillment: 'on_order', stock: 0, leadTimeDays: 7 }));

    expect(a.kind).toBe('on_order');
    expect(a.canBuy).toBe(true);
    expect(a.label).toBe('Bajo pedido: llega en 7 días');
    expect(a.short).toBe('Bajo pedido · 7 días');
  });

  it('un dia va en singular, y sin plazo no inventa uno', () => {
    expect(availabilityOf(makeProduct({ fulfillment: 'on_order', leadTimeDays: 1 })).label).toBe('Bajo pedido: llega en 1 día');
    expect(availabilityOf(makeProduct({ fulfillment: 'on_order', leadTimeDays: null })).label).toBe('Bajo pedido');
  });
});
