import { Injectable } from '@angular/core';
import {
  CheckoutPaymentMethodOption,
  CheckoutShippingOption,
} from '../models/checkout.model';
import {
  CHECKOUT_PAYMENT_METHODS_MOCK,
  CHECKOUT_SHIPPING_OPTIONS_MOCK,
} from '../data/checkout-options.mock';

@Injectable({ providedIn: 'root' })
export class CheckoutOptionsService {
  /**
   * Hoy devuelve mocks locales. Sustituir por HttpClient cuando exista API, p. ej.:
   * return this.http.get<CheckoutShippingOption[]>('/api/checkout/shipping-options');
   */
  getShippingOptions(): CheckoutShippingOption[] {
    return [...CHECKOUT_SHIPPING_OPTIONS_MOCK];
  }

  getPaymentMethodOptions(): CheckoutPaymentMethodOption[] {
    return [...CHECKOUT_PAYMENT_METHODS_MOCK];
  }
}
