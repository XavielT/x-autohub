import { OrderStatus } from '../../core/supabase/database.types';

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
  contactEmail: string;
  contactPhone?: string;
  fullName: string;
  addressLine1: string;
  city?: string;
  shippingOptionId: string;
  paymentMethodId: string;
  orderNotes?: string;
  subtotal: number;
  shippingPrice: number;
  total: number;
  status: OrderStatus;
  /** Compra sin cuenta: `user_id` nulo. Está permitido a propósito. */
  isGuest: boolean;
  createdAt: Date;
  items: AdminOrderItem[];
}

/** Los estados en el orden en que avanza un pedido, para los selectores. */
export const ORDER_STATUS_FLOW: readonly { value: OrderStatus; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'shipped', label: 'Enviado' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'cancelled', label: 'Cancelado' },
];
