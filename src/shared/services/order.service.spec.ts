import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { OrderService } from './order.service';
import { AuthService } from './auth.service';
import { CartItem } from './cart.service';
import { CheckoutSubmitPayload } from '../models/checkout.model';
import { UserModel } from '../models/user.model';
import { makeProduct } from '../testing/product.fixture';

/**
 * El pedido por el camino simulado (los specs corren siempre en modo mock). Lo
 * que fijan: que el mock responda **con la misma semántica que `create_order()`**
 * —mismos mensajes, mismo estado inicial, el total lo calcula el servicio—, porque
 * un mock más permisivo que la base hace que el checkout funcione en desarrollo y
 * falle en producción.
 */

const USER: UserModel = {
  id: 'u-1',
  displayName: 'Quien sea',
  email: 'quien@ejemplo.com',
  role: 'user',
  createdAt: '2026-08-15T00:00:00Z',
};

const PAYLOAD: CheckoutSubmitPayload = {
  contactEmail: 'a@b.c',
  contactPhone: '8095550134',
  fullName: 'Cliente',
  addressLine1: 'Calle 1',
  city: '',
  postalCode: '',
  province: 'Santiago',
  fulfillment: 'shipping',
  shippingOptionId: 'standard',
  paymentMethodId: 'transfer',
  wantsInstallation: false,
};

const line = (over: Parameters<typeof makeProduct>[0], quantity = 1): CartItem => ({
  part: makeProduct(over),
  quantity,
  variant: null,
});

describe('OrderService (mock)', () => {
  let service: OrderService;
  const user = signal<UserModel | null>(null);

  beforeEach(() => {
    localStorage.clear();
    user.set(null);
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
    service = TestBed.inject(OrderService);
  });

  afterEach(() => localStorage.clear());

  const errorOf = async (obs: Parameters<typeof firstValueFrom>[0]) => {
    try {
      await firstValueFrom(obs);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  describe('crear', () => {
    it('devuelve lo que calculó el servicio: subtotal, envío, total y número', async () => {
      const created = await firstValueFrom(
        service.create({ ...PAYLOAD, shippingOptionId: 'express' }, [line({ id: 1, price: 1000 }, 2)]),
      );

      expect(created.subtotal).toBe(2000);
      expect(created.shippingPrice).toBe(450);
      expect(created.total).toBe(2450);
      expect(created.orderNumber).toBeGreaterThan(1000);
    });

    it('lo que se ve en /pedido es lo mismo que devolvió la creación', async () => {
      const created = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1, price: 1500 }, 2)]));
      const view = await firstValueFrom(service.getOrder(created.id));

      expect(view).not.toBeNull();
      expect(view!.total).toBe(created.total);
      expect(view!.orderNumber).toBe(created.orderNumber);
      expect(view!.items).toEqual([{ name: 'Producto 1', unitPrice: 1500, quantity: 2 }]);
    });

    it('nace esperando el pago, con su primera fila de historial', async () => {
      const created = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));
      const view = (await firstValueFrom(service.getOrder(created.id)))!;

      expect(view.status).toBe('awaiting_payment');
      expect(view.history.map((h) => h.toStatus)).toEqual(['awaiting_payment']);
      expect(view.hasProof).toBe(false);
    });

    it('los números siguen la cuenta, sin repetirse', async () => {
      const a = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));
      const b = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));

      expect(b.orderNumber).toBe(a.orderNumber + 1);
    });

    it('rechaza lo que no hay: mismo mensaje que la base', async () => {
      expect(await errorOf(service.create(PAYLOAD, [line({ id: 1, name: 'Disco', stock: 1 }, 3)]))).toBe(
        'De "Disco" solo quedan 1 y pediste 3. Ajusta la cantidad.',
      );
      expect(await errorOf(service.create(PAYLOAD, [line({ id: 1, name: 'Disco', stock: 0 })]))).toBe(
        'Se agoto "Disco". Quítala del carrito para continuar.',
      );
    });

    describe('con opciones', () => {
      const opcion = (id: number, name: string, stock: number) => ({
        id, productId: 8, name, sku: null, stock, sortOrder: id, isActive: true,
      });
      const conOpcion = (variant: ReturnType<typeof opcion> | null, quantity = 1, over: Parameters<typeof makeProduct>[0] = {}): CartItem => ({
        part: makeProduct({ id: 8, name: 'Alfombras', hasVariants: true, variantLabel: 'Color', stock: 10, ...over }),
        quantity,
        variant,
      });

      it('sin elegir opción se rechaza, diciendo el producto (como la base)', async () => {
        expect(await errorOf(service.create(PAYLOAD, [conOpcion(null)]))).toBe(
          'Elige una opción de "Alfombras" antes de comprarlo.',
        );
      });

      it('una opción en un producto que no las tiene se rechaza', async () => {
        expect(
          await errorOf(service.create(PAYLOAD, [{ ...conOpcion(opcion(1, 'Negro', 5)), part: makeProduct({ id: 8, name: 'Alfombras' }) }])),
        ).toBe('La opción elegida de "Alfombras" ya no está disponible.');
      });

      it('el stock que cuenta es el de la opción, y el mensaje la nombra', async () => {
        expect(await errorOf(service.create(PAYLOAD, [conOpcion(opcion(1, 'Negro', 2), 3)]))).toBe(
          'De "Alfombras (Negro)" solo quedan 2 y pediste 3. Ajusta la cantidad.',
        );
        expect(await errorOf(service.create(PAYLOAD, [conOpcion(opcion(1, 'Negro', 0))]))).toBe(
          'Se agoto "Alfombras (Negro)". Quítala del carrito para continuar.',
        );
      });

      it('con la opción elegida el pedido sale, y la línea se llama "Producto · Opción"', async () => {
        const created = await firstValueFrom(service.create(PAYLOAD, [conOpcion(opcion(1, 'Negro', 5), 2)]));
        const view = (await firstValueFrom(service.getOrder(created.id)))!;

        expect(view.items).toEqual([{ name: 'Alfombras · Negro', unitPrice: 1000, quantity: 2 }]);
      });

      it('bajo pedido, la opción no depende del stock', async () => {
        const created = await firstValueFrom(
          service.create(PAYLOAD, [conOpcion(opcion(1, 'Negro', 0), 1, { fulfillment: 'on_order', leadTimeDays: 7 })]),
        );

        expect(created.subtotal).toBe(1000);
      });
    });

    it('lo bajo pedido se vende aunque no haya stock', async () => {
      const created = await firstValueFrom(
        service.create(PAYLOAD, [line({ id: 1, fulfillment: 'on_order', leadTimeDays: 10, stock: 0 }, 2)]),
      );

      expect(created.total).toBeGreaterThan(0);
    });

    it('un carrito vacío o un envío inventado se rechazan', async () => {
      expect(await errorOf(service.create(PAYLOAD, []))).toBe('Un pedido necesita al menos una pieza.');
      expect(await errorOf(service.create({ ...PAYLOAD, shippingOptionId: 'volando' }, [line({ id: 1 })]))).toBe(
        'Método de envío no válido.',
      );
    });

    it('la instalación solo se marca si algo del pedido se instala', async () => {
      const si = await firstValueFrom(
        service.create({ ...PAYLOAD, wantsInstallation: true }, [line({ id: 1, installable: true, installationServiceId: 7 })]),
      );
      const no = await firstValueFrom(service.create({ ...PAYLOAD, wantsInstallation: true }, [line({ id: 2 })]));

      expect((await firstValueFrom(service.getOrder(si.id)))!.wantsInstallation).toBe(true);
      expect((await firstValueFrom(service.getOrder(si.id)))!.installationServiceId).toBe(7);
      expect((await firstValueFrom(service.getOrder(no.id)))!.wantsInstallation).toBe(false);
    });

    it('sobrevive a una recarga: vive en localStorage, no solo en memoria', async () => {
      const created = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
      const otra = TestBed.inject(OrderService);

      const view = await firstValueFrom(otra.getOrder(created.id));
      expect(view?.id).toBe(created.id);
      // Y las fechas vuelven como fechas, no como texto.
      expect(view!.createdAt).toBeInstanceOf(Date);
      expect(view!.history[0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('leer', () => {
    it('un id que no existe devuelve null, no un error', async () => {
      expect(await firstValueFrom(service.getOrder('no-existe'))).toBeNull();
    });

    it('Mis pedidos: los de ejemplo, y los míos al crearlos con sesión', async () => {
      user.set(USER);
      const antes = await firstValueFrom(service.getMyOrders());
      expect(antes.length).toBe(2);

      await firstValueFrom(service.create(PAYLOAD, [line({ id: 1, price: 1000 }, 2)]));
      const despues = await firstValueFrom(service.getMyOrders());

      expect(despues.length).toBe(3);
      // Del más nuevo al más viejo, contando unidades y no líneas.
      expect(despues[0].itemCount).toBe(2);
      expect(despues[0].status).toBe('awaiting_payment');
    });

    it('un pedido de invitado no aparece en Mis pedidos de nadie', async () => {
      await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })])); // sin sesión
      user.set(USER);

      expect((await firstValueFrom(service.getMyOrders())).length).toBe(2);
    });

    it('el pedido de otra persona con sesión no es el mío', async () => {
      user.set(USER);
      await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));

      user.set({ ...USER, id: 'u-2' });
      expect((await firstValueFrom(service.getMyOrders())).length).toBe(2);
    });
  });

  describe('comprobante', () => {
    const file = (name: string, type: string, bytes = 100) => new File([new Uint8Array(bytes)], name, { type });

    it('subirlo deja el pedido con comprobante', async () => {
      const created = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));

      await firstValueFrom(service.uploadProof(created.id, file('t.png', 'image/png')));

      expect((await firstValueFrom(service.getOrder(created.id)))!.hasProof).toBe(true);
    });

    it('acepta fotos y PDF, y rechaza lo demás con un mensaje claro', async () => {
      const created = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));

      await firstValueFrom(service.uploadProof(created.id, file('t.pdf', 'application/pdf')));
      expect(await errorOf(service.uploadProof(created.id, file('t.exe', 'application/x-msdownload')))).toBe(
        'El comprobante tiene que ser una foto (JPG, PNG, WebP) o un PDF.',
      );
    });

    it('rechaza lo que pesa más de 10 MB', async () => {
      const created = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1 })]));

      expect(await errorOf(service.uploadProof(created.id, file('t.png', 'image/png', 10 * 1024 * 1024 + 1)))).toBe(
        'El comprobante debe pesar menos de 10 MB.',
      );
    });
  });

  describe('cupones: el descuento lo calcula el servicio, como create_order()', () => {
    const withCoupon = (couponCode: string, over: Partial<CheckoutSubmitPayload> = {}): CheckoutSubmitPayload => ({
      ...PAYLOAD,
      couponCode,
      ...over,
    });

    it('descuenta, guarda el código en mayúsculas y el total cuadra', async () => {
      const created = await firstValueFrom(
        service.create(withCoupon(' bienvenido10 ', { shippingOptionId: 'express' }), [line({ id: 1, price: 1000 }, 2)]),
      );

      expect(created).toMatchObject({ subtotal: 2000, shippingPrice: 450, discount: 200, couponCode: 'BIENVENIDO10', total: 2250 });
      expect(created.total).toBe(created.subtotal + created.shippingPrice - created.discount);
    });

    it('/pedido muestra el mismo descuento y el cupón', async () => {
      const created = await firstValueFrom(service.create(withCoupon('BIENVENIDO10'), [line({ id: 1, price: 1000 }, 2)]));
      const view = (await firstValueFrom(service.getOrder(created.id)))!;

      expect(view).toMatchObject({ discount: 200, couponCode: 'BIENVENIDO10', total: created.total });
    });

    it('sin cupón (o con el código en blanco) el descuento es 0 y no hay código', async () => {
      const none = await firstValueFrom(service.create(PAYLOAD, [line({ id: 1, price: 1000 })]));
      const blank = await firstValueFrom(service.create(withCoupon('   '), [line({ id: 1, price: 1000 })]));

      expect(none).toMatchObject({ discount: 0, couponCode: null });
      expect(blank).toMatchObject({ discount: 0, couponCode: null });
    });

    it('un código que no existe rechaza el pedido entero: no queda ningún pedido nuevo', async () => {
      const before = (await firstValueFrom(service.getMyOrders())).length;

      expect(await errorOf(service.create(withCoupon('NOEXISTE'), [line({ id: 1, price: 1000 })]))).toBe(
        'Ese cupón no existe o ya no está disponible.',
      );
      expect((await firstValueFrom(service.getMyOrders())).length).toBe(before);
    });

    it('la compra mínima se exige al crear el pedido, aunque el checkout no la haya probado', async () => {
      expect(await errorOf(service.create(withCoupon('DESCUENTO500'), [line({ id: 1, price: 1000 })]))).toBe(
        'Este cupón pide una compra de al menos RD$ 3,000.',
      );
    });

    it('un monto fijo enorme nunca deja el total en negativo', async () => {
      service['coupons'].saveMock([
        ...service['coupons'].mockCoupons,
        { ...service['coupons'].mockCoupons[2], id: 99, code: 'GIGANTE', value: 99999, minSubtotal: 0, maxUses: null },
      ]);

      const created = await firstValueFrom(service.create(withCoupon('GIGANTE'), [line({ id: 1, price: 1000 })]));

      expect(created.discount).toBe(1000);
      expect(created.total).toBe(created.shippingPrice);
    });

    it('el envío gratis deja el total en el subtotal, y en un retiro no aplica', async () => {
      const created = await firstValueFrom(
        service.create(withCoupon('ENVIOGRATIS', { shippingOptionId: 'express' }), [line({ id: 1, price: 2500 })]),
      );
      expect(created).toMatchObject({ discount: 450, total: 2500 });

      expect(
        await errorOf(
          service.create(withCoupon('ENVIOGRATIS', { fulfillment: 'pickup', shippingOptionId: 'pickup', addressLine1: '', province: '' }), [
            line({ id: 1, price: 2500 }),
          ]),
        ),
      ).toBe('Este cupón no aplica a tu pedido.');
    });

    it('un cupón de un uso por cliente: el mismo correo no lo repite, otro sí', async () => {
      await firstValueFrom(service.create(withCoupon('BIENVENIDO10'), [line({ id: 1, price: 1000 })]));

      expect(await errorOf(service.create(withCoupon('BIENVENIDO10'), [line({ id: 1, price: 1000 })]))).toBe('Ya usaste este cupón.');
      expect(
        (await firstValueFrom(service.create(withCoupon('BIENVENIDO10', { contactEmail: 'otro@b.c' }), [line({ id: 1, price: 1000 })]))).discount,
      ).toBe(100);
    });

    it('lo guardado sobrevive a una recarga: el límite se sigue acordando del correo', async () => {
      await firstValueFrom(service.create(withCoupon('BIENVENIDO10'), [line({ id: 1, price: 1000 })]));

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user } }] });
      const recargado = TestBed.inject(OrderService);

      expect(await errorOf(recargado.create(withCoupon('BIENVENIDO10'), [line({ id: 1, price: 1000 })]))).toBe('Ya usaste este cupón.');
    });

    it('el stock se valida antes que el cupón, como en la base', async () => {
      expect(await errorOf(service.create(withCoupon('NOEXISTE'), [line({ id: 1, stock: 0 })]))).toContain('Se agoto');
    });
  });

  it('abrir WhatsApp deja constancia, solo la primera vez', async () => {
    const created = await firstValueFrom(service.create({ ...PAYLOAD, paymentMethodId: 'whatsapp' }, [line({ id: 1 })]));

    await firstValueFrom(service.markWhatsAppOpened(created.id));
    const primera = (await firstValueFrom(service.getOrder(created.id)))!.whatsappOpenedAt;
    await new Promise((r) => setTimeout(r, 5));
    await firstValueFrom(service.markWhatsAppOpened(created.id));
    const segunda = (await firstValueFrom(service.getOrder(created.id)))!.whatsappOpenedAt;

    expect(primera).toBeInstanceOf(Date);
    expect(+segunda!).toBe(+primera!);
  });
});
