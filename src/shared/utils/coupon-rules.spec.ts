import { COUPON_UNAVAILABLE, checkCoupon, couponDiscount, findCoupon, validateCouponDraft } from './coupon-rules';
import { CouponDraft, CouponModel, describeCouponValue, normalizeCouponCode } from '../models/coupon.model';

/**
 * Las reglas de un cupón, espejo de `coupon_check()`. Las cifras y los mensajes son los
 * mismos que `scripts/verify-migrations.sh` comprueba contra Postgres: si uno cambia, el
 * otro tiene que cambiar con él.
 */

const coupon = (over: Partial<CouponModel> = {}): CouponModel => ({
  id: 1,
  code: 'PCT10',
  description: '',
  type: 'percent',
  value: 10,
  minSubtotal: 0,
  maxDiscount: null,
  startsAt: null,
  endsAt: null,
  maxUses: null,
  maxUsesPerCustomer: null,
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  uses: 0,
  ...over,
});

const NONE = { total: 0, byCustomer: 0 };
const check = (c: CouponModel | undefined, subtotal: number, shipping = 0, usage = NONE, now?: Date) =>
  checkCoupon(c, { subtotal, shipping, usage, now });
const errorOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

describe('coupon-rules', () => {
  describe('couponDiscount', () => {
    it('un porcentaje descuenta esa parte del subtotal', () => {
      expect(couponDiscount(coupon({ value: 10 }), 1000, 450)).toBe(100);
      expect(couponDiscount(coupon({ value: 15 }), 999, 0)).toBe(149.85);
    });

    it('un porcentaje respeta su tope: 50 % de 1000 con tope de 100 son 100, no 500', () => {
      expect(couponDiscount(coupon({ value: 50, maxDiscount: 100 }), 1000, 0)).toBe(100);
      expect(couponDiscount(coupon({ value: 50, maxDiscount: 100 }), 100, 0)).toBe(50);
    });

    it('un monto fijo descuenta el monto, pero nunca más que el subtotal', () => {
      expect(couponDiscount(coupon({ type: 'fixed', value: 500 }), 5000, 0)).toBe(500);
      expect(couponDiscount(coupon({ type: 'fixed', value: 9999 }), 1000, 0)).toBe(1000);
    });

    it('el envío gratis descuenta el envío, no el subtotal', () => {
      expect(couponDiscount(coupon({ type: 'free_shipping', value: null }), 1000, 450)).toBe(450);
      expect(couponDiscount(coupon({ type: 'free_shipping', value: null }), 1000, 0)).toBe(0);
    });
  });

  describe('checkCoupon: el orden y los mensajes de coupon_check()', () => {
    it('un cupón válido devuelve el descuento', () => {
      expect(check(coupon(), 1000, 450)).toBe(100);
    });

    it('no existe, apagado, vencido y todavía no empieza: el mismo mensaje', () => {
      const now = new Date('2026-10-23T12:00:00Z');
      const cases = [
        undefined,
        coupon({ isActive: false }),
        coupon({ endsAt: new Date('2026-10-22T12:00:00Z') }),
        coupon({ startsAt: new Date('2026-10-24T12:00:00Z') }),
      ];
      for (const c of cases) expect(errorOf(() => check(c, 1000, 0, NONE, now))).toBe(COUPON_UNAVAILABLE);
    });

    it('vence justo en su fecha de fin: ya no sirve a esa hora', () => {
      const ends = new Date('2026-10-23T12:00:00Z');
      expect(errorOf(() => check(coupon({ endsAt: ends }), 1000, 0, NONE, ends))).toBe(COUPON_UNAVAILABLE);
      expect(errorOf(() => check(coupon({ endsAt: ends }), 1000, 0, NONE, new Date(+ends - 1)))).toBeNull();
    });

    it('la compra mínima dice cuánto falta pedir, con miles', () => {
      const c = coupon({ minSubtotal: 3000 });

      expect(errorOf(() => check(c, 2000))).toBe('Este cupón pide una compra de al menos RD$ 3,000.');
      expect(errorOf(() => check(c, 3000))).toBeNull();
      expect(errorOf(() => check(coupon({ minSubtotal: 1000000 }), 10))).toBe(
        'Este cupón pide una compra de al menos RD$ 1,000,000.',
      );
    });

    it('un cupón de usos limitados se agota', () => {
      const c = coupon({ maxUses: 1 });

      expect(errorOf(() => check(c, 1000, 0, { total: 0, byCustomer: 0 }))).toBeNull();
      expect(errorOf(() => check(c, 1000, 0, { total: 1, byCustomer: 0 }))).toBe('Este cupón ya se agoto.');
    });

    it('el límite por cliente cuenta lo de esa persona, no el total', () => {
      const c = coupon({ maxUsesPerCustomer: 1 });

      expect(errorOf(() => check(c, 1000, 0, { total: 5, byCustomer: 0 }))).toBeNull();
      expect(errorOf(() => check(c, 1000, 0, { total: 5, byCustomer: 1 }))).toBe('Ya usaste este cupón.');
    });

    it('un cupón que no descuenta nada no aplica (envío gratis en un retiro)', () => {
      const free = coupon({ type: 'free_shipping', value: null });

      expect(errorOf(() => check(free, 1000, 0))).toBe('Este cupón no aplica a tu pedido.');
      expect(check(free, 1000, 450)).toBe(450);
    });

    it('la compra mínima se revisa antes que los usos (el mismo orden que la base)', () => {
      const c = coupon({ minSubtotal: 3000, maxUses: 1 });

      expect(errorOf(() => check(c, 100, 0, { total: 1, byCustomer: 0 }))).toContain('compra de al menos');
    });
  });

  describe('findCoupon', () => {
    const list = [coupon({ code: 'PCT10' }), coupon({ id: 2, code: 'ENVIO' })];

    it('no distingue mayúsculas ni espacios', () => {
      expect(findCoupon(list, ' pct10 ')?.id).toBe(1);
      expect(findCoupon(list, 'envio')?.id).toBe(2);
    });

    it('un código vacío o que no existe no encuentra nada', () => {
      expect(findCoupon(list, '   ')).toBeUndefined();
      expect(findCoupon(list, 'NOEXISTE')).toBeUndefined();
    });
  });

  describe('validateCouponDraft: lo que la tabla exige', () => {
    const draft = (over: Partial<CouponDraft> = {}): CouponDraft => ({
      id: null,
      code: 'BIENVENIDO10',
      description: '',
      type: 'percent',
      value: 10,
      minSubtotal: 0,
      maxDiscount: null,
      startsAt: '',
      endsAt: '',
      maxUses: null,
      maxUsesPerCustomer: null,
      isActive: true,
      ...over,
    });

    it('un cupón normal pasa', () => {
      expect(validateCouponDraft(draft())).toBeNull();
      expect(validateCouponDraft(draft({ type: 'free_shipping', value: null }))).toBeNull();
      expect(validateCouponDraft(draft({ type: 'fixed', value: 500 }))).toBeNull();
    });

    it('el código lleva de 4 a 32 caracteres válidos (se pasa a mayúsculas antes)', () => {
      expect(validateCouponDraft(draft({ code: 'abcd' }))).toBeNull();
      expect(validateCouponDraft(draft({ code: 'AB' }))).toContain('4 a 32');
      expect(validateCouponDraft(draft({ code: 'CON ESPACIO' }))).toContain('4 a 32');
      expect(validateCouponDraft(draft({ code: 'A'.repeat(33) }))).toContain('4 a 32');
    });

    it('el porcentaje va de 1 a 100', () => {
      expect(validateCouponDraft(draft({ value: 0 }))).toContain('entre 1 y 100');
      expect(validateCouponDraft(draft({ value: 101 }))).toContain('entre 1 y 100');
      expect(validateCouponDraft(draft({ value: null }))).toContain('entre 1 y 100');
      expect(validateCouponDraft(draft({ value: 100 }))).toBeNull();
    });

    it('un monto fijo necesita monto', () => {
      expect(validateCouponDraft(draft({ type: 'fixed', value: null }))).toContain('monto');
      expect(validateCouponDraft(draft({ type: 'fixed', value: 0 }))).toContain('monto');
    });

    it('los mínimos, el tope y los usos no pueden ser negativos o cero', () => {
      expect(validateCouponDraft(draft({ minSubtotal: -1 }))).toContain('mínima');
      expect(validateCouponDraft(draft({ maxDiscount: 0 }))).toContain('tope');
      expect(validateCouponDraft(draft({ maxUses: 0 }))).toContain('en total');
      expect(validateCouponDraft(draft({ maxUsesPerCustomer: 0 }))).toContain('por cliente');
    });

    it('no puede vencer antes de empezar', () => {
      expect(validateCouponDraft(draft({ startsAt: '2026-10-25T10:00', endsAt: '2026-10-24T10:00' }))).toContain('después de empezar');
      expect(validateCouponDraft(draft({ startsAt: '2026-10-24T10:00', endsAt: '2026-10-25T10:00' }))).toBeNull();
    });
  });

  describe('el modelo', () => {
    it('normaliza el código: sin espacios y en mayúsculas', () => {
      expect(normalizeCouponCode('  bienvenido10 ')).toBe('BIENVENIDO10');
    });

    it('describe el valor de cada tipo', () => {
      expect(describeCouponValue('percent', 10)).toBe('10 % de descuento');
      expect(describeCouponValue('fixed', 500)).toContain('500');
      expect(describeCouponValue('free_shipping', null)).toBe('Envío gratis');
    });
  });
});
