/**
 * Enlaces a WhatsApp.
 *
 * `wa.me` no acepta un teléfono con formato: quiere los dígitos en E.164 —
 * código de país incluido y nada más. `809 555 0134` no abre nada; `18095550134`
 * abre la conversación. Esa traducción vive aquí y en un solo lugar, porque el
 * botón sale en cuatro páginas de detalle.
 *
 * El texto va en `?text=` y **tiene que ir codificado**: los títulos de las
 * publicaciones traen espacios, acentos y comillas, y un `&` en un título
 * cortaría el mensaje a la mitad sin que nadie lo notara hasta verlo en el
 * teléfono.
 */

import { digitsOnly } from './phone';

/**
 * Dígitos en E.164, asumiendo República Dominicana.
 *
 * - Diez dígitos → se les antepone el `1`. Es el caso normal: es la forma
 *   canónica en la que se guardan los teléfonos (ver `normalizeDrPhone`), y RD
 *   comparte el `+1` con Estados Unidos y Canadá.
 * - Ya con código de país (`+1 809…`, `+34 600…`) → se respeta el que trae. No
 *   se le suma otro encima, que es lo que rompería un número extranjero.
 */
export function toWaDigits(phone: string): string {
  const digits = digitsOnly(phone);
  return digits.length === 10 ? `1${digits}` : digits;
}

/**
 * Enlace listo para un `href`, o cadena vacía si no hay teléfono al que llamar.
 *
 * La cadena vacía es deliberada y las plantillas la aprovechan: `@if (waLink())`
 * decide si el botón existe, sin repetir en cada página la comprobación de si el
 * artículo trae teléfono.
 */
export function buildWaLink(phone: string, message: string): string {
  const digits = toWaDigits(phone);
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
