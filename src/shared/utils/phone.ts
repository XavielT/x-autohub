/**
 * Teléfonos dominicanos: normalizar, validar y mostrar.
 *
 * Un teléfono llega escrito de todas las formas posibles — `809 555 0134`,
 * `809-555-0134`, `(809) 555-0134`, `+1 809 555 0134` — y las cuatro son el
 * mismo número. Guardarlo tal cual lo escribieron significa que dos filas con el
 * mismo teléfono no se parecen entre sí, y que armar un enlace de WhatsApp
 * obliga a adivinar el formato en cada llamada.
 *
 * Por eso hay **una sola forma canónica de guardado**: los diez dígitos locales,
 * sin código de país y sin separadores (`8095550134`). El código de país se
 * agrega al construir el enlace (ver `whatsapp.ts`) y los separadores al
 * mostrarlo (`formatDrPhone`). La base de datos guarda dígitos; la pantalla
 * muestra un teléfono.
 *
 * La validación es la del NANP (el plan de numeración que comparten RD, Estados
 * Unidos y Canadá): el código de área y el de central no pueden empezar en 0 ni
 * en 1. Eso acepta los tres códigos dominicanos —809, 829 y 849— y también un
 * número de Estados Unidos, que en RD es común; y rechaza `12345`, `0000000000`
 * y cualquier texto que no sean dígitos suficientes.
 */

import type { AbstractControl, ValidationErrors } from '@angular/forms';

/** Solo los dígitos: se cae todo lo demás (espacios, guiones, paréntesis, `+`). */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Diez dígitos NANP: área `[2-9]XX`, central `[2-9]XX`, y cuatro más.
 *
 * No se limita a 809/829/849 a propósito: un vendedor con número de Estados
 * Unidos es un caso real en RD, y WhatsApp lo alcanza igual con el mismo `+1`.
 */
const NANP_LOCAL = /^[2-9]\d{2}[2-9]\d{6}$/;

/**
 * Forma canónica de guardado, o `null` si el número no es válido.
 *
 * Tolera el `1` de país al inicio (`+1 809-555-0134` → `8095550134`) porque es
 * lo que copia y pega quien tiene el número guardado con código de país.
 *
 * @returns Diez dígitos sin código de país, o `null`.
 */
export function normalizeDrPhone(raw: string): string | null {
  const digits = digitsOnly(raw);
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return NANP_LOCAL.test(local) ? local : null;
}

/** true cuando `raw` se puede normalizar. Una cadena vacía **no** es válida. */
export function isValidDrPhone(raw: string): boolean {
  return normalizeDrPhone(raw) !== null;
}

/**
 * Como se lee en pantalla: `809-555-0134`.
 *
 * Si el valor no es un teléfono reconocible se devuelve tal cual en vez de
 * romperlo o de esconderlo: un dato sembrado con un formato raro se sigue
 * viendo, que es mejor que una celda vacía.
 */
export function formatDrPhone(raw: string): string {
  const local = normalizeDrPhone(raw);
  if (!local) return raw;
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

/**
 * Validador para un campo de teléfono **opcional**.
 *
 * Vacío es válido: lo obligatorio se declara con `Validators.required` aparte,
 * como en el resto de los formularios. Así este validador dice una sola cosa —
 * "si escribiste algo, que sea un teléfono" — y se puede reusar en un campo
 * obligatorio sin cambiarlo.
 */
export function drPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const value = (control.value as string | null)?.trim();
  if (!value) return null;
  return isValidDrPhone(value) ? null : { phone: true };
}
