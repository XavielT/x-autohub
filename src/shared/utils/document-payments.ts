import { DocumentPayment, DocumentStatus, PaymentMethod } from '../models/business-document.model';
import { round2 } from './document-totals';

/**
 * Los cobros de una factura: abonos con fecha, monto, método y nota.
 *
 * Lo cobrado es la suma de los abonos, y **esa suma la calcula Postgres al guardar** (`business_documents_prepare()`, 0066);
 * aquí se calcula igual para mostrarla al instante. El pendiente es el total menos lo cobrado (`document-totals.ts`).
 */

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'];

let seq = 0;
/** Un id propio para cada abono (sirve para quitarlo). */
export const newPaymentId = (): string => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Lo cobrado: la suma de los abonos, a centavos. */
export function sumPayments(payments: readonly { amount: number }[]): number {
  return round2(payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) && p.amount > 0 ? p.amount : 0), 0));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que falta para poder registrar un abono, o `null` si está bien.
 * No se acepta más que lo pendiente: un abono mayor casi siempre es un error de digitación, y lo que se cobró de más no es un abono.
 */
export function validatePayment(
  payment: { date: string; amount: number },
  balance: number,
): string | null {
  if (!ISO_DATE.test(payment.date) || Number.isNaN(Date.parse(payment.date))) return 'Elige la fecha del pago.';
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) return 'Escribe cuánto se pagó (más de cero).';
  if (round2(payment.amount) > round2(balance)) {
    return `El abono es mayor que lo pendiente (RD$ ${balance.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`;
  }
  return null;
}

/**
 * El estado que le toca a una factura según su saldo: al llegar a cero pasa de Emitida a Pagada, y si un abono se quita y
 * vuelve a haber saldo, de Pagada a Emitida. Los demás estados (borrador, anulada) no se tocan.
 */
export function statusForBalance(status: DocumentStatus, balance: number): DocumentStatus {
  if (status === 'emitida' && balance <= 0) return 'pagada';
  if (status === 'pagada' && balance > 0) return 'emitida';
  return status;
}

/** La fecha del último abono (`YYYY-MM-DD`): el día en que se terminó de pagar, cuando el saldo es cero. */
export function lastPaymentDate(payments: readonly DocumentPayment[]): string | null {
  const dates = payments.map((p) => p.date).filter((d) => ISO_DATE.test(d));
  return dates.length === 0 ? null : dates.reduce((a, b) => (a > b ? a : b));
}

/** Los abonos del más viejo al más nuevo (por fecha y, a igual fecha, en el orden en que se registraron). */
export function sortedPayments(payments: readonly DocumentPayment[]): DocumentPayment[] {
  return payments
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.date.localeCompare(b.p.date) || a.i - b.i)
    .map((x) => x.p);
}
