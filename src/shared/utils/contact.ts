import { buildWaLink } from './whatsapp';

/**
 * El contacto de X AutoHub, en un solo lugar.
 *
 * Antes el número estaba escrito a mano en el footer, en /servicios y en el
 * catálogo, y en este último con **otro número** (`809-779-9782`): quien tocaba
 * "Contactar" desde la tienda escribía a alguien que no era X AutoHub.
 */

/** Diez dígitos, como se guardan los teléfonos (ver `normalizeDrPhone`). */
export const STORE_PHONE = '8099539782';

/** Como se lee: `809-953-9782`. */
export const STORE_PHONE_DISPLAY = '809-953-9782';

/** Enlace a la conversación de WhatsApp de la tienda, con el mensaje ya escrito. */
export function storeWhatsAppLink(message = 'Hola X AutoHub'): string {
  return buildWaLink(STORE_PHONE, message);
}
