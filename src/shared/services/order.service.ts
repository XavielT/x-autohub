import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, switchMap, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toOrderView, toUserOrder } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { CheckoutSubmitPayload } from '../models/checkout.model';
import {
  CreatedOrder,
  OrderHistoryEntry,
  OrderView,
} from '../models/order.model';
import { UserOrderModel } from '../models/user-order.model';
import { CHECKOUT_SHIPPING_OPTIONS_MOCK } from '../data/checkout-options.mock';
import { MOCK_ORDERS_STORAGE_KEY } from '../data/mock-orders-usage';
import { CartItem, lineName, lineStock } from './cart.service';
import { AuthService } from './auth.service';
import { CouponService } from './coupon.service';
import { StorageService } from './storage.service';

/** Dónde guarda el modo simulado sus pedidos entre recargas. */
const MOCK_STORAGE_KEY = MOCK_ORDERS_STORAGE_KEY;

/** Un pedido del modo simulado: el mismo que ve /pedido/:id, y de quién es. */
interface MockOrder {
  /** `null` = invitado. `'demo'` = de ejemplo, lo ve cualquiera con sesión. */
  userId: string | null;
  /** El correo con el que compró: el límite de un cupón "por cliente" lo usa si no hay cuenta. */
  email?: string;
  view: OrderView;
}

/**
 * Pedidos de la tienda.
 *
 * Se permite comprar sin cuenta: pedir registro antes de pagar es una barrera
 * innecesaria. Ver docs/ROADMAP.md.
 *
 * Todo pasa por funciones de Postgres (migraciones 0005 y 0018), no por inserts
 * directos. Las razones, verificadas contra la base real:
 *
 * 1. **El precio y el envío los pone el servidor.** El navegador solo manda qué
 *    pieza y cuántas; un cliente manipulado no puede comprar a RD$ 1.
 *
 * 2. **El checkout de invitado funciona.** Un pedido con `user_id` nulo no lo
 *    puede leer nadie por RLS, así que ni el insert ni su `select` posterior
 *    habrían funcionado desde el navegador. `get_order()` es la forma de leerlo:
 *    quien tiene el id (un uuid imposible de adivinar) ve su pedido.
 *
 * 3. **El stock se descuenta en la misma transacción** que crea el pedido, y se
 *    devuelve al cancelarlo. Ver `create_order()` y `set_order_status()`.
 *
 * Lo que `create` devuelve **es lo que calculó Postgres**, y es lo que se
 * muestra: el navegador no recalcula el total.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(StorageService);
  private readonly coupons = inject(CouponService);

  /**
   * Los pedidos del modo simulado. Viven en `localStorage` y no solo en memoria:
   * `/pedido/:id` se abre tras una navegación y se puede recargar, y un pedido
   * que desaparece con el F5 haría parecer que la página no funciona. Es la misma
   * razón por la que `SiteSettingsService` guarda sus ajustes ahí.
   */
  private mockOrders: MockOrder[] = readMockOrders();

  /** Crea el pedido. Devuelve lo que calculó Postgres. */
  create(payload: CheckoutSubmitPayload, items: readonly CartItem[]): Observable<CreatedOrder> {
    if (this.supabase.shouldUseMockData()) {
      return this.createMock(payload, items);
    }

    return from(
      this.supabase.db.rpc('create_order', {
        p_contact_email: payload.contactEmail,
        p_full_name: payload.fullName,
        p_address_line1: payload.addressLine1,
        p_shipping_option_id: payload.shippingOptionId,
        p_payment_method_id: payload.paymentMethodId,
        p_items: items.map((i) => ({ part_id: i.part.id, quantity: i.quantity, variant_id: i.variant?.id ?? null })),
        p_contact_phone: payload.contactPhone || null,
        p_city: payload.city || null,
        p_postal_code: payload.postalCode || null,
        p_order_notes: payload.orderNotes ?? null,
        p_fulfillment_type: payload.fulfillment,
        p_province: payload.province || null,
        p_wants_installation: payload.wantsInstallation,
        p_coupon_code: payload.couponCode?.trim() || null,
      }),
    ).pipe(
      map((res) => unwrap(res)),
      map((rows) => {
        // La función devuelve una tabla de una sola fila.
        const order = Array.isArray(rows) ? rows[0] : rows;
        if (!order) {
          throw new Error('No pudimos registrar tu pedido. Intenta de nuevo.');
        }
        return {
          id: order.id,
          orderNumber: order.order_number,
          subtotal: Number(order.subtotal),
          shippingPrice: Number(order.shipping_price),
          discount: Number(order.discount),
          couponCode: order.coupon_code,
          total: Number(order.total),
        };
      }),
    );
  }

  /** El pedido de /pedido/:id, o `null` si ese id no existe. */
  getOrder(id: string): Observable<OrderView | null> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockOrders.find((o) => o.view.id === id)?.view ?? null);
    }

    return from(this.supabase.db.rpc('get_order', { p_order_id: id })).pipe(
      map((res) => {
        if (res.error) {
          // Un id que no es un uuid ni siquiera llega a la función: para quien
          // abrió el enlace es lo mismo que un pedido que no existe.
          if (res.error.code === '22P02') return null;
          unwrap({ data: null, error: res.error });
        }
        return res.data ? toOrderView(res.data) : null;
      }),
    );
  }

  /**
   * Los pedidos de quien tiene la sesión abierta, del más nuevo al más viejo. Los
   * de invitado no aparecen aquí ni pueden: no tienen dueño.
   */
  getMyOrders(): Observable<UserOrderModel[]> {
    if (this.supabase.shouldUseMockData()) {
      const userId = this.auth.user()?.id ?? null;
      return of(
        this.mockOrders
          .filter((o) => o.userId === 'demo' || (userId !== null && o.userId === userId))
          .map(({ view }) => ({
            id: view.id,
            orderNumber: view.orderNumber,
            createdAt: view.createdAt,
            itemCount: view.items.reduce((acc, i) => acc + i.quantity, 0),
            total: view.total,
            status: view.status,
            fulfillment: view.fulfillment,
            paymentMethodId: view.paymentMethodId,
            hasProof: view.hasProof,
            wantsInstallation: view.wantsInstallation,
          }))
          .sort((a, b) => +b.createdAt - +a.createdAt),
      );
    }

    return from(this.supabase.db.rpc('my_orders')).pipe(
      map((res) => unwrap(res).map(toUserOrder)),
    );
  }

  /**
   * Sube el comprobante y lo deja registrado en el pedido. Son dos pasos y los dos
   * pueden fallar: primero el archivo al bucket privado (en la carpeta del
   * pedido), y luego `attach_payment_proof()`, que comprueba que el archivo esté
   * ahí y que el pedido todavía lo acepte.
   *
   * El navegador no puede escribir `payment_proof_url` por su cuenta: es la
   * función la que apunta el pedido al archivo.
   */
  uploadProof(orderId: string, file: File): Observable<void> {
    const invalid = this.storage.validateProof(file);
    if (invalid) return throwError(() => new Error(invalid));

    return this.storage.uploadPaymentProof(file, orderId).pipe(
      switchMap((path) => {
        if (this.supabase.shouldUseMockData()) {
          this.updateMock(orderId, (view) => ({ ...view, hasProof: true }));
          return of(undefined);
        }

        return from(
          this.supabase.db.rpc('attach_payment_proof', { p_order_id: orderId, p_path: path }),
        ).pipe(
          map((res) => {
            if (res.error) unwrap({ data: null, error: res.error });
          }),
        );
      }),
    );
  }

  /** Deja constancia de que el cliente abrió WhatsApp. No bloquea nada si falla. */
  markWhatsAppOpened(orderId: string): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.updateMock(orderId, (view) => ({ ...view, whatsappOpenedAt: view.whatsappOpenedAt ?? new Date() }));
      return of(undefined);
    }

    return from(this.supabase.db.rpc('mark_whatsapp_opened', { p_order_id: orderId })).pipe(
      map((res) => {
        if (res.error) console.error('[supabase]', res.error);
      }),
    );
  }

  // --- Modo simulado ---------------------------------------------------------

  /**
   * Hace lo mismo que `create_order()`, con los mismos mensajes: valida el stock
   * de lo que es de inventario propio, calcula el envío con la opción elegida y
   * deja el pedido en `awaiting_payment`. Si el modo simulado fuera más permisivo
   * que la base, el checkout "funcionaría" en desarrollo y fallaría en producción.
   */
  private createMock(payload: CheckoutSubmitPayload, items: readonly CartItem[]): Observable<CreatedOrder> {
    if (items.length === 0) {
      return throwError(() => new Error('Un pedido necesita al menos una pieza.'));
    }

    for (const item of items) {
      const { part, quantity, variant } = item;

      // Las opciones, igual que `create_order()`: con opciones hay que elegir una.
      if (part.hasVariants && !variant) {
        return throwError(() => new Error(`Elige una opcion de "${part.name}" antes de comprarlo.`));
      }
      if (!part.hasVariants && variant) {
        return throwError(() => new Error(`La opcion elegida de "${part.name}" ya no esta disponible.`));
      }

      if (part.fulfillment !== 'stock') continue;
      const stock = lineStock(item);
      // Con opción, el mensaje la nombra: "Alfombras (Negro)".
      const label = variant ? `${part.name} (${variant.name})` : part.name;
      if (stock <= 0) {
        return throwError(() => new Error(`Se agoto "${label}". Quitala del carrito para continuar.`));
      }
      if (quantity > stock) {
        return throwError(
          () => new Error(`De "${label}" solo quedan ${stock} y pediste ${quantity}. Ajusta la cantidad.`),
        );
      }
    }

    const shipping = CHECKOUT_SHIPPING_OPTIONS_MOCK.find((o) => o.id === payload.shippingOptionId);
    if (!shipping) return throwError(() => new Error('Metodo de envio no valido.'));

    const subtotal = items.reduce((acc, i) => acc + i.part.price * i.quantity, 0);

    // El cupón, igual que `create_order()`: se valida aquí y no se confía en lo que enseñó
    // el checkout. Un cupón que falla rechaza el pedido entero.
    let discount = 0;
    let couponCode: string | null = null;
    if (payload.couponCode?.trim()) {
      try {
        const resolved = this.coupons.resolveMock(payload.couponCode, subtotal, shipping.price, payload.contactEmail);
        discount = resolved.discount;
        couponCode = resolved.coupon.code;
      } catch (error) {
        return throwError(() => error);
      }
    }

    const orderNumber = Math.max(1000, ...this.mockOrders.map((o) => o.view.orderNumber)) + 1;
    const createdAt = new Date();
    const status = 'awaiting_payment' as const;

    const view: OrderView = {
      id: `demo-${Date.now()}-${orderNumber}`,
      orderNumber,
      status,
      fulfillment: payload.fulfillment,
      paymentMethodId: payload.paymentMethodId,
      wantsInstallation: payload.wantsInstallation && items.some((i) => i.part.installable),
      subtotal,
      shippingPrice: shipping.price,
      discount,
      couponCode,
      total: subtotal + shipping.price - discount,
      createdAt,
      hasProof: false,
      whatsappOpenedAt: null,
      paymentConfirmedAt: null,
      installationServiceId: items.find((i) => i.part.installable)?.part.installationServiceId ?? null,
      items: items.map((i) => ({ name: lineName(i), unitPrice: i.part.price, quantity: i.quantity })),
      history: [{ fromStatus: null, toStatus: status, note: null, createdAt }],
    };

    this.mockOrders = [
      { userId: this.auth.user()?.id ?? null, email: payload.contactEmail.trim(), view },
      ...this.mockOrders,
    ];
    writeMockOrders(this.mockOrders);

    return of({
      id: view.id,
      orderNumber,
      subtotal: view.subtotal,
      shippingPrice: view.shippingPrice,
      discount: view.discount,
      couponCode: view.couponCode,
      total: view.total,
    });
  }

  private updateMock(orderId: string, change: (view: OrderView) => OrderView): void {
    this.mockOrders = this.mockOrders.map((o) =>
      o.view.id === orderId ? { ...o, view: change(o.view) } : o,
    );
    writeMockOrders(this.mockOrders);
  }
}

// --- Persistencia del modo simulado ----------------------------------------------

const DEMO_ORDERS = (): MockOrder[] => {
  const history = (status: OrderView['status'], at: string): OrderHistoryEntry[] => [
    { fromStatus: null, toStatus: 'awaiting_payment', note: null, createdAt: new Date(at) },
    ...(status === 'awaiting_payment' ? [] : [{ fromStatus: 'awaiting_payment' as const, toStatus: status, note: null, createdAt: new Date(at) }]),
  ];

  return [
    {
      userId: 'demo',
      view: {
        id: 'demo-1001',
        orderNumber: 1001,
        status: 'delivered',
        fulfillment: 'shipping',
        paymentMethodId: 'transfer',
        wantsInstallation: false,
        subtotal: 15800,
        shippingPrice: 0,
        discount: 0,
        couponCode: null,
        total: 15800,
        createdAt: new Date('2026-08-09T15:20:00Z'),
        hasProof: true,
        whatsappOpenedAt: null,
        paymentConfirmedAt: new Date('2026-08-09T16:00:00Z'),
        installationServiceId: null,
        items: [
          { name: 'Disco ventilado GTR 355mm', unitPrice: 12950, quantity: 1 },
          { name: 'Filtro de aire de alto flujo', unitPrice: 2850, quantity: 1 },
        ],
        history: history('delivered', '2026-08-09T15:20:00Z'),
      },
    },
    {
      userId: 'demo',
      view: {
        id: 'demo-1002',
        orderNumber: 1002,
        status: 'paid',
        fulfillment: 'pickup',
        paymentMethodId: 'whatsapp',
        wantsInstallation: false,
        subtotal: 3300,
        shippingPrice: 0,
        discount: 0,
        couponCode: null,
        total: 3300,
        createdAt: new Date('2026-08-12T11:05:00Z'),
        hasProof: false,
        whatsappOpenedAt: new Date('2026-08-12T11:06:00Z'),
        paymentConfirmedAt: new Date('2026-08-12T12:00:00Z'),
        installationServiceId: null,
        items: [{ name: 'Alfombras all-weather', unitPrice: 3300, quantity: 1 }],
        history: history('paid', '2026-08-12T11:05:00Z'),
      },
    },
  ];
};

/** Las fechas viajan como texto en JSON; esto las vuelve `Date`. */
const DATE_FIELDS = new Set(['createdAt', 'whatsappOpenedAt', 'paymentConfirmedAt']);

function readMockOrders(): MockOrder[] {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return DEMO_ORDERS();

    const parsed = JSON.parse(raw, (key, value) =>
      DATE_FIELDS.has(key) && typeof value === 'string' ? new Date(value) : value,
    ) as MockOrder[];

    return Array.isArray(parsed) ? parsed : DEMO_ORDERS();
  } catch {
    // Modo privado, storage lleno o JSON corrupto: los pedidos de ejemplo.
    return DEMO_ORDERS();
  }
}

function writeMockOrders(orders: MockOrder[]): void {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(orders));
  } catch {
    // Sin storage el pedido vive lo que dure la pestaña.
  }
}
