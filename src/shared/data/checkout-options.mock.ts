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
    description: 'Coordinación por WhatsApp / correo al confirmar el pedido.',
    price: 0,
    etaLabel: 'A coordinar',
  },
];

export const CHECKOUT_PAYMENT_METHODS_MOCK: CheckoutPaymentMethodOption[] = [
  {
    id: 'card',
    label: 'Tarjeta débito / crédito',
    description: 'Visa, Mastercard, American Express (integración pendiente).',
  },
  {
    id: 'transfer',
    label: 'Transferencia bancaria',
    description: 'Recibirás los datos al confirmar el pedido.',
  },
  {
    id: 'mercadopago',
    label: 'Mercado Pago',
    description: 'Wallet y cuotas según disponibilidad (integración pendiente).',
  },
];
