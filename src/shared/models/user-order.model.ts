import { OrderStatus } from '../../core/supabase/database.types';
import { OrderFulfillment } from './order.model';

/**
 * Resumen de un pedido, como lo ve su dueño en "Mis pedidos".
 *
 * Es una vista reducida a propósito: la lista solo muestra número, fecha,
 * cantidad de artículos, total y estado. El detalle vive en /pedido/:id.
 */
export interface UserOrderModel {
  id: string;
  /** El número que se le dice al cliente: #1042. */
  orderNumber: number;
  createdAt: Date;
  /** Suma de las cantidades, no el número de líneas. */
  itemCount: number;
  total: number;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  paymentMethodId: string;
  /** Si ya subió su comprobante de transferencia. */
  hasProof: boolean;
  wantsInstallation: boolean;
}

/**
 * ¿Le falta al cliente subir el comprobante? Es lo que se resalta en la lista:
 * un pedido por transferencia, sin pagar y sin comprobante, está esperando a
 * quien lo hizo.
 */
export function needsProof(order: Pick<UserOrderModel, 'status' | 'paymentMethodId' | 'hasProof'>): boolean {
  return (
    order.paymentMethodId === 'transfer' &&
    (order.status === 'awaiting_payment' || order.status === 'pending') &&
    !order.hasProof
  );
}

/** Etiqueta en español de cada estado, para mostrarla sin repetir el mapa. */
export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending: 'Pendiente',
  awaiting_payment: 'Esperando pago',
  paid: 'Pagado',
  preparing: 'Preparando',
  shipped: 'Enviado',
  ready_for_pickup: 'Listo para retirar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};
