import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { unwrap } from '../../core/supabase/supabase-error';
import { CheckoutSubmitPayload } from '../models/checkout.model';
import { CartItem } from './cart.service';
import { UserOrderModel } from '../models/user-order.model';

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

  /**
   * Pedidos simulados, para que la actividad del perfil tenga algo que mostrar
   * sin backend.
   *
   * En modo real esto no se usa: los pedidos salen de la base. Aquí hacen falta
   * porque `submit()` en modo simulado solo devolvía `{ id, total }` sin guardar
   * nada, así que no existía historial que listar. Los dos sembrados dan
   * contenido al abrir el perfil por primera vez, y `submit()` añade los nuevos.
   */
  private mockOrders: UserOrderModel[] = [
    {
      id: 'demo-1001',
      createdAt: new Date('2026-08-09T15:20:00Z'),
      itemCount: 2,
      total: 15800,
      status: 'delivered',
    },
    {
      id: 'demo-1002',
      createdAt: new Date('2026-08-12T11:05:00Z'),
      itemCount: 1,
      total: 3300,
      status: 'paid',
    },
  ];

  /**
   * Los pedidos de un usuario, del mas nuevo al mas viejo.
   *
   * Solo los que tienen cuenta detras. Los de invitado (`user_id` nulo) no
   * aparecen aquí ni pueden: RLS los limita a `user_id = auth.uid()`, y para un
   * pedido sin dueño esa comparacion nunca es verdadera. Es coherente con que la
   * compra sin cuenta no deja rastro en ningún perfil.
   */
  getByUserId(userId: string): Observable<UserOrderModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        [...this.mockOrders].sort((a, b) => +b.createdAt - +a.createdAt),
      );
    }

    return from(
      this.supabase.db
        .from('orders')
        .select('id, total, status, created_at, order_items(quantity)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    ).pipe(
      map((res) =>
        unwrap(res).map((row) => ({
          id: row.id,
          createdAt: new Date(row.created_at),
          // La suma de cantidades, no el numero de lineas: dos unidades de la
          // misma pieza son dos articulos para quien mira su pedido.
          itemCount: (row.order_items ?? []).reduce((acc, i) => acc + i.quantity, 0),
          total: Number(row.total),
          status: row.status,
        })),
      ),
    );
  }

  submit(
    payload: CheckoutSubmitPayload,
    items: CartItem[],
    shippingPrice: number,
  ): Observable<OrderResult> {
    if (this.supabase.shouldUseMockData()) {
      const subtotal = items.reduce((acc, i) => acc + i.part.price * i.quantity, 0);
      const total = subtotal + shippingPrice;
      const created: UserOrderModel = {
        id: `demo-${Date.now()}`,
        createdAt: new Date(),
        itemCount: items.reduce((acc, i) => acc + i.quantity, 0),
        total,
        status: 'pending',
      };
      // Se guarda para que aparezca en la actividad del perfil, igual que en modo
      // real. Sin esto un pedido hecho con mocks no dejaba rastro en ningún lado.
      this.mockOrders = [created, ...this.mockOrders];
      return of({ id: created.id, total });
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
