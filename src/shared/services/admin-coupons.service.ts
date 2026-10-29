import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toCoupon } from '../../core/supabase/mappers';
import { translateDbError, unwrap } from '../../core/supabase/supabase-error';
import { CouponDraft, CouponModel, normalizeCouponCode } from '../models/coupon.model';
import { mockCouponUsage } from '../data/mock-orders-usage';
import { validateCouponDraft } from '../utils/coupon-rules';
import { CouponService } from './coupon.service';

/** Una sola cadena literal: ver `PRODUCT_COLUMNS` en `product.service.ts`. */
const COUPON_COLUMNS =
  'id, code, description, discount_type, discount_value, min_subtotal, max_discount, starts_at, ends_at, max_uses, max_uses_per_customer, is_active, created_at';

const DUPLICATE_CODE = 'Ya hay un cupón con ese código.';

/**
 * Los cupones desde el panel (`/admin/cupones`): crear, editar, apagar y borrar.
 *
 * Escribir `coupons` es solo de un admin (RLS), y el navegador **solo** manda lo que el
 * formulario define: el descuento de cada pedido lo sigue calculando Postgres. Borrar un
 * cupón no borra sus pedidos: cada pedido guarda una copia del código.
 */
@Injectable({ providedIn: 'root' })
export class AdminCouponsService {
  private readonly supabase = inject(SupabaseService);
  private readonly coupons = inject(CouponService);

  /** Todos, del más nuevo al más viejo, con cuántas veces se usó cada uno. */
  getCoupons(): Observable<CouponModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        [...this.coupons.mockCoupons]
          .map((c) => ({ ...c, uses: mockCouponUsage(c.code, null, null).total }))
          .sort((a, b) => +b.createdAt - +a.createdAt || b.id - a.id),
      );
    }

    return forkJoin({
      rows: from(
        this.supabase.db.from('coupons').select(COUPON_COLUMNS).order('created_at', { ascending: false }),
      ).pipe(map((res) => unwrap(res))),
      usage: from(this.supabase.db.rpc('admin_coupon_usage')).pipe(map((res) => unwrap(res))),
    }).pipe(
      map(({ rows, usage }) => {
        const byId = new Map(usage.map((u) => [u.coupon_id, Number(u.uses)]));
        return rows.map((row) => toCoupon(row, byId.get(row.id) ?? 0));
      }),
    );
  }

  /** Crea o actualiza (según `draft.id`). Devuelve el cupón guardado. */
  saveCoupon(draft: CouponDraft): Observable<CouponModel> {
    const invalid = validateCouponDraft(draft);
    if (invalid) return throwError(() => new Error(invalid));

    const code = normalizeCouponCode(draft.code);
    const fields = {
      code,
      description: draft.description.trim(),
      discount_type: draft.type,
      // El envío gratis no lleva monto, y el tope solo tiene sentido en un porcentaje:
      // la base rechazaría lo primero y lo segundo quedaría como un dato muerto.
      discount_value: draft.type === 'free_shipping' ? null : draft.value,
      min_subtotal: draft.minSubtotal,
      max_discount: draft.type === 'percent' ? draft.maxDiscount : null,
      starts_at: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
      ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      max_uses: draft.maxUses,
      max_uses_per_customer: draft.maxUsesPerCustomer,
      is_active: draft.isActive,
    };

    if (this.supabase.shouldUseMockData()) {
      const list = this.coupons.mockCoupons;
      if (list.some((c) => c.code === code && c.id !== draft.id)) {
        return throwError(() => new Error(DUPLICATE_CODE));
      }

      const saved: CouponModel = {
        id: draft.id ?? Math.max(0, ...list.map((c) => c.id)) + 1,
        code,
        description: fields.description,
        type: draft.type,
        value: fields.discount_value,
        minSubtotal: fields.min_subtotal,
        maxDiscount: fields.max_discount,
        startsAt: fields.starts_at ? new Date(fields.starts_at) : null,
        endsAt: fields.ends_at ? new Date(fields.ends_at) : null,
        maxUses: fields.max_uses,
        maxUsesPerCustomer: fields.max_uses_per_customer,
        isActive: fields.is_active,
        createdAt: list.find((c) => c.id === draft.id)?.createdAt ?? new Date(),
        uses: 0,
      };

      this.coupons.saveMock(draft.id === null ? [...list, saved] : list.map((c) => (c.id === draft.id ? saved : c)));
      return of(saved);
    }

    const request =
      draft.id === null
        ? this.supabase.db.from('coupons').insert(fields).select(COUPON_COLUMNS).single()
        : this.supabase.db.from('coupons').update(fields).eq('id', draft.id).select(COUPON_COLUMNS).single();

    return from(request).pipe(
      map((res) => {
        // `unwrap` traduciría el 23505 a "Ese registro ya existe", que aquí no dice qué.
        if (res.error?.code === '23505') throw new Error(DUPLICATE_CODE);
        if (res.error) throw new Error(translateDbError(res.error));
        return toCoupon(res.data);
      }),
    );
  }

  /** Apagar o encender sin abrir el formulario. */
  setActive(coupon: CouponModel, isActive: boolean): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.coupons.saveMock(this.coupons.mockCoupons.map((c) => (c.id === coupon.id ? { ...c, isActive } : c)));
      return of(undefined);
    }

    return from(
      this.supabase.db.from('coupons').update({ is_active: isActive }).eq('id', coupon.id).select('id'),
    ).pipe(
      map((res) => {
        // RLS no falla cuando no deja escribir: simplemente no toca ninguna fila.
        if (unwrap(res).length === 0) throw new Error('No tienes permiso para hacer esto.');
      }),
    );
  }

  /** Borra el cupón. Sus pedidos se quedan, con el código que usaron. */
  deleteCoupon(coupon: CouponModel): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.coupons.saveMock(this.coupons.mockCoupons.filter((c) => c.id !== coupon.id));
      return of(undefined);
    }

    return from(this.supabase.db.from('coupons').delete().eq('id', coupon.id).select('id')).pipe(
      map((res) => {
        if (unwrap(res).length === 0) throw new Error('No tienes permiso para hacer esto.');
      }),
    );
  }
}
