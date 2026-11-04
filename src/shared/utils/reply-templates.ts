import { buildWaLink } from './whatsapp';

/**
 * Borradores de WhatsApp para quien atiende (migración 0055 en adelante). Son plantillas SIN IA: sirven de respaldo cuando la IA no está y de punto de partida
 * cuando sí. Nunca se mandan solos: abren `wa.me` con el texto puesto y quien atiende toca "enviar" (no hay bot ni API de Meta).
 */

/** El primer nombre, con la primera letra en mayúscula. Vacío si no hay. */
export function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0] ?? '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : '';
}

const greet = (name: string) => (firstName(name) ? `Hola ${firstName(name)}, te escribimos de X AutoHub.` : 'Hola, te escribimos de X AutoHub.');

/** Respuesta a una solicitud de cotización: dice el código y, si faltan datos, los pide. */
export function quoteReplyDraft(input: { name: string; code: string; missingInfo?: string[] }): string {
  const lines = [greet(input.name), `Recibimos tu solicitud ${input.code}.`];
  const missing = (input.missingInfo ?? []).filter((m) => m.trim() !== '');
  if (missing.length > 0) {
    lines.push('Para cotizarte mejor, ¿nos cuentas?:');
    for (const m of missing) lines.push(`• ${m.trim()}`);
  } else {
    lines.push('Ya la estamos revisando y te escribimos con la cotización.');
  }
  return lines.join('\n');
}

/** Respuesta a un pedido según su estado (la plantilla sin IA: sirve de respaldo y de punto de partida). */
export function orderReplyDraft(input: { name: string; orderNumber: number; status: string; proofUnreadable?: boolean }): string {
  const head = greet(input.name);
  const n = input.orderNumber;
  if (input.status === 'awaiting_payment' && input.proofUnreadable) {
    return [head, `No pudimos leer bien el comprobante de tu pedido #${n}. ¿Nos lo puedes enviar de nuevo, más claro y completo?`, 'Gracias.'].join('\n');
  }
  const body: Record<string, string> = {
    awaiting_payment: `Seguimos esperando el pago o el comprobante de tu pedido #${n}. En cuanto lo recibamos lo preparamos.`,
    paid: `Ya recibimos el pago de tu pedido #${n}. Lo estamos preparando.`,
    preparing: `Estamos preparando tu pedido #${n}. Te avisamos cuando esté listo.`,
    ready_for_pickup: `Tu pedido #${n} ya está listo: puedes pasar a retirarlo por el taller.`,
    shipped: `Tu pedido #${n} ya salió y va en camino.`,
    delivered: `Tu pedido #${n} ya fue entregado. ¡Gracias por tu compra!`,
    cancelled: `Tu pedido #${n} se canceló. Si necesitas algo, aquí estamos.`,
  };
  return [head, body[input.status] ?? `Te escribimos por tu pedido #${n}.`].join('\n');
}

/** Respuesta a una cita según su estado. */
export function appointmentReplyDraft(input: { name: string; number: number; service: string; when: string; status: string }): string {
  const head = greet(input.name);
  const body: Record<string, string> = {
    requested: `Recibimos tu solicitud de cita #${input.number} (${input.service}) y la estamos confirmando.`,
    confirmed: `Tu cita #${input.number} (${input.service}) está confirmada para ${input.when}. ¡Te esperamos!`,
    in_progress: `Ya estamos trabajando en tu vehículo (cita #${input.number}).`,
    done: `Tu servicio (cita #${input.number}) quedó listo. ¡Gracias!`,
    cancelled: `Tu cita #${input.number} se canceló. Si quieres, la reprogramamos.`,
    no_show: `No pudimos atenderte en tu cita #${input.number}. Si quieres, la reprogramamos.`,
  };
  return [head, body[input.status] ?? `Te escribimos por tu cita #${input.number}.`].join('\n');
}

/** Con el enlace para agendar, ya con el servicio elegido. */
export function scheduleLinkDraft(input: { name: string; code: string; link: string }): string {
  return [greet(input.name), `Sobre tu solicitud ${input.code}: puedes agendar tu cita aquí, con el servicio ya elegido:`, input.link].join('\n');
}

export function waLinkFor(phone: string, message: string): string {
  return buildWaLink(phone, message);
}
