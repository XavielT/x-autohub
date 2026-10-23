import { storeWhatsAppLink } from './contact';

export interface QuoteInput {
  /** El vehículo, ya como texto: del selector ("Toyota Corolla 2015") o escrito a mano. */
  vehicle: string;
  /** Qué le pasa o qué necesita. */
  details: string;
  phone: string;
  /** Si pidió cotizar un servicio concreto. */
  serviceTitle?: string | null;
  /** Cuántas fotos dijo que tiene (no se suben: se le pide mandarlas por WhatsApp). */
  photos?: number;
}

/**
 * El mensaje de WhatsApp de una cotización.
 *
 * El formulario de cotizar **no guarda nada**: es una herramienta para redactar este
 * texto y abrir la conversación. Las fotos no viajan por aquí (no hay a dónde
 * subirlas); si dijo que tiene, el mensaje se lo recuerda para que las adjunte
 * al chat.
 */
export function quoteMessage(input: QuoteInput): string {
  const lines = [
    input.serviceTitle
      ? `Hola X AutoHub, quiero cotizar: ${input.serviceTitle}.`
      : 'Hola X AutoHub, quiero cotizar un servicio.',
  ];

  if (input.vehicle.trim()) lines.push(`Vehículo: ${input.vehicle.trim()}`);
  if (input.details.trim()) lines.push(`Qué necesito: ${input.details.trim()}`);
  if (input.phone.trim()) lines.push(`Mi teléfono: ${input.phone.trim()}`);
  if (input.photos && input.photos > 0) {
    lines.push(`Te mando ${input.photos === 1 ? 'una foto' : `${input.photos} fotos`} por aquí.`);
  }

  return lines.join('\n');
}

export function quoteLink(input: QuoteInput): string {
  return storeWhatsAppLink(quoteMessage(input));
}
