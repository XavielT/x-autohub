import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toPaymentMethod, toShippingOption } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import {
  CheckoutPaymentMethodOption,
  CheckoutShippingOption,
} from '../models/checkout.model';
import {
  CHECKOUT_PAYMENT_METHODS_MOCK,
  CHECKOUT_SHIPPING_OPTIONS_MOCK,
} from '../data/checkout-options.mock';

/**
 * Opciones del checkout.
 *
 * Están en la base de datos para poder cambiar precios de envío o agregar un
 * método de pago sin volver a desplegar el frontend.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutOptionsService {
  private readonly supabase = inject(SupabaseService);

  getShippingOptions(): Observable<CheckoutShippingOption[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...CHECKOUT_SHIPPING_OPTIONS_MOCK]);
    }

    return from(
      this.supabase.db
        .from('shipping_options')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toShippingOption)));
  }

  getPaymentMethodOptions(): Observable<CheckoutPaymentMethodOption[]> {
    if (this.supabase.shouldUseMockData()) {
      return of([...CHECKOUT_PAYMENT_METHODS_MOCK]);
    }

    return from(
      this.supabase.db
        .from('payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toPaymentMethod)));
  }
}
