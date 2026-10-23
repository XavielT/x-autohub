import { OrderFulfillment } from './order.model';

/** Opciones de envío: salen de la tabla `shipping_options`, no del código. */
export interface CheckoutShippingOption {
  id: string;
  label: string;
  description: string;
  price: number;
  etaLabel: string;
}

/**
 * Métodos de pago activos (`payment_methods`). Solo llegan los que se pueden
 * usar: la tarjeta y Mercado Pago están desactivados hasta que haya pasarela.
 */
export interface CheckoutPaymentMethodOption {
  id: string;
  label: string;
  description: string;
}

/** Lo que el checkout le manda a `create_order()`. El precio y el envío no van: los pone Postgres. */
export interface CheckoutSubmitPayload {
  contactEmail: string;
  contactPhone: string;
  fullName: string;
  /** Vacío en un retiro en el taller. */
  addressLine1: string;
  city: string;
  postalCode: string;
  /** Una de las 32 provincias. Vacía en un retiro. */
  province: string;
  fulfillment: OrderFulfillment;
  shippingOptionId: string;
  paymentMethodId: string;
  wantsInstallation: boolean;
  orderNotes?: string;
  /** El código del cupón, si puso uno. El descuento lo calcula Postgres; aquí solo va el código. */
  couponCode?: string;
}

/** El id de la opción de envío que significa "retiro en el taller". */
export const PICKUP_OPTION_ID = 'pickup';
