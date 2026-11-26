import { daysUntilDue, defaultDueDate, isOpenInvoice, overdueDays } from './document-overdue';

const inv = (over: Record<string, unknown> = {}) => ({ kind: 'factura' as const, status: 'emitida' as const, total: 1000, paid: 0, validUntil: '2026-11-20', ...over }) as Parameters<typeof overdueDays>[0];

describe('facturas vencidas', () => {
  it('por defecto una factura nueva vence a los 15 días', () => {
    expect(defaultDueDate('2026-11-26')).toBe('2026-12-11');
  });

  it('una emitida con saldo y fecha pasada lleva sus días de atraso', () => {
    expect(overdueDays(inv(), '2026-11-26')).toBe(6);
  });

  it('el mismo día del vencimiento todavía no está vencida', () => {
    expect(overdueDays(inv({ validUntil: '2026-11-26' }), '2026-11-26')).toBe(0);
  });

  it('sin fecha, pagada, anulada o en borrador nunca se marca vencida', () => {
    expect(overdueDays(inv({ validUntil: null }), '2026-11-26')).toBe(0);
    expect(overdueDays(inv({ status: 'pagada' }), '2026-11-26')).toBe(0);
    expect(overdueDays(inv({ status: 'anulada' }), '2026-11-26')).toBe(0);
    expect(overdueDays(inv({ status: 'borrador' }), '2026-11-26')).toBe(0);
  });

  it('con el saldo en cero no está vencida', () => {
    expect(overdueDays(inv({ paid: 1000 }), '2026-11-26')).toBe(0);
  });

  it('una cotización nunca está vencida: su fecha es de validez', () => {
    expect(overdueDays(inv({ kind: 'cotizacion' }), '2026-11-26')).toBe(0);
    expect(isOpenInvoice(inv({ kind: 'cotizacion' }))).toBe(false);
  });

  it('cuenta los días que faltan para vencer', () => {
    expect(daysUntilDue(inv({ validUntil: '2026-11-29' }), '2026-11-26')).toBe(3);
    expect(daysUntilDue(inv(), '2026-11-26')).toBe(0);
  });
});
