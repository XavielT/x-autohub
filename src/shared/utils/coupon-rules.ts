import {
  COUPON_CODE_PATTERN,
  CouponDraft,
  CouponModel,
  CouponType,
  normalizeCouponCode,
} from '../models/coupon.model';

/**
 * Las reglas de un cupón, **espejo de `coupon_check()`** (migración 0022).
 *
 * Quien decide de verdad es Postgres: `validate_coupon()` y `create_order()`. Esto vive
 * aquí para el modo simulado (que no puede ser más permisivo que la base, o el checkout
 * "funciona" en desarrollo y falla en producción) y para validar el formulario del panel
 * antes de mandarlo. Los mensajes son los mismos, palabra por palabra.
 */

/** Lo que `coupon_check()` cuenta en la base: los usos que no están cancelados. */
export interface CouponUsage {
  /** Pedidos con este cupón, en total. */
  total: number;
  /** Pedidos de esta misma persona (su cuenta o su correo). */
  byCustomer: number;
}

/** El mismo mensaje para "no existe", "apagado" y "fuera de fecha": no se revela cuáles existen. */
export const COUPON_UNAVAILABLE = 'Ese cupón no existe o ya no está disponible.';

/** `3000` → `"3,000"`, como lo escribe la base (`to_char(.., 'FM999,999,990')`). */
const money = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Redondeo a centavos, como `round(x, 2)` de Postgres. */
const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Cuánto descuenta un cupón. Nunca deja el total en negativo: un porcentaje o un monto
 * se limitan al subtotal y el envío gratis al envío.
 */
export function couponDiscount(
  coupon: Pick<CouponModel, 'type' | 'value' | 'maxDiscount'>,
  subtotal: number,
  shipping: number,
): number {
  switch (coupon.type) {
    case 'percent': {
      const raw = cents((subtotal * (coupon.value ?? 0)) / 100);
      return Math.min(raw, coupon.maxDiscount ?? raw, subtotal);
    }
    case 'fixed':
      return Math.min(coupon.value ?? 0, subtotal);
    default:
      return Math.max(shipping, 0);
  }
}

/**
 * Valida un cupón contra un carrito y devuelve el descuento, o lanza con el mensaje que
 * vería el cliente. El orden de las comprobaciones es el de `coupon_check()`.
 */
export function checkCoupon(
  coupon: CouponModel | undefined,
  input: { subtotal: number; shipping: number; usage: CouponUsage; now?: Date },
): number {
  const now = input.now ?? new Date();

  if (
    !coupon ||
    !coupon.isActive ||
    (coupon.startsAt !== null && now < coupon.startsAt) ||
    (coupon.endsAt !== null && now >= coupon.endsAt)
  ) {
    throw new Error(COUPON_UNAVAILABLE);
  }

  if (input.subtotal < coupon.minSubtotal) {
    throw new Error(`Este cupón pide una compra de al menos RD$ ${money(coupon.minSubtotal)}.`);
  }

  if (coupon.maxUses !== null && input.usage.total >= coupon.maxUses) {
    throw new Error('Este cupón ya se agoto.');
  }

  if (coupon.maxUsesPerCustomer !== null && input.usage.byCustomer >= coupon.maxUsesPerCustomer) {
    throw new Error('Ya usaste este cupón.');
  }

  const discount = couponDiscount(coupon, input.subtotal, input.shipping);
  if (discount <= 0) throw new Error('Este cupón no aplica a tu pedido.');

  return discount;
}

/** Busca un cupón por lo que escribió el cliente (sin importar mayúsculas ni espacios). */
export function findCoupon(coupons: readonly CouponModel[], code: string): CouponModel | undefined {
  const wanted = normalizeCouponCode(code);
  return wanted === '' ? undefined : coupons.find((c) => c.code === wanted);
}

/**
 * Lo que la tabla `coupons` exige, para decirlo en el formulario antes de mandarlo. Espeja
 * sus `check`. Devuelve el mensaje, o `null` si está bien.
 */
export function validateCouponDraft(draft: CouponDraft): string | null {
  const code = normalizeCouponCode(draft.code);
  if (!COUPON_CODE_PATTERN.test(code)) {
    return 'El código lleva de 4 a 32 caracteres: letras, números, guion o guion bajo.';
  }

  const type: CouponType = draft.type;
  if (type === 'percent') {
    if (draft.value === null || !(draft.value > 0) || draft.value > 100) {
      return 'El porcentaje tiene que estar entre 1 y 100.';
    }
  } else if (type === 'fixed') {
    if (draft.value === null || !(draft.value > 0)) return 'Escribe el monto del descuento.';
  }

  if (draft.minSubtotal < 0) return 'La compra mínima no puede ser negativa.';
  if (draft.maxDiscount !== null && !(draft.maxDiscount > 0)) return 'El tope tiene que ser mayor que cero.';
  if (draft.maxUses !== null && !(draft.maxUses > 0)) return 'Los usos en total tienen que ser al menos 1.';
  if (draft.maxUsesPerCustomer !== null && !(draft.maxUsesPerCustomer > 0)) {
    return 'Los usos por cliente tienen que ser al menos 1.';
  }

  if (draft.startsAt && draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt)) {
    return 'El cupón tiene que vencer después de empezar.';
  }

  return null;
}
