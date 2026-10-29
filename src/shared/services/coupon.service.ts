import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toCouponValidation } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { CouponModel, CouponValidation, normalizeCouponCode } from '../models/coupon.model';
import { COUPONS_MOCK } from '../data/coupon.mock';
import { mockCouponUsage } from '../data/mock-orders-usage';
import { checkCoupon, findCoupon } from '../utils/coupon-rules';
import { AuthService } from './auth.service';

/** Dónde guarda el modo simulado sus cupones entre recargas (los edita el panel). */
const MOCK_STORAGE_KEY = 'x-autohub.mock-coupons';

/** Las fechas viajan como texto en JSON; esto las vuelve `Date`. */
const DATE_FIELDS = new Set(['startsAt', 'endsAt', 'createdAt']);

/**
 * Cupones, del lado de quien compra: **probar** un código con el carrito.
 *
 * Quien decide es Postgres. `validate_coupon()` dice cuánto descontaría y `create_order()`
 * lo vuelve a validar al crear el pedido (con la fila del cupón bloqueada), así que lo que
 * se ve aquí es una vista previa, no una promesa: puede haberse agotado entre un paso y
 * otro. El navegador **nunca** manda un monto, solo el código.
 *
 * Los códigos no se pueden listar: la tabla `coupons` solo la lee un admin. El modo
 * simulado guarda los suyos en `localStorage` para que lo que cambie `/admin/cupones` se
 * vea en el checkout; es de lo único que sabe `AdminCouponsService` (ver `mockCoupons`).
 */
@Injectable({ providedIn: 'root' })
export class CouponService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);

  /** Solo el modo simulado: los cupones de demostración, con lo que edite el panel. */
  mockCoupons: CouponModel[] = readMock();

  /** Cuánto descontaría `code` con ese subtotal y envío. Falla con el mensaje que ve el cliente. */
  validate(
    code: string,
    subtotal: number,
    shippingPrice: number,
    contactEmail?: string,
  ): Observable<CouponValidation> {
    if (this.supabase.shouldUseMockData()) {
      if (!(subtotal >= 0)) return throwError(() => new Error('El subtotal no es válido.'));
      try {
        const { coupon, discount } = this.resolveMock(code, subtotal, shippingPrice, contactEmail ?? null);
        return of({ code: coupon.code, type: coupon.type, discount, description: coupon.description });
      } catch (error) {
        return throwError(() => error);
      }
    }

    return from(
      this.supabase.db.rpc('validate_coupon', {
        p_code: code,
        p_subtotal: subtotal,
        p_shipping_price: shippingPrice,
        p_contact_email: contactEmail?.trim() || null,
      }),
    ).pipe(
      map((res) => {
        const row = unwrap(res)[0];
        if (!row) throw new Error('Ese cupón no existe o ya no está disponible.');
        return toCouponValidation(row);
      }),
    );
  }

  /**
   * Solo el modo simulado: lo mismo que hace `create_order()` con un cupón (el mismo
   * orden de comprobaciones, los mismos mensajes). Lo usa `OrderService.createMock()`.
   * Lanza con el mensaje del cliente.
   */
  resolveMock(
    code: string,
    subtotal: number,
    shipping: number,
    email: string | null,
  ): { coupon: CouponModel; discount: number } {
    if (normalizeCouponCode(code) === '') throw new Error('Escribe el código del cupón.');

    const coupon = findCoupon(this.mockCoupons, code);
    const userId = this.auth.user()?.id ?? null;
    const usage = mockCouponUsage(normalizeCouponCode(code), userId, email);
    return { coupon: coupon as CouponModel, discount: checkCoupon(coupon, { subtotal, shipping, usage }) };
  }

  /** Solo el modo simulado: el panel cambió la lista. */
  saveMock(coupons: CouponModel[]): void {
    this.mockCoupons = coupons;
    try {
      localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(coupons));
    } catch {
      // Sin storage el cambio vive lo que dure la pestaña.
    }
  }
}

function readMock(): CouponModel[] {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return COUPONS_MOCK.map((c) => ({ ...c }));

    const parsed = JSON.parse(raw, (key, value) =>
      DATE_FIELDS.has(key) && typeof value === 'string' ? new Date(value) : value,
    ) as CouponModel[];
    return Array.isArray(parsed) ? parsed : COUPONS_MOCK.map((c) => ({ ...c }));
  } catch {
    // Modo privado, storage lleno o JSON corrupto: los de demostración.
    return COUPONS_MOCK.map((c) => ({ ...c }));
  }
}
