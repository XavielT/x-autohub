import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AdminCouponsService } from './admin-coupons.service';
import { AuthService } from './auth.service';
import { CouponService } from './coupon.service';
import { MOCK_ORDERS_STORAGE_KEY } from '../data/mock-orders-usage';
import { CouponDraft } from '../models/coupon.model';

describe('AdminCouponsService (mock)', () => {
  let service: AdminCouponsService;
  let coupons: CouponService;

  const draft = (over: Partial<CouponDraft> = {}): CouponDraft => ({
    id: null,
    code: 'nuevo20',
    description: ' Veinte ',
    type: 'percent',
    value: 20,
    minSubtotal: 0,
    maxDiscount: 500,
    startsAt: '',
    endsAt: '',
    maxUses: null,
    maxUsesPerCustomer: 1,
    isActive: true,
    ...over,
  });

  const errorOf = async (obs: Parameters<typeof firstValueFrom>[0]) => {
    try {
      await firstValueFrom(obs);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: signal(null) } }] });
    service = TestBed.inject(AdminCouponsService);
    coupons = TestBed.inject(CouponService);
  });

  afterEach(() => localStorage.clear());

  it('lista los cupones de demostración, del más nuevo al más viejo', async () => {
    const list = await firstValueFrom(service.getCoupons());

    expect(list.length).toBe(5);
    expect(list[0].createdAt >= list[list.length - 1].createdAt).toBe(true);
  });

  it('cuenta los usos de los pedidos que no están cancelados', async () => {
    localStorage.setItem(
      MOCK_ORDERS_STORAGE_KEY,
      JSON.stringify([
        { userId: null, view: { couponCode: 'BIENVENIDO10', status: 'paid' } },
        { userId: null, view: { couponCode: 'BIENVENIDO10', status: 'cancelled' } },
      ]),
    );

    const list = await firstValueFrom(service.getCoupons());

    expect(list.find((c) => c.code === 'BIENVENIDO10')?.uses).toBe(1);
    expect(list.find((c) => c.code === 'ENVIOGRATIS')?.uses).toBe(0);
  });

  describe('crear', () => {
    it('guarda el código en mayúsculas y la descripción sin espacios', async () => {
      const saved = await firstValueFrom(service.saveCoupon(draft()));

      expect(saved).toMatchObject({ code: 'NUEVO20', description: 'Veinte', type: 'percent', value: 20, maxDiscount: 500 });
      expect(coupons.mockCoupons.some((c) => c.code === 'NUEVO20')).toBe(true);
    });

    it('lo creado se puede usar enseguida en el checkout', async () => {
      await firstValueFrom(service.saveCoupon(draft()));

      expect((await firstValueFrom(coupons.validate('nuevo20', 1000, 0))).discount).toBe(200);
    });

    it('un código repetido se rechaza, sin importar cómo se escriba', async () => {
      expect(await errorOf(service.saveCoupon(draft({ code: 'bienvenido10' })))).toBe('Ya hay un cupon con ese codigo.');
    });

    it('el envío gratis no guarda monto ni tope; un monto fijo no guarda tope', async () => {
      const free = await firstValueFrom(service.saveCoupon(draft({ code: 'ENVIO0', type: 'free_shipping', value: 99, maxDiscount: 10 })));
      const fixed = await firstValueFrom(service.saveCoupon(draft({ code: 'FIJO100', type: 'fixed', value: 100, maxDiscount: 10 })));

      expect(free).toMatchObject({ value: null, maxDiscount: null });
      expect(fixed).toMatchObject({ value: 100, maxDiscount: null });
    });

    it('lo que la base rechazaría se dice antes de mandarlo', async () => {
      expect(await errorOf(service.saveCoupon(draft({ code: 'AB' })))).toContain('4 a 32');
      expect(await errorOf(service.saveCoupon(draft({ value: 150 })))).toContain('entre 1 y 100');
    });

    it('convierte las fechas del formulario', async () => {
      const saved = await firstValueFrom(service.saveCoupon(draft({ startsAt: '2026-10-24T08:00', endsAt: '2026-10-30T20:00' })));

      expect(saved.startsAt).toBeInstanceOf(Date);
      expect(saved.endsAt!.getTime()).toBeGreaterThan(saved.startsAt!.getTime());
    });
  });

  describe('editar, apagar y borrar', () => {
    it('editar conserva el id y la fecha de creación', async () => {
      const original = coupons.mockCoupons.find((c) => c.code === 'ENVIOGRATIS')!;

      const saved = await firstValueFrom(
        service.saveCoupon(draft({ id: original.id, code: 'ENVIOGRATIS', type: 'free_shipping', value: null, minSubtotal: 5000, maxDiscount: null })),
      );

      expect(saved.id).toBe(original.id);
      expect(saved.createdAt).toEqual(original.createdAt);
      expect(saved.minSubtotal).toBe(5000);
      expect(coupons.mockCoupons.filter((c) => c.code === 'ENVIOGRATIS')).toHaveLength(1);
    });

    it('cambiar el código de uno a otro que ya existe se rechaza, pero conservar el propio no', async () => {
      const a = coupons.mockCoupons.find((c) => c.code === 'ENVIOGRATIS')!;

      expect(await errorOf(service.saveCoupon(draft({ id: a.id, code: 'VERANO25' })))).toBe('Ya hay un cupon con ese codigo.');
      expect(await errorOf(service.saveCoupon(draft({ id: a.id, code: 'ENVIOGRATIS', type: 'free_shipping', value: null, maxDiscount: null })))).toBeNull();
    });

    it('apagar un cupón lo saca del checkout; encenderlo lo devuelve', async () => {
      const c = coupons.mockCoupons.find((x) => x.code === 'BIENVENIDO10')!;

      await firstValueFrom(service.setActive(c, false));
      expect(await errorOf(coupons.validate('BIENVENIDO10', 1000, 0))).toContain('no existe o ya no esta disponible');

      await firstValueFrom(service.setActive({ ...c, isActive: false }, true));
      expect((await firstValueFrom(coupons.validate('BIENVENIDO10', 1000, 0))).discount).toBe(100);
    });

    it('borrar un cupón lo quita', async () => {
      const c = coupons.mockCoupons.find((x) => x.code === 'APAGADO10')!;

      await firstValueFrom(service.deleteCoupon(c));

      expect(coupons.mockCoupons.some((x) => x.code === 'APAGADO10')).toBe(false);
    });
  });
});
