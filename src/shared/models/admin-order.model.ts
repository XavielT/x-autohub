import { OrderStatus } from '../../core/supabase/database.types';
import { GeoConfidence } from './maps.model';
import { OrderFulfillment, OrderHistoryEntry } from './order.model';

export interface AdminOrderItem {
  id: number;
  /** Copia del nombre al momento de comprar, no el actual del catálogo. */
  name: string;
  unitPrice: number;
  quantity: number;
}

/** Un pedido con todo lo que el panel necesita para gestionarlo. */
export interface AdminOrderModel {
  id: string;
  /** El número que se le dice al cliente: #1042. */
  orderNumber: number;
  fulfillmentType: OrderFulfillment;
  province?: string;
  /** Ruta del comprobante en el bucket privado, o `null` si no subió. */
  proofPath: string | null;
  paymentConfirmedAt: Date | null;
  whatsappOpenedAt: Date | null;
  wantsInstallation: boolean;
  history: OrderHistoryEntry[];
  contactEmail: string;
  contactPhone?: string;
  fullName: string;
  addressLine1: string;
  city?: string;
  /** El punto de entrega, si Google o la IA ubicaron la dirección (`orders.shipping_geo`). Solo sirve para abrir Maps. */
  geo?: { lat: number; lng: number; placeId: string | null; confidence: GeoConfidence };
  shippingOptionId: string;
  paymentMethodId: string;
  orderNotes?: string;
  subtotal: number;
  shippingPrice: number;
  discount: number;
  couponCode: string | null;
  total: number;
  status: OrderStatus;
  /** Compra sin cuenta: `user_id` nulo. Está permitido a propósito. */
  isGuest: boolean;
  createdAt: Date;
  items: AdminOrderItem[];
}

/** Los estados en el orden en que avanza un pedido, para los filtros. */
export const ORDER_STATUS_FLOW: readonly { value: OrderStatus; label: string }[] = [
  { value: 'awaiting_payment', label: 'Esperando pago' },
  { value: 'paid', label: 'Pagado' },
  { value: 'preparing', label: 'Preparando' },
  { value: 'shipped', label: 'Enviado' },
  { value: 'ready_for_pickup', label: 'Listo para retirar' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
  // Los pedidos anteriores a la 0018 que nadie ha movido.
  { value: 'pending', label: 'Pendiente (anterior)' },
];

/** El texto del botón que lleva un pedido a cada estado. */
export const ORDER_ACTION_LABELS: Readonly<Record<OrderStatus, string>> = {
  pending: 'Volver a pendiente',
  awaiting_payment: 'Esperar el pago',
  paid: 'Confirmar el pago',
  preparing: 'Empezar a preparar',
  shipped: 'Marcar como enviado',
  ready_for_pickup: 'Listo para retirar',
  delivered: 'Marcar como entregado',
  cancelled: 'Cancelar el pedido',
};
