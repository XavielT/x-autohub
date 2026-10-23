import {
  CheckoutPaymentMethodOption,
  CheckoutShippingOption,
} from '../models/checkout.model';

export const CHECKOUT_SHIPPING_OPTIONS_MOCK: CheckoutShippingOption[] = [
  {
    id: 'standard',
    label: 'Estándar',
    description: 'Entrega en 5–7 días hábiles.',
    price: 0,
    etaLabel: '5–7 días',
  },
  {
    id: 'express',
    label: 'Express',
    description: 'Prioridad en almacén y envío acelerado.',
    price: 450,
    etaLabel: '2–3 días',
  },
  {
    id: 'pickup',
    label: 'Retiro en hub',
    description: 'Retira tu pedido en el taller. Te avisamos cuando esté listo.',
    price: 0,
    etaLabel: 'A coordinar',
  },
];

/**
 * Solo los métodos **activos**, que es lo que `CheckoutOptionsService` pide. La
 * tarjeta y Mercado Pago siguen en la base pero desactivados (migración 0018):
 * no hay pasarela en esta ronda.
 */
export const CHECKOUT_PAYMENT_METHODS_MOCK: CheckoutPaymentMethodOption[] = [
  {
    id: 'transfer',
    label: 'Transferencia bancaria',
    description: 'Transfieres y subes el comprobante; confirmamos tu pago y preparamos el pedido.',
  },
  {
    id: 'whatsapp',
    label: 'Pedir por WhatsApp',
    description: 'Cerramos el pedido y el pago por WhatsApp con nuestro equipo.',
  },
];
