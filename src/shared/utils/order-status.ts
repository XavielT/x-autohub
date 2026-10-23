import { OrderStatus } from '../../core/supabase/database.types';
import { OrderFulfillment, OrderHistoryEntry } from '../models/order.model';
import { ORDER_STATUS_LABELS } from '../models/user-order.model';
import { storeWhatsAppLink } from './contact';

/**
 * El ciclo de un pedido, tal como lo hace cumplir `set_order_status()` en
 * Postgres (migración 0018). Esto es **un espejo para la pantalla**: el panel
 * solo ofrece los botones que la base aceptaría, pero quien manda es la base. Si
 * cambia una, cambia la otra, y `order-status.spec.ts` fija esta mitad.
 *
 *   pending           → awaiting_payment · paid · cancelled   (los pedidos viejos)
 *   awaiting_payment  → paid · cancelled
 *   paid              → preparing · cancelled
 *   preparing         → shipped (envío) · ready_for_pickup (retiro) · cancelled
 *   shipped           → delivered
 *   ready_for_pickup  → delivered
 *
 * El orden es estricto a propósito: no se salta `preparing`.
 */
export function nextStatuses(status: OrderStatus, fulfillment: OrderFulfillment): OrderStatus[] {
  switch (status) {
    case 'pending':
      return ['awaiting_payment', 'paid', 'cancelled'];
    case 'awaiting_payment':
      return ['paid', 'cancelled'];
    case 'paid':
      return ['preparing', 'cancelled'];
    case 'preparing':
      return [fulfillment === 'pickup' ? 'ready_for_pickup' : 'shipped', 'cancelled'];
    case 'shipped':
    case 'ready_for_pickup':
      return ['delivered'];
    case 'delivered':
    case 'cancelled':
      return [];
  }
}

export function canMoveTo(
  from: OrderStatus,
  to: OrderStatus,
  fulfillment: OrderFulfillment,
): boolean {
  return nextStatuses(from, fulfillment).includes(to);
}

/** Un pedido que ya no cambia. */
export function isFinalStatus(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

export type TimelineState = 'done' | 'current' | 'upcoming' | 'cancelled';

export interface TimelineStep {
  status: OrderStatus;
  label: string;
  state: TimelineState;
  /** Cuándo llegó el pedido a este paso, si ya llegó. */
  at: Date | null;
  /** La nota de quien lo movió, si la hubo. */
  note: string | null;
}

/** Los pasos de la línea de tiempo, en orden, según cómo se entrega. */
function stepsFor(fulfillment: OrderFulfillment): OrderStatus[] {
  return [
    'awaiting_payment',
    'paid',
    'preparing',
    fulfillment === 'pickup' ? 'ready_for_pickup' : 'shipped',
    'delivered',
  ];
}

const STEP_LABELS: Partial<Record<OrderStatus, string>> = {
  awaiting_payment: 'Esperando tu pago',
  paid: 'Pago confirmado',
  preparing: 'Preparando tu pedido',
  shipped: 'Enviado',
  ready_for_pickup: 'Listo para retirar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

/**
 * La línea de tiempo de un pedido: `awaiting_payment → paid → preparing →
 * shipped | ready_for_pickup → delivered`.
 *
 * Un pedido viejo en `pending` se pinta como el primer paso. Uno cancelado se
 * pinta con los pasos que **sí llegó a recorrer** (se leen del historial) y un
 * último paso "Cancelado": mostrarle "Enviado" en gris a quien canceló antes de
 * pagar sería mentir sobre lo que pasó.
 */
export function timelineFor(order: {
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  history: readonly OrderHistoryEntry[];
}): TimelineStep[] {
  const entry = (status: OrderStatus) => order.history.find((h) => h.toStatus === status) ?? null;
  const make = (status: OrderStatus, state: TimelineState): TimelineStep => ({
    status,
    label: STEP_LABELS[status] ?? ORDER_STATUS_LABELS[status],
    state,
    at: entry(status)?.createdAt ?? null,
    note: entry(status)?.note ?? null,
  });

  const steps = stepsFor(order.fulfillment);

  if (order.status === 'cancelled') {
    const reached = steps.filter((s) => entry(s) !== null);
    return [...reached.map((s) => make(s, 'done')), make('cancelled', 'cancelled')];
  }

  const current = steps.indexOf(order.status === 'pending' ? 'awaiting_payment' : order.status);

  return steps.map((status, i) => {
    // Entregado es el final: no queda "en curso", queda hecho.
    if (order.status === 'delivered' || i < current) return make(status, 'done');
    return make(status, i === current ? 'current' : 'upcoming');
  });
}

/** ¿Este pedido todavía puede recibir un comprobante de transferencia? */
export function acceptsProof(order: { status: OrderStatus; paymentMethodId: string }): boolean {
  return (
    order.paymentMethodId === 'transfer' &&
    (order.status === 'awaiting_payment' || order.status === 'pending')
  );
}

/**
 * El mensaje con el que se abre WhatsApp después de hacer el pedido. El pedido ya
 * existe en la base antes de abrirlo: así nunca se pierde aunque el cliente no
 * mande el mensaje.
 */
export function orderWhatsAppMessage(orderNumber: number, total: number, origin = 'xautohubrd.com'): string {
  const amount = new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 }).format(total);
  return `Hola, acabo de hacer el pedido #${orderNumber} por RD$ ${amount} en ${origin}. Quiero coordinar el pago y la entrega.`;
}

export function orderWhatsAppLink(orderNumber: number, total: number): string {
  return storeWhatsAppLink(orderWhatsAppMessage(orderNumber, total));
}
