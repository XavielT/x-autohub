import { DocumentKind } from '../models/business-document.model';
import { buildWaLink } from './whatsapp';

export interface WhatsAppDocument {
  kind: DocumentKind;
  code: string;
  customerName: string;
  customerPhone: string;
  total: number;
  /** `YYYY-MM-DD`; solo cotizaciones. */
  validUntil: string | null;
  /** Solo facturas. */
  balance: number;
  /** Líneas "a determinar", que el total no incluye. */
  pending?: number;
}

const money = (n: number): string => `RD$ ${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dmy = (iso: string): string => iso.split('-').reverse().join('/');

/** El texto que acompaña al PDF cuando se lo mandas al cliente. El PDF lo adjuntas tú en la conversación. */
export function documentWhatsAppMessage(doc: WhatsAppDocument, businessName: string): string {
  const first = doc.customerName.trim().split(/\s+/)[0] ?? '';
  const hello = first ? `Hola ${first}, ` : 'Hola, ';

  if (doc.kind === 'cotizacion') {
    const valid = doc.validUntil ? ` Es válida hasta el ${dmy(doc.validUntil)}.` : '';
    const tbd = doc.pending ? ' Ese monto no incluye lo que está a determinar: se te informa en cuanto se confirme la falla.' : '';
    return `${hello}te comparto la cotización ${doc.code} de ${businessName} por ${money(doc.total)}.${tbd}${valid} Cualquier duda, aquí estamos.`;
  }

  const pending = doc.balance > 0 ? ` Queda pendiente ${money(doc.balance)}.` : ' Queda saldada.';
  return `${hello}te comparto la factura ${doc.code} de ${businessName} por ${money(doc.total)}.${pending} ¡Gracias por tu confianza!`;
}

/** Enlace a WhatsApp del cliente con el mensaje listo, o cadena vacía si el documento no trae teléfono. */
export function documentWhatsAppLink(doc: WhatsAppDocument, businessName: string): string {
  return buildWaLink(doc.customerPhone, documentWhatsAppMessage(doc, businessName));
}
