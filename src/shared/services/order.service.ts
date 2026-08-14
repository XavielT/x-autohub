import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
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
 * Se permite comprar sin cuenta: pedir registro antes de pagar es una barrera
 * innecesaria. Ver docs/ROADMAP.md.
 *
 * Todo pasa por la función `create_order` de Postgres (migración 0005), no por
 * inserts directos. Dos razones, las dos verificadas contra la base real:
 *
 * 1. **El precio lo pone el servidor.** Antes el navegador enviaba `subtotal`,
 *    `total` y el `unit_price` de cada línea, y nada los contrastaba con el
 *    catálogo: un cliente manipulado podía comprar a RD$ 1. Ahora solo manda qué
 *    pieza y cuántas.
 *
 * 2. **El checkout de invitado funciona.** Un pedido con `user_id` nulo no lo
 *    puede leer nadie (RLS pide `user_id = auth.uid()`, y `NULL = NULL` no es
 *    verdadero). Eso hacía fallar tanto el `.select()` posterior al insert como
 *    el insert de `order_items`, cuyo `with check` consulta `orders`. El pedido
 *    se creaba igual, así que un reintento generaba duplicados.
 *
 * Además el pedido y sus líneas entran en una sola transacción: ya no existe el
 * estado a medias de "pedido sin líneas".
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly supabase = inject(SupabaseService);

  submit(
    payload: CheckoutSubmitPayload,
    items: CartItem[],
    shippingPrice: number,
  ): Observable<OrderResult> {
    if (this.supabase.shouldUseMockData()) {
      const subtotal = items.reduce((acc, i) => acc + i.part.price * i.quantity, 0);
      return of({ id: `demo-${Date.now()}`, total: subtotal + shippingPrice });
    }

    return from(
      this.supabase.db.rpc('create_order', {
        p_contact_email: payload.contactEmail,
        p_full_name: payload.fullName,
        p_address_line1: payload.addressLine1,
        p_shipping_option_id: payload.shippingOptionId,
        p_payment_method_id: payload.paymentMethodId,
        p_items: items.map((i) => ({ part_id: i.part.id, quantity: i.quantity })),
        p_contact_phone: payload.contactPhone || null,
        p_city: payload.city || null,
        p_postal_code: payload.postalCode || null,
        p_order_notes: payload.orderNotes ?? null,
      }),
    ).pipe(
      map((res) => unwrap(res)),
      map((rows) => {
        // La función devuelve una tabla de una sola fila.
        const order = Array.isArray(rows) ? rows[0] : rows;
        if (!order) {
          throw new Error('No pudimos registrar tu pedido. Intenta de nuevo.');
        }
        return { id: order.id, total: Number(order.total) };
      }),
    );
  }
}
