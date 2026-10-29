import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { computed, signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { CHECKOUT_MEMORY_KEY, Checkout } from './checkout';
import { CartItem, CartService } from '../../../shared/services/cart.service';
import { OrderService } from '../../../shared/services/order.service';
import { ToastService } from '../../../shared/services/toast.service';
import { makeProduct } from '../../../shared/testing/product.fixture';

/**
 * El checkout de tres pasos. Se prueba contra un carrito y un servicio de pedidos
 * de mentira: lo que importa aquí es el recorrido —qué pide cada paso, qué manda
 * a `create_order()`, qué hace con la respuesta—, no el catálogo.
 */
describe('Checkout', () => {
  const create = vi.fn();
  const toast = { show: vi.fn() };
  let items: ReturnType<typeof signal<CartItem[]>>;
  let cart: {
    items: typeof items;
    totalPrice: ReturnType<typeof computed<number>>;
    stockIssues: ReturnType<typeof computed<unknown[]>>;
    refresh: ReturnType<typeof vi.fn>;
    clearCart: ReturnType<typeof vi.fn>;
    setQuantity: ReturnType<typeof vi.fn>;
    removeFromCart: ReturnType<typeof vi.fn>;
  };

  function montar(lines: CartItem[] = [{ part: makeProduct({ id: 1, price: 1000 }), quantity: 2, variant: null }]) {
    items = signal<CartItem[]>(lines);
    cart = {
      items,
      totalPrice: computed(() => items().reduce((acc, i) => acc + i.part.price * i.quantity, 0)),
      stockIssues: computed(() =>
        items()
          .filter((i) => i.part.fulfillment === 'stock' && i.quantity > (i.variant ? i.variant.stock : i.part.stock))
          .map((i) => ({
            part: i.part,
            variant: i.variant,
            quantity: i.quantity,
            available: i.variant ? i.variant.stock : i.part.stock,
          })),
      ),
      refresh: vi.fn(async () => undefined),
      clearCart: vi.fn(() => items.set([])),
      setQuantity: vi.fn((id: number, q: number, variantId: number | null = null) =>
        items.update((l) =>
          l.map((i) => (i.part.id === id && (i.variant?.id ?? null) === variantId ? { ...i, quantity: q } : i)),
        ),
      ),
      removeFromCart: vi.fn((id: number, variantId: number | null = null) =>
        items.update((l) => l.filter((i) => !(i.part.id === id && (i.variant?.id ?? null) === variantId))),
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: CartService, useValue: cart },
        { provide: OrderService, useValue: { create } },
        { provide: ToastService, useValue: toast },
      ],
    });

    const fixture = TestBed.createComponent(Checkout);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, navigate };
  }

  const fillStep1 = (c: Checkout) => {
    c.email.set('cliente@ejemplo.com');
    c.phone.set('809-555-0134');
    c.fullName.set('Cliente de Prueba');
    c.province.set('Santiago');
    c.addressLine1.set('Calle 1 #2');
  };

  beforeEach(() => {
    localStorage.clear();
    create.mockReset();
    toast.show.mockReset();
    create.mockReturnValue(of({ id: 'o-1', orderNumber: 1042, subtotal: 2000, shippingPrice: 0, total: 2000 }));
  });

  afterEach(() => localStorage.clear());

  it('arranca en el paso 1 y vuelve a leer el stock del carrito', () => {
    const { c } = montar();

    expect(c.step()).toBe(1);
    expect(cart.refresh).toHaveBeenCalled();
  });

  describe('paso 1: entrega', () => {
    it('no avanza sin los datos, los nombra y los marca', () => {
      const { c, fixture, el } = montar();

      c.next();
      fixture.detectChanges();

      expect(c.step()).toBe(1);
      expect(toast.show).toHaveBeenCalledWith(
        'Te falta completar: Correo electrónico, Nombre completo, Teléfono, Provincia, Dirección.',
        'error',
      );
      expect(el.querySelectorAll('.field-error').length).toBe(5);
    });

    it('un teléfono que no es dominicano no pasa', () => {
      const { c } = montar();
      fillStep1(c);
      c.phone.set('12345');

      c.next();

      expect(c.step()).toBe(1);
      expect(c.showError('phone')).toBe(true);
    });

    it('con todo completo pasa al paso 2', () => {
      const { c } = montar();
      fillStep1(c);

      c.next();

      expect(c.step()).toBe(2);
    });

    it('un retiro en el taller no pide dirección ni provincia', () => {
      const { c } = montar();
      c.chooseFulfillment('pickup');
      c.email.set('a@b.c');
      c.fullName.set('Cliente');
      c.phone.set('809-555-0134');

      c.next();

      expect(c.step()).toBe(2);
      expect(c.shippingPrice()).toBe(0);
    });

    it('cambiar entre envío y retiro deja elegida una opción que corresponda', () => {
      const { c } = montar();

      c.chooseFulfillment('pickup');
      expect(c.selectedShippingId()).toBe('pickup');

      c.chooseFulfillment('shipping');
      expect(c.selectedShippingId()).not.toBe('pickup');
      expect(c.visibleShippingOptions().every((o) => o.id !== 'pickup')).toBe(true);
    });

    it('el costo del envío sale de la opción elegida', () => {
      const { c } = montar();

      c.selectedShippingId.set('express');

      expect(c.shippingPrice()).toBe(450);
      expect(c.estimatedTotal()).toBe(2450);
    });
  });

  describe('paso 2: pago', () => {
    it('solo se ofrecen transferencia y WhatsApp', () => {
      const { c } = montar();

      expect(c.paymentOptions().map((p) => p.id)).toEqual(['transfer', 'whatsapp']);
    });

    it('la casilla de instalación solo existe si algo del carrito se instala', () => {
      const normal = montar();
      expect(normal.c.hasInstallable()).toBe(false);
      TestBed.resetTestingModule();

      const instalable = montar([{ part: makeProduct({ id: 2, installable: true, installationServiceId: 3 }), quantity: 1, variant: null }]);
      expect(instalable.c.hasInstallable()).toBe(true);
    });

    it('no se salta hacia adelante: solo se vuelve a un paso ya recorrido', () => {
      const { c } = montar();

      c.jumpTo(3);
      expect(c.step()).toBe(1);

      fillStep1(c);
      c.next();
      c.jumpTo(1);
      expect(c.step()).toBe(1);
    });
  });

  describe('paso 3: confirmar', () => {
    function hastaConfirmar(lines?: CartItem[]) {
      const m = montar(lines);
      fillStep1(m.c);
      m.c.next();
      m.c.next();
      return m;
    }

    it('manda a create_order() lo que se eligió, sin ningún precio', () => {
      const { c } = hastaConfirmar();
      c.selectedPaymentId.set('whatsapp');
      c.orderNotes.set(' Dejarlo en portería ');

      c.submitOrder();

      expect(create).toHaveBeenCalledTimes(1);
      const [payload, lines] = create.mock.calls[0];
      expect(payload).toEqual({
        contactEmail: 'cliente@ejemplo.com',
        contactPhone: '8095550134', // la forma canónica: diez dígitos
        fullName: 'Cliente de Prueba',
        addressLine1: 'Calle 1 #2',
        city: '',
        postalCode: '',
        province: 'Santiago',
        fulfillment: 'shipping',
        shippingOptionId: 'standard',
        paymentMethodId: 'whatsapp',
        wantsInstallation: false,
        orderNotes: 'Dejarlo en portería',
      });
      expect(JSON.stringify(payload)).not.toMatch(/price|total/i);
      expect(lines).toHaveLength(1);
    });

    it('al confirmar vacía el carrito y lleva a /pedido/:id', () => {
      const { c, navigate } = hastaConfirmar();

      c.submitOrder();

      expect(cart.clearCart).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/pedido', 'o-1']);
      expect(toast.show).toHaveBeenCalledWith('Pedido #1042 registrado.');
    });

    describe('con un cupón', () => {
      const CUPON = { code: 'BIENVENIDO10', type: 'percent' as const, discount: 200, description: '' };

      it('el total estimado baja con el descuento, y la plantilla lo enseña', () => {
        const { fixture, c, el } = hastaConfirmar();
        const sinCupon = c.estimatedTotal();

        c.coupon.set(CUPON);
        fixture.detectChanges();

        expect(c.discount()).toBe(200);
        expect(c.estimatedTotal()).toBe(sinCupon - 200);
        expect(el.textContent).toContain('Cupón BIENVENIDO10');
      });

      it('a create_order() solo viaja el código: el descuento lo calcula Postgres', () => {
        const { c } = hastaConfirmar();
        c.coupon.set(CUPON);

        c.submitOrder();

        const [payload] = create.mock.calls[0];
        expect(payload.couponCode).toBe('BIENVENIDO10');
        expect(JSON.stringify(payload)).not.toMatch(/discount|descuento|200/i);
      });

      it('sin cupón no viaja ningún código', () => {
        const { c } = hastaConfirmar();

        c.submitOrder();

        expect(create.mock.calls[0][0].couponCode).toBeUndefined();
      });

      it('si Postgres descuenta distinto de lo que se vio, el aviso lo dice', () => {
        create.mockReturnValue(
          of({ id: 'o-1', orderNumber: 1042, subtotal: 2000, shippingPrice: 0, discount: 100, couponCode: 'BIENVENIDO10', total: 1900 }),
        );
        const { c } = hastaConfirmar();
        c.coupon.set(CUPON);

        c.submitOrder();

        expect(toast.show.mock.calls[0][0]).toContain('Postgres lo calculó');
      });

      it('si el cupón falla al confirmar, el pedido no se crea y el mensaje sale tal cual', () => {
        create.mockReturnValue(throwError(() => new Error('Este cupón ya se agoto.')));
        const { c } = hastaConfirmar();
        c.coupon.set(CUPON);

        c.submitOrder();

        expect(toast.show).toHaveBeenCalledWith('Este cupón ya se agoto.', 'error');
        expect(cart.clearCart).not.toHaveBeenCalled();
      });
    });

    it('si el total de Postgres difiere del estimado, lo dice', () => {
      create.mockReturnValue(of({ id: 'o-1', orderNumber: 1042, subtotal: 2400, shippingPrice: 0, total: 2400 }));
      const { c } = hastaConfirmar();

      c.submitOrder();

      expect(toast.show.mock.calls[0][0]).toContain('Postgres lo calculó');
    });

    it('si falla, avisa con el mensaje de la base, vuelve a leer el stock y no vacía el carrito', async () => {
      create.mockReturnValue(throwError(() => new Error('De "Disco" solo quedan 1 y pediste 2. Ajusta la cantidad.')));
      const { c, navigate } = hastaConfirmar();
      cart.refresh.mockClear();

      c.submitOrder();

      expect(toast.show).toHaveBeenCalledWith('De "Disco" solo quedan 1 y pediste 2. Ajusta la cantidad.', 'error');
      expect(cart.refresh).toHaveBeenCalled();
      expect(cart.clearCart).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(c.isSubmitting()).toBe(false);
    });

    it('con piezas que piden más de lo que hay no confirma, y se arreglan desde el aviso', () => {
      const { c, fixture, el } = hastaConfirmar([
        { part: makeProduct({ id: 1, name: 'Disco', stock: 1 }), quantity: 3, variant: null },
        { part: makeProduct({ id: 2, name: 'Filtro', stock: 0 }), quantity: 1, variant: null },
      ]);
      fixture.detectChanges();

      expect(el.querySelector('.checkout__alert')?.textContent).toContain('Disco');
      c.submitOrder();
      expect(create).not.toHaveBeenCalled();

      const [disco, filtro] = c.stockIssues();
      c.fixIssue(disco); // ajusta a lo que queda
      c.fixIssue(filtro); // agotada: se quita
      expect(cart.setQuantity).toHaveBeenCalledWith(1, 1, null);
      expect(cart.removeFromCart).toHaveBeenCalledWith(2, null);

      c.submitOrder();
      expect(create).toHaveBeenCalledTimes(1);
    });

    describe('con opciones', () => {
      const alfombra = () => makeProduct({ id: 8, name: 'Alfombras', hasVariants: true, variantLabel: 'Color', stock: 9 });
      const opcion = (id: number, name: string, stock: number) => ({
        id, productId: 8, name, sku: null, stock, sortOrder: id, isActive: true,
      });

      it('el resumen dice la opción de cada línea', () => {
        const { fixture, el } = hastaConfirmar([
          { part: alfombra(), quantity: 1, variant: opcion(1, 'Negro', 5) },
          { part: alfombra(), quantity: 2, variant: opcion(2, 'Gris', 5) },
        ]);
        fixture.detectChanges();

        const brands = [...el.querySelectorAll('.checkout__line-brand')].map((b) => b.textContent?.trim());
        expect(brands).toContain('Color: Negro');
        expect(brands).toContain('Color: Gris');
      });

      it('el aviso de existencias nombra la opción y se arregla solo en esa línea', () => {
        const { c, fixture, el } = hastaConfirmar([
          { part: alfombra(), quantity: 3, variant: opcion(1, 'Negro', 1) },
          { part: alfombra(), quantity: 1, variant: opcion(2, 'Gris', 5) },
        ]);
        fixture.detectChanges();

        expect(el.querySelector('.checkout__alert')?.textContent).toContain('Alfombras (Negro)');
        c.fixIssue(c.stockIssues()[0]);

        expect(cart.setQuantity).toHaveBeenCalledWith(8, 1, 1);
        expect(c.stockIssues()).toEqual([]);
      });

      it('al confirmar se mandan las líneas con su opción', () => {
        const negro = opcion(1, 'Negro', 5);
        const { c } = hastaConfirmar([{ part: alfombra(), quantity: 2, variant: negro }]);

        c.submitOrder();

        const [, lines] = create.mock.calls[0];
        expect(lines[0].variant).toEqual(negro);
      });
    });

    it('lo bajo pedido no cuenta como falta de stock', () => {
      const { c } = hastaConfirmar([
        { part: makeProduct({ id: 1, fulfillment: 'on_order', leadTimeDays: 10, stock: 0 }), quantity: 2, variant: null },
      ]);

      expect(c.stockIssues()).toEqual([]);
      expect(c.hasOnOrder()).toBe(true);
    });

    it('un retiro manda la dirección y la provincia vacías', () => {
      const m = montar();
      m.c.chooseFulfillment('pickup');
      m.c.email.set('a@b.c');
      m.c.fullName.set('Cliente');
      m.c.phone.set('809-555-0134');
      m.c.addressLine1.set('esto no debe viajar');
      m.c.next();
      m.c.next();

      m.c.submitOrder();

      const payload = create.mock.calls[0][0];
      expect(payload.fulfillment).toBe('pickup');
      expect(payload.shippingOptionId).toBe('pickup');
      expect(payload.addressLine1).toBe('');
      expect(payload.province).toBe('');
    });

    it('la instalación solo viaja si se pidió y hay algo que instalar', () => {
      const { c } = hastaConfirmar([{ part: makeProduct({ id: 2, installable: true }), quantity: 1, variant: null }]);
      c.wantsInstallation.set(true);

      c.submitOrder();

      expect(create.mock.calls[0][0].wantsInstallation).toBe(true);
    });
  });

  describe('recordar los datos', () => {
    it('guarda los datos del pedido hecho, pero no la nota', () => {
      const { c } = montar();
      fillStep1(c);
      c.next();
      c.next();
      c.orderNotes.set('privado');

      c.submitOrder();

      const saved = JSON.parse(localStorage.getItem(CHECKOUT_MEMORY_KEY) as string);
      expect(saved.email).toBe('cliente@ejemplo.com');
      expect(saved.province).toBe('Santiago');
      expect(JSON.stringify(saved)).not.toContain('privado');
    });

    it('el siguiente checkout arranca con esos datos', () => {
      localStorage.setItem(
        CHECKOUT_MEMORY_KEY,
        JSON.stringify({ email: 'viejo@ejemplo.com', phone: '8095550134', fullName: 'Ya Compré', addressLine1: 'Calle 9', city: '', province: 'La Vega', postalCode: '', fulfillment: 'pickup', paymentMethodId: 'whatsapp' }),
      );

      const { c } = montar();

      expect(c.email()).toBe('viejo@ejemplo.com');
      expect(c.province()).toBe('La Vega');
      expect(c.fulfillment()).toBe('pickup');
      expect(c.selectedPaymentId()).toBe('whatsapp');
    });

    it('lo guardado es texto de fuera: basura no rompe nada', () => {
      localStorage.setItem(CHECKOUT_MEMORY_KEY, '{"email": 5, "fulfillment": "volando"');

      const { c } = montar();

      expect(c.email()).toBe('');
      expect(c.fulfillment()).toBe('shipping');
    });
  });

  it('con el carrito vacío no hay pasos: invita a ir a la tienda', () => {
    const { el } = montar([]);

    expect(el.textContent).toContain('Tu carrito está vacío');
    expect(el.querySelector('.checkout__steps')).toBeNull();
  });
});
