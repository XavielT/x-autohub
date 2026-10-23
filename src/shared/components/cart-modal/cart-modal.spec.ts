import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CartModal } from './cart-modal';
import { CartService } from '../../services/cart.service';
import { makeProduct } from '../../testing/product.fixture';

describe('CartModal', () => {
  let component: CartModal;
  let fixture: ComponentFixture<CartModal>;
  let cart: CartService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CartModal],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(CartModal);
    component = fixture.componentInstance;
    cart = TestBed.inject(CartService);
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  const abrir = (...parts: Parameters<typeof makeProduct>[0][]) => {
    for (const p of parts) cart.addToCart(makeProduct(p));
    cart.toggleCart();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('cada línea dice su disponibilidad: en stock, bajo pedido (y cuándo llega) o agotado', () => {
    const el = abrir(
      { id: 101, stock: 4 },
      { id: 102, fulfillment: 'on_order', leadTimeDays: 10, stock: 0 },
    );

    const avail = [...el.querySelectorAll('.cart-modal__item-avail')].map((a) => a.textContent?.trim());
    expect(avail).toEqual(['En stock: 4', 'Bajo pedido: llega en 10 días']);
  });

  it('los botones de cantidad suben y bajan, y bajar de uno la quita', () => {
    const el = abrir({ id: 101, stock: 5 });
    const [menos, mas] = Array.from(el.querySelectorAll<HTMLButtonElement>('.cart-modal__qty-btn'));

    mas.click();
    fixture.detectChanges();
    expect(cart.items()[0].quantity).toBe(2);

    menos.click();
    fixture.detectChanges();
    expect(cart.items()[0].quantity).toBe(1);

    // Cada clic es sobre lo que se pinto: el boton se vuelve a dibujar con la cantidad nueva.
    el.querySelectorAll<HTMLButtonElement>('.cart-modal__qty-btn')[0].click();
    fixture.detectChanges();
    expect(cart.items()).toEqual([]);
  });

  it('el "+" se apaga al llegar a lo que queda en inventario', () => {
    const el = abrir({ id: 101, stock: 2 });
    const mas = el.querySelectorAll<HTMLButtonElement>('.cart-modal__qty-btn')[1];

    mas.click();
    fixture.detectChanges();

    expect(cart.items()[0].quantity).toBe(2);
    expect(el.querySelectorAll<HTMLButtonElement>('.cart-modal__qty-btn')[1].disabled).toBe(true);
  });

  it('una línea que pide más de lo que hay lo avisa, y el aviso del pie también', () => {
    cart.addToCart(makeProduct({ id: 101, name: 'Disco', stock: 1 }));
    cart.addToCart(makeProduct({ id: 101, name: 'Disco', stock: 1 }));
    cart.toggleCart();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.cart-modal__item-warn')?.textContent).toContain('Pides más de lo que hay');
    expect(el.querySelector('.cart-modal__issues')).not.toBeNull();
  });

  it('una pieza agotada dice que se quite', () => {
    const el = abrir({ id: 101, stock: 0 });

    expect(el.querySelector('.cart-modal__item-warn')?.textContent).toContain('Se agotó');
  });
});
