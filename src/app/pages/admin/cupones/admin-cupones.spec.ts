import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AdminCupones, couponStatus, toLocalInput } from './admin-cupones';
import { AuthService } from '../../../../shared/services/auth.service';
import { CouponService } from '../../../../shared/services/coupon.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { CouponModel } from '../../../../shared/models/coupon.model';

describe('AdminCupones (/admin/cupones)', () => {
  const toast = { show: vi.fn() };
  const input = (value: string, checked = false) => ({ target: { value, checked } }) as unknown as Event;

  beforeEach(() => {
    localStorage.clear();
    toast.show.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    });
  });

  afterEach(() => localStorage.clear());

  async function montar() {
    const fixture = TestBed.createComponent(AdminCupones);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  it('lista los cupones con su estado, su valor y sus usos', async () => {
    const { c, el } = await montar();

    expect(c.coupons()).toHaveLength(5);
    const text = el.textContent ?? '';
    expect(text).toContain('BIENVENIDO10');
    expect(text).toContain('10 % de descuento');
    expect(text).toContain('Envío gratis');
    expect(text).toContain('Apagado');
    expect(text).toContain('Usado 0 veces');
    expect(c.activeCount()).toBe(4);
  });

  it('las condiciones salen en una línea: mínimo, tope y por cliente', async () => {
    const { c } = await montar();
    const verano = c.coupons().find((x) => x.code === 'VERANO25')!;
    const bienvenida = c.coupons().find((x) => x.code === 'BIENVENIDO10')!;

    expect(c.conditions(verano)).toEqual(['Descuento máximo RD$ 1,500']);
    expect(c.conditions(bienvenida)).toEqual(['1 por cliente']);
  });

  describe('crear', () => {
    it('"Nuevo cupón" abre un formulario en blanco, de porcentaje y activo', async () => {
      const { c } = await montar();

      c.newCoupon();

      expect(c.draft()).toMatchObject({ id: null, code: '', type: 'percent', value: 10, minSubtotal: 0, isActive: true });
    });

    it('el código se escribe en mayúsculas', async () => {
      const { c } = await montar();
      c.newCoupon();

      c.setText('code', input('mi-cupon'));

      expect(c.draft()?.code).toBe('MI-CUPON');
    });

    it('cambiar el tipo no arrastra el valor del anterior', async () => {
      const { c } = await montar();
      c.newCoupon();
      c.setNumber('maxDiscount', input('300'));

      c.setType(input('free_shipping'));
      expect(c.draft()).toMatchObject({ type: 'free_shipping', value: null, maxDiscount: null });

      c.setType(input('fixed'));
      expect(c.draft()).toMatchObject({ type: 'fixed', value: null });
    });

    it('un número vacío es "sin límite" (nulo), no cero', async () => {
      const { c } = await montar();
      c.newCoupon();

      c.setNumber('maxUses', input('5'));
      expect(c.draft()?.maxUses).toBe(5);
      c.setNumber('maxUses', input('  '));
      expect(c.draft()?.maxUses).toBeNull();

      c.setMin(input(''));
      expect(c.draft()?.minSubtotal).toBe(0);
    });

    it('sin código no guarda, y lo dice', async () => {
      const { c } = await montar();
      c.newCoupon();

      c.save();

      expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('4 a 32'), 'error');
      expect(c.draft()).not.toBeNull();
    });

    it('guarda, cierra el formulario y el cupón aparece en la lista', async () => {
      const { fixture, c, el } = await montar();
      c.newCoupon();
      c.setText('code', input('bienvenida50'));
      c.setNumber('value', input('50'));

      c.save();
      await settle(fixture);

      expect(c.draft()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith('Cupón BIENVENIDA50 guardado.');
      expect(el.textContent).toContain('BIENVENIDA50');
      expect(c.coupons()).toHaveLength(6);
    });

    it('un código repetido se avisa y deja el formulario abierto', async () => {
      const { fixture, c } = await montar();
      c.newCoupon();
      c.setText('code', input('BIENVENIDO10'));

      c.save();
      await settle(fixture);

      expect(toast.show).toHaveBeenCalledWith('Ya hay un cupon con ese codigo.', 'error');
      expect(c.draft()).not.toBeNull();
    });
  });

  describe('editar, apagar y borrar', () => {
    it('editar abre el formulario con los datos del cupón, con las fechas en hora local', async () => {
      const { c } = await montar();
      const verano = c.coupons().find((x) => x.code === 'VERANO25')!;

      c.edit(verano);

      expect(c.draft()).toMatchObject({ id: verano.id, code: 'VERANO25', value: 25, maxDiscount: 1500 });
      expect(c.draft()?.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('apagar y encender desde la lista, sin abrir el formulario', async () => {
      const { fixture, c } = await montar();
      const bienvenida = c.coupons().find((x) => x.code === 'BIENVENIDO10')!;

      c.toggle(bienvenida);
      await settle(fixture);
      expect(c.coupons().find((x) => x.code === 'BIENVENIDO10')?.isActive).toBe(false);
      expect(toast.show).toHaveBeenCalledWith('Cupón BIENVENIDO10 apagado.');

      c.toggle(c.coupons().find((x) => x.code === 'BIENVENIDO10')!);
      await settle(fixture);
      expect(c.coupons().find((x) => x.code === 'BIENVENIDO10')?.isActive).toBe(true);
    });

    it('borrar pide un segundo toque para confirmar', async () => {
      const { fixture, c } = await montar();
      const apagado = c.coupons().find((x) => x.code === 'APAGADO10')!;

      c.remove(apagado);
      expect(c.confirmingDeleteId()).toBe(apagado.id);
      expect(c.coupons()).toHaveLength(5);

      c.remove(apagado);
      await settle(fixture);
      expect(c.coupons()).toHaveLength(4);
      expect(c.confirmingDeleteId()).toBeNull();
      expect(toast.show).toHaveBeenCalledWith('Cupón APAGADO10 borrado.');
    });
  });

  describe('el estado de un cupón', () => {
    const base: CouponModel = {
      id: 1, code: 'X', description: '', type: 'percent', value: 10, minSubtotal: 0, maxDiscount: null,
      startsAt: null, endsAt: null, maxUses: null, maxUsesPerCustomer: null, isActive: true,
      createdAt: new Date('2026-10-01T00:00:00Z'), uses: 0,
    };
    const now = new Date('2026-10-23T12:00:00Z');

    it('activo, apagado, vencido, por empezar y agotado', () => {
      expect(couponStatus(base, now)).toBe('active');
      expect(couponStatus({ ...base, isActive: false }, now)).toBe('off');
      expect(couponStatus({ ...base, endsAt: new Date('2026-10-22T00:00:00Z') }, now)).toBe('expired');
      expect(couponStatus({ ...base, startsAt: new Date('2026-10-24T00:00:00Z') }, now)).toBe('upcoming');
      expect(couponStatus({ ...base, maxUses: 3, uses: 3 }, now)).toBe('exhausted');
      expect(couponStatus({ ...base, maxUses: 3, uses: 2 }, now)).toBe('active');
    });

    it('toLocalInput da el formato del datetime-local, y vacío sin fecha', () => {
      expect(toLocalInput(null)).toBe('');
      expect(toLocalInput(new Date(2026, 9, 23, 8, 5))).toBe('2026-10-23T08:05');
    });
  });

  it('el servicio de cupones del modo simulado es el mismo que ve el checkout', async () => {
    const { c } = await montar();

    expect(c.coupons().length).toBe(TestBed.inject(CouponService).mockCoupons.length);
  });
});
