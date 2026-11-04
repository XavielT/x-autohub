/**
 * Frenos, dirección y fuga de combustible: lo que no se debe manejar. Es el mismo criterio que usa la edge `ai-triage-quote` (regla fija, no un juicio de la
 * IA) para marcar una solicitud como urgencia "seguridad"; aquí sirve para mostrarle al cliente, de inmediato, una nota fija y sobria.
 */
export const SAFETY_PATTERN = /\b(fren[oa]s?|pastillas?|pedal|direcci[oó]n|volante|fuga|gotea|goteo|gasolina|combustible|diesel|di[eé]sel)\b/i;

export function isSafetyRelated(text: string): boolean {
  return SAFETY_PATTERN.test(text);
}

/** La nota que se le muestra al cliente. Fija y sobria: no asusta ni diagnostica. */
export const SAFETY_NOTE = 'Si sientes que no es seguro, no manejes el vehículo y avísanos.';
