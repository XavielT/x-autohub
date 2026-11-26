import { addDaysIso, computeTotals, documentCode, round2, todayIso } from './document-totals';

const base = { discountType: 'amount' as const, discountValue: 0, applyItbis: false, itbisRate: 18, paid: 0 };

describe('computeTotals', () => {
  it('suma cantidad × precio y sin impuestos el total es el subtotal', () => {
    const t = computeTotals({ ...base, items: [{ quantity: 2, unitPrice: 1500 }, { quantity: 1, unitPrice: 850.5 }] });
    expect(t.subtotal).toBe(3850.5);
    expect(t.total).toBe(3850.5);
    expect(t.itbis).toBe(0);
  });

  it('aplica el ITBIS sobre la base ya descontada', () => {
    const t = computeTotals({ ...base, items: [{ quantity: 1, unitPrice: 10000 }], discountValue: 1000, applyItbis: true });
    expect(t.base).toBe(9000);
    expect(t.itbis).toBe(1620);
    expect(t.total).toBe(10620);
  });

  it('el descuento en porcentaje sale del subtotal', () => {
    const t = computeTotals({ ...base, items: [{ quantity: 1, unitPrice: 2000 }], discountType: 'percent', discountValue: 10 });
    expect(t.discount).toBe(200);
    expect(t.total).toBe(1800);
  });

  it('un descuento fijo nunca pasa del subtotal ni deja el total negativo', () => {
    const t = computeTotals({ ...base, items: [{ quantity: 1, unitPrice: 500 }], discountValue: 9999 });
    expect(t.discount).toBe(500);
    expect(t.total).toBe(0);
  });

  it('el pendiente descuenta lo abonado y no baja de cero', () => {
    const items = [{ quantity: 1, unitPrice: 1000 }];
    expect(computeTotals({ ...base, items, paid: 400 }).balance).toBe(600);
    expect(computeTotals({ ...base, items, paid: 5000 }).balance).toBe(0);
  });

  it('ignora cantidades o precios inválidos en vez de contagiar NaN', () => {
    const t = computeTotals({ ...base, items: [{ quantity: NaN, unitPrice: 100 }, { quantity: 2, unitPrice: -5 }, { quantity: 1, unitPrice: 50 }] });
    expect(t.total).toBe(50);
  });

  it('una línea a determinar no suma, ni siquiera si trae precio, y se cuenta aparte', () => {
    const t = computeTotals({
      ...base,
      items: [
        { quantity: 1, unitPrice: 1000 },
        { quantity: 1, unitPrice: 5000, tbd: true },
        { quantity: 2, unitPrice: 0, tbd: true },
      ],
    });
    expect(t.subtotal).toBe(1000);
    expect(t.total).toBe(1000);
    expect(t.pending).toBe(2);
  });

  it('sin líneas a determinar, pending es cero', () => {
    expect(computeTotals({ ...base, items: [{ quantity: 1, unitPrice: 10 }] }).pending).toBe(0);
  });

  it('redondea a centavos sin errores de punto flotante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    const t = computeTotals({ ...base, items: [{ quantity: 3, unitPrice: 0.1 }] });
    expect(t.subtotal).toBe(0.3);
  });
});

describe('códigos y fechas', () => {
  it('documentCode rellena a cuatro dígitos', () => {
    expect(documentCode('cotizacion', 7)).toBe('COT-0007');
    expect(documentCode('factura', 1234)).toBe('FAC-1234');
  });

  it('addDaysIso cruza meses y años', () => {
    expect(addDaysIso('2026-12-20', 15)).toBe('2027-01-04');
    expect(addDaysIso('2026-02-20', 10)).toBe('2026-03-02');
  });

  it('todayIso usa la fecha local', () => {
    expect(todayIso(new Date(2026, 10, 5))).toBe('2026-11-05');
  });
});
