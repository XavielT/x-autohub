import { OrderFulfillmentDb, OrderStatus } from '../../core/supabase/database.types';

export type { OrderStatus };
export type OrderFulfillment = OrderFulfillmentDb;

/** Una línea de un pedido, con el nombre y el precio congelados al comprar. */
export interface OrderLine {
  name: string;
  unitPrice: number;
  quantity: number;
}

/** Un cambio de estado, para la línea de tiempo. */
export interface OrderHistoryEntry {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  /** La escribe quien cambia el estado y **la ve el cliente**. */
  note: string | null;
  createdAt: Date;
}

/**
 * El pedido tal como lo ve /pedido/:id (`get_order()`, migración 0018).
 *
 * No trae nada personal —ni correo, ni teléfono, ni dirección—: la página es
 * pública por id, y el id es la llave.
 */
export interface OrderView {
  id: string;
  /** El número que se le dice al cliente: #1042. */
  orderNumber: number;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  paymentMethodId: string;
  wantsInstallation: boolean;
  subtotal: number;
  shippingPrice: number;
  total: number;
  createdAt: Date;
  /** Si ya subió comprobante. El archivo en sí no lo ve el cliente. */
  hasProof: boolean;
  whatsappOpenedAt: Date | null;
  paymentConfirmedAt: Date | null;
  /** El servicio de instalación del primer producto instalable, si lo hay. */
  installationServiceId: number | null;
  items: OrderLine[];
  history: OrderHistoryEntry[];
}

/** Lo que devuelve `create_order()`: **lo que calculó Postgres**, que es lo que se muestra. */
export interface CreatedOrder {
  id: string;
  orderNumber: number;
  subtotal: number;
  shippingPrice: number;
  total: number;
}

/** Una cuenta bancaria para transferir. Sale de `site_settings.bank_accounts`. */
export interface BankAccount {
  bank: string;
  holder: string;
  number: string;
  /** "Corriente", "Ahorro"… */
  type: string;
  /**
   * Valor de ejemplo que dejó la migración. El sitio público **no** lo muestra
   * como si fuera una cuenta real; el panel sí, marcado.
   */
  isExample: boolean;
}

/** Dónde se retira un pedido. Sale de `site_settings.pickup_address`. */
export interface PickupAddress {
  address: string;
  hours: string;
  isExample: boolean;
}

/** Lo máximo que pesa un comprobante, igual que el límite del bucket. */
export const PROOF_MAX_BYTES = 10 * 1024 * 1024;
