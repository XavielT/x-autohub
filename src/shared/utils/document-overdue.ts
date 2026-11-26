import { BusinessDocument } from '../models/business-document.model';
import { addDaysIso, round2 } from './document-totals';

/** Días de plazo que lleva por defecto una factura nueva (se puede cambiar o quitar en el editor). */
export const INVOICE_DUE_DAYS = 15;

/** La fecha de vencimiento por defecto de una factura emitida hoy. */
export const defaultDueDate = (today: string): string => addDaysIso(today, INVOICE_DUE_DAYS);

type Overdueable = Pick<BusinessDocument, 'kind' | 'status' | 'total' | 'paid' | 'validUntil'>;

/** ¿Es una factura emitida con saldo pendiente? Solo esas se cobran. */
export function isOpenInvoice(doc: Overdueable): boolean {
  return doc.kind === 'factura' && doc.status === 'emitida' && round2(doc.total - doc.paid) > 0;
}

/** Cuántos días lleva vencida (0 si no lo está, no tiene fecha o ya se cobró). `today` es `YYYY-MM-DD`. */
export function overdueDays(doc: Overdueable, today: string): number {
  if (!isOpenInvoice(doc) || !doc.validUntil || doc.validUntil >= today) return 0;
  return Math.round((Date.parse(today) - Date.parse(doc.validUntil)) / 86_400_000);
}

/** Cuántos días faltan para que venza (0 si ya venció, no tiene fecha o no se cobra). */
export function daysUntilDue(doc: Overdueable, today: string): number {
  if (!isOpenInvoice(doc) || !doc.validUntil || doc.validUntil < today) return 0;
  return Math.round((Date.parse(doc.validUntil) - Date.parse(today)) / 86_400_000);
}
