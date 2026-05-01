/** Opciones de envío — sustituir por respuesta de API cuando exista checkout real. */
export interface CheckoutShippingOption {
  id: string;
  label: string;
  description: string;
  price: number;
  etaLabel: string;
}

/** Métodos de pago mostrados en UI — el id puede mapearse a pasarela real más adelante. */
export interface CheckoutPaymentMethodOption {
  id: string;
  label: string;
  description: string;
}

/** Payload típico hacia backend — hoy solo se usa en cliente / demo. */
export interface CheckoutSubmitPayload {
  contactEmail: string;
  contactPhone: string;
  fullName: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  shippingOptionId: string;
  paymentMethodId: string;
  orderNotes?: string;
}
