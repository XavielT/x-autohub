import { relatedVehicles } from './related-vehicles';

const v = (id: number, price: number, brand?: string, body?: string) => ({ id, price, brand, body });

describe('relatedVehicles', () => {
  const actual = v(1, 1000, 'Toyota', 'sedan');

  it('misma marca, o misma carrocería, con el precio dentro de ±30 %', () => {
    const todos = [
      v(2, 1200, 'Toyota', 'suv'),   // marca: sí
      v(3, 900, 'Honda', 'sedan'),   // carrocería: sí
      v(4, 1000, 'Honda', 'suv'),    // ni marca ni carrocería: no
      v(5, 1400, 'Toyota', 'sedan'), // precio fuera (+40 %): no
      v(6, 650, 'Toyota', 'sedan'),  // precio fuera (-35 %): no
    ];
    expect(relatedVehicles(actual, todos).map((x) => x.id)).toEqual([3, 2]);
  });

  it('excluye el actual', () => {
    expect(relatedVehicles(actual, [actual, v(2, 1000, 'Toyota')]).map((x) => x.id)).toEqual([2]);
  });

  it('el borde del 30 % cuenta', () => {
    expect(relatedVehicles(actual, [v(2, 1300, 'Toyota'), v(3, 700, 'Toyota')]).map((x) => x.id).sort()).toEqual([2, 3]);
  });

  it('como máximo 6, los más cercanos en precio primero', () => {
    const muchos = Array.from({ length: 10 }, (_, i) => v(10 + i, 1000 + (i + 1) * 20, 'Toyota'));
    const out = relatedVehicles(actual, muchos);
    expect(out).toHaveLength(6);
    expect(out[0].id).toBe(10);
  });

  it('sin parecidos devuelve vacío; la marca vacía no empareja con otra vacía', () => {
    expect(relatedVehicles(actual, [v(2, 5000, 'Toyota')])).toEqual([]);
    expect(relatedVehicles(v(1, 1000), [v(2, 1000)])).toEqual([]);
  });

  it('compara sin distinguir mayúsculas', () => {
    expect(relatedVehicles(actual, [v(2, 1000, 'TOYOTA')]).map((x) => x.id)).toEqual([2]);
  });
});
