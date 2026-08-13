import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, switchMap } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { CheckoutSubmitPayload } from '../models/checkout.model';
import { CartItem } from './cart.service';

export interface OrderResult {
  id: string;
  total: number;
}

/**
 * Pedidos del catálogo.
 *
 * Se permite comprar sin cuenta (`user_id` nulo): pedir registro antes de pagar
 * es una barrera innecesaria. La política RLS acepta el insert cuando el
 * `user_id` es nulo o coincide con el usuario en sesión.
 *
 * `order_items` guarda copia del nombre y el precio: si la pieza sube de precio
 * mañana, el pedido histórico no cambia.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly supabase = inject(SupabaseService);

  submit(
    payload: CheckoutSubmitPayload,
    items: CartItem[],
    shippingPrice: number,
    userId: string | null,
  ): Observable<OrderResult> {
    const subtotal = items.reduce((acc, i) => acc + i.part.price * i.quantity, 0);
    const total = subtotal + shippingPrice;

    if (this.supabase.shouldUseMockData()) {
      return of({ id: `demo-${Date.now()}`, total });
    }

    return from(
      this.supabase.db
        .from('orders')
        .insert({
          user_id: userId,
          contact_email: payload.contactEmail,
          contact_phone: payload.contactPhone || null,
          full_name: payload.fullName,
          address_line1: payload.addressLine1,
          city: payload.city || null,
          postal_code: payload.postalCode || null,
          shipping_option_id: payload.shippingOptionId,
          payment_method_id: payload.paymentMethodId,
          order_notes: payload.orderNotes ?? null,
          subtotal,
          shipping_price: shippingPrice,
          total,
        })
        .select('id, total')
        .single(),
    ).pipe(
      map((res) => unwrap(res)),
      switchMap((order) =>
        from(
          this.supabase.db.from('order_items').insert(
            items.map((i) => ({
              order_id: order.id,
              part_id: i.part.id,
              name: i.part.name,
              unit_price: i.part.price,
              quantity: i.quantity,
            })),
          ),
        ).pipe(
          map((res) => {
            if (res.error) {
              console.error('[supabase] order_items', res.error);
              throw new Error('Registramos el pedido pero fallaron sus lineas. Contactanos.');
            }
            return { id: order.id, total: Number(order.total) };
          }),
        ),
      ),
    );
  }
}
