import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CouponService } from './coupon.service';
import { AuthService } from './auth.service';
import { MOCK_ORDERS_STORAGE_KEY } from '../data/mock-orders-usage';
import { UserModel } from '../models/user.model';

/**
 * Cupones por el camino simulado: lo mismo que `validate_coupon()` (mismas reglas y mismos
 * mensajes), con los cupones de demostración. Los usos se cuentan de los pedidos
 * simulados guardados, como la base cuenta los pedidos que no están cancelados.
 */
describe('CouponService (mock)', () => {
  const user = signal<UserModel | null>(null);
  const USER: UserModel = { id: 'u-1', displayName: 'Ana', email: 'a@e.com', role: 'user', createdAt: '2026-08-15T00:00:00Z' };

  let service: CouponService;

  const storeOrders = (orders: unknown[]) => localStorage.setItem(MOCK_ORDERS_STORAGE_KEY, JSON.stringify(orders));
  const order = (couponCode: string, extra: Record<string, unknown> = {}, status = 'awaiting_payment') => ({
    userId: null,
    view: { couponCode, status },
    ...extra,
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
    user.set(null);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
    service = TestBed.inject(CouponService);
  });

  afterEach(() => localStorage.clear());

  it('valida un cupón de demostración: el 10 % de 1000 son 100', async () => {
    const v = await firstValueFrom(service.validate('BIENVENIDO10', 1000, 450));

    expect(v).toMatchObject({ code: 'BIENVENIDO10', type: 'percent', discount: 100 });
    expect(v.description).toContain('primera vez');
  });

  it('acepta el código en minúsculas y con espacios', async () => {
    expect((await firstValueFrom(service.validate(' bienvenido10 ', 1000, 0))).code).toBe('BIENVENIDO10');
  });

  it('respeta el tope de un porcentaje: VERANO25 (25 % con tope de 1,500) sobre 10,000', async () => {
    expect((await firstValueFrom(service.validate('VERANO25', 10000, 0))).discount).toBe(1500);
    expect((await firstValueFrom(service.validate('VERANO25', 1000, 0))).discount).toBe(250);
  });

  it('un monto fijo con compra mínima dice cuánto falta', async () => {
    expect(await errorOf(service.validate('DESCUENTO500', 2000, 0))).toBe('Este cupon pide una compra de al menos RD$ 3,000.');
    expect((await firstValueFrom(service.validate('DESCUENTO500', 5000, 0))).discount).toBe(500);
  });

  it('el envío gratis descuenta el envío, y en un retiro no aplica', async () => {
    expect((await firstValueFrom(service.validate('ENVIOGRATIS', 5000, 450))).discount).toBe(450);
    expect(await errorOf(service.validate('ENVIOGRATIS', 5000, 0))).toBe('Este cupon no aplica a tu pedido.');
  });

  it('uno apagado y uno que no existe dicen lo mismo', async () => {
    const same = 'Ese cupon no existe o ya no esta disponible.';

    expect(await errorOf(service.validate('APAGADO10', 1000, 0))).toBe(same);
    expect(await errorOf(service.validate('NOEXISTE', 1000, 0))).toBe(same);
  });

  it('sin código se pide el código, y un subtotal negativo se rechaza', async () => {
    expect(await errorOf(service.validate('   ', 1000, 0))).toBe('Escribe el codigo del cupon.');
    expect(await errorOf(service.validate('BIENVENIDO10', -5, 0))).toBe('El subtotal no es valido.');
  });

  describe('los usos salen de los pedidos guardados', () => {
    it('DESCUENTO500 (50 usos en total) se agota con 50 pedidos', async () => {
      storeOrders(Array.from({ length: 50 }, () => order('DESCUENTO500')));

      expect(await errorOf(service.validate('DESCUENTO500', 5000, 0))).toBe('Este cupon ya se agoto.');
    });

    it('un pedido cancelado devuelve el uso', async () => {
      storeOrders([...Array.from({ length: 49 }, () => order('DESCUENTO500')), order('DESCUENTO500', {}, 'cancelled')]);

      expect((await firstValueFrom(service.validate('DESCUENTO500', 5000, 0))).discount).toBe(500);
    });

    it('BIENVENIDO10 (1 por cliente): quien ya lo usó con su cuenta no lo repite, otra persona sí', async () => {
      storeOrders([order('BIENVENIDO10', { userId: 'u-1' })]);

      user.set(USER);
      expect(await errorOf(service.validate('BIENVENIDO10', 1000, 0))).toBe('Ya usaste este cupon.');

      user.set({ ...USER, id: 'u-2' });
      expect((await firstValueFrom(service.validate('BIENVENIDO10', 1000, 0))).discount).toBe(100);
    });

    it('un invitado se reconoce por su correo, sin importar mayúsculas', async () => {
      storeOrders([order('BIENVENIDO10', { email: 'a@x.com' })]);

      expect(await errorOf(service.validate('BIENVENIDO10', 1000, 0, 'A@X.com'))).toBe('Ya usaste este cupon.');
      expect((await firstValueFrom(service.validate('BIENVENIDO10', 1000, 0, 'otro@x.com'))).discount).toBe(100);
    });

    it('el almacenamiento corrupto no rompe: cuenta cero usos', async () => {
      localStorage.setItem(MOCK_ORDERS_STORAGE_KEY, 'no-es-json{');

      expect((await firstValueFrom(service.validate('BIENVENIDO10', 1000, 0))).discount).toBe(100);
    });
  });

  it('lo que cambia el panel (saveMock) se ve al validar y sobrevive a una recarga', async () => {
    service.saveMock(service.mockCoupons.map((c) => (c.code === 'APAGADO10' ? { ...c, isActive: true } : c)));

    expect((await firstValueFrom(service.validate('APAGADO10', 1000, 0))).discount).toBe(100);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
    const recargado = TestBed.inject(CouponService);
    expect(recargado.mockCoupons.find((c) => c.code === 'APAGADO10')?.isActive).toBe(true);
    // Las fechas vuelven a ser Date, no texto.
    expect(recargado.mockCoupons.find((c) => c.code === 'VERANO25')?.endsAt).toBeInstanceOf(Date);
  });
});
