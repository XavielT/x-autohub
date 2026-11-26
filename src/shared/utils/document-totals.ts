/**
 * Los números de una factura o cotización.
 *
 * **Es la misma regla que `business_documents_totals()` en SQL (0063)**: si cambias una, cambia la otra.
 * El navegador calcula para mostrar; Postgres vuelve a calcular al guardar y es el que manda.
 *
 *   subtotal  = redondeo a 2 decimales de la suma de cantidad × precio
 *   descuento = monto fijo (nunca más que el subtotal) o porcentaje del subtotal
 *   base      = subtotal − descuento
 *   ITBIS     = base × tasa (solo si se aplica)
 *   total     = base + ITBIS
 *   pendiente = total − abonado (nunca negativo)
 */

export type DiscountType = 'amount' | 'percent';

export interface TotalsInput {
  items: readonly { quantity: number; unitPrice: number }[];
  discountType: DiscountType;
  discountValue: number;
  applyItbis: boolean;
  itbisRate: number;
  paid: number;
}

export interface DocumentTotals {
  subtotal: number;
  discount: number;
  base: number;
  itbis: number;
  total: number;
  paid: number;
  balance: number;
}

export const DEFAULT_ITBIS_RATE = 18;

/** Redondeo comercial a centavos (evita 0.1 + 0.2). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const safe = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

export function computeTotals(input: TotalsInput): DocumentTotals {
  const subtotal = round2(input.items.reduce((sum, i) => sum + safe(i.quantity) * safe(i.unitPrice), 0));

  const discount =
    input.discountType === 'percent'
      ? round2((subtotal * Math.min(safe(input.discountValue), 100)) / 100)
      : Math.min(round2(safe(input.discountValue)), subtotal);

  const base = round2(subtotal - discount);
  const itbis = input.applyItbis ? round2((base * safe(input.itbisRate)) / 100) : 0;
  const total = round2(base + itbis);
  const paid = round2(safe(input.paid));

  return { subtotal, discount, base, itbis, total, paid, balance: Math.max(0, round2(total - paid)) };
}

/** `COT-0007` / `FAC-0012`. */
export function documentCode(kind: 'cotizacion' | 'factura', number: number): string {
  return `${kind === 'cotizacion' ? 'COT' : 'FAC'}-${String(number).padStart(4, '0')}`;
}

/** `YYYY-MM-DD` sumando días, en hora local (sin saltos por la zona horaria). */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hoy como `YYYY-MM-DD`, en hora local. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
