import { DocumentPayment } from '../models/business-document.model';
import { lastPaymentDate, newPaymentId, sortedPayments, statusForBalance, sumPayments, validatePayment } from './document-payments';

const pay = (id: string, date: string, amount: number): DocumentPayment => ({ id, date, amount, method: 'efectivo', note: '' });

describe('cobros de una factura', () => {
  it('lo cobrado es la suma de los abonos, a centavos', () => {
    expect(sumPayments([pay('a', '2026-11-01', 1000), pay('b', '2026-11-05', 500.5)])).toBe(1500.5);
    expect(sumPayments([])).toBe(0);
    expect(sumPayments([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });

  it('ignora montos inválidos en vez de contagiar NaN', () => {
    expect(sumPayments([{ amount: NaN }, { amount: -5 }, { amount: 100 }])).toBe(100);
  });

  it('cada abono tiene un id propio', () => {
    expect(newPaymentId()).not.toBe(newPaymentId());
  });

  describe('validar un abono', () => {
    it('pide una fecha válida y un monto mayor que cero', () => {
      expect(validatePayment({ date: '', amount: 100 }, 1000)).toMatch(/fecha/);
      expect(validatePayment({ date: '2026-13-45', amount: 100 }, 1000)).toMatch(/fecha/);
      expect(validatePayment({ date: '2026-11-26', amount: 0 }, 1000)).toMatch(/más de cero/);
      expect(validatePayment({ date: '2026-11-26', amount: NaN }, 1000)).toMatch(/más de cero/);
    });

    it('no acepta más que lo pendiente, y sí exactamente el saldo', () => {
      expect(validatePayment({ date: '2026-11-26', amount: 1000.01 }, 1000)).toMatch(/mayor que lo pendiente/);
      expect(validatePayment({ date: '2026-11-26', amount: 1000 }, 1000)).toBeNull();
      expect(validatePayment({ date: '2026-11-26', amount: 250.5 }, 1000)).toBeNull();
    });
  });

  describe('el estado según el saldo', () => {
    it('una factura emitida con saldo cero pasa a pagada', () => {
      expect(statusForBalance('emitida', 0)).toBe('pagada');
      expect(statusForBalance('emitida', 100)).toBe('emitida');
    });

    it('una pagada que vuelve a tener saldo regresa a emitida', () => {
      expect(statusForBalance('pagada', 50)).toBe('emitida');
      expect(statusForBalance('pagada', 0)).toBe('pagada');
    });

    it('borrador y anulada nunca cambian solas', () => {
      expect(statusForBalance('borrador', 0)).toBe('borrador');
      expect(statusForBalance('anulada', 0)).toBe('anulada');
    });
  });

  it('la fecha de pago es la del último abono', () => {
    expect(lastPaymentDate([pay('a', '2026-11-05', 1), pay('b', '2026-11-20', 1), pay('c', '2026-11-10', 1)])).toBe('2026-11-20');
    expect(lastPaymentDate([])).toBeNull();
  });

  it('ordena los abonos por fecha y, a igual fecha, en el orden en que se registraron', () => {
    const ordered = sortedPayments([pay('b', '2026-11-05', 1), pay('c', '2026-11-05', 2), pay('a', '2026-11-01', 3)]);
    expect(ordered.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});
