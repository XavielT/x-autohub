import { CouponTypeDb } from '../../core/supabase/database.types';

/**
 * Cupones y descuentos (después del pivote; migración 0022).
 */

export type CouponType = CouponTypeDb;

/** Un cupón tal como lo gestiona el panel. El público nunca recibe esto: no puede leer la tabla. */
export interface CouponModel {
  id: number;
  /** Siempre en mayúsculas. */
  code: string;
  description: string;
  type: CouponType;
  /** Porcentaje (1 a 100) o monto en RD$. Nulo en el envío gratis. */
  value: number | null;
  /** Compra mínima (subtotal) para poder usarlo. 0 = sin mínimo. */
  minSubtotal: number;
  /** Tope del descuento en RD$ (solo un porcentaje). Nulo = sin tope. */
  maxDiscount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Usos en total. Nulo = sin límite. */
  maxUses: number | null;
  /** Usos por cliente (su cuenta o su correo). Nulo = sin límite. */
  maxUsesPerCustomer: number | null;
  isActive: boolean;
  createdAt: Date;
  /** Pedidos que lo usaron y no están cancelados (los cancelados devuelven el uso). */
  uses: number;
}

/** El formulario del panel. Las fechas son el texto de un `<input type="datetime-local">`. */
export interface CouponDraft {
  id: number | null;
  code: string;
  description: string;
  type: CouponType;
  value: number | null;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: string;
  endsAt: string;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  isActive: boolean;
}

/** Lo que responde `validate_coupon()`: cuánto descontaría ese cupón con ese carrito. */
export interface CouponValidation {
  code: string;
  type: CouponType;
  /** En RD$. Nunca deja el total en negativo. */
  discount: number;
  description: string;
}

export const COUPON_TYPES: readonly CouponType[] = ['percent', 'fixed', 'free_shipping'];

export const COUPON_TYPE_LABELS: Readonly<Record<CouponType, string>> = {
  percent: 'Porcentaje',
  fixed: 'Monto fijo',
  free_shipping: 'Envío gratis',
};

/** El formato que acepta la tabla: mayúsculas, números, guion y guion bajo; de 4 a 32. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

/** Lo que escribe el cliente → como se guarda: sin espacios y en mayúsculas. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/** "10 % de descuento", "RD$ 500 de descuento", "Envío gratis". */
export function describeCouponValue(type: CouponType, value: number | null): string {
  switch (type) {
    case 'percent':
      return `${value ?? 0} % de descuento`;
    case 'fixed':
      return `RD$ ${(value ?? 0).toLocaleString('es-DO')} de descuento`;
    default:
      return 'Envío gratis';
  }
}
