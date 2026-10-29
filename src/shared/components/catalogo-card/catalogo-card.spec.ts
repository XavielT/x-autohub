import { TestBed } from '@angular/core/testing';

import { CatalogoCard } from './catalogo-card';
import { throwError } from 'rxjs';
import { CartService } from '../../services/cart.service';
import { ProductService } from '../../services/product.service';
import { HUB_PART_MOCK } from '../../data/hub-part.mock';
import { makeProduct } from '../../testing/product.fixture';

describe('CatalogoCard', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CatalogoCard],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  it('should create', async () => {
    const fixture = TestBed.createComponent(CatalogoCard);
    fixture.componentRef.setInput('hubPart', HUB_PART_MOCK[0]);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('si la foto no carga o no existe, muestra el ícono de respaldo', async () => {
    const fixture = TestBed.createComponent(CatalogoCard);
    fixture.componentRef.setInput('hubPart', makeProduct({ id: 3, imgUrl: 'assets/imgs/x.jpg' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.imageSrc()).toBe('assets/imgs/x.jpg');

    fixture.componentInstance.imageFailed.set(true);
    expect(fixture.componentInstance.imageSrc()).toBe('assets/icons/part-placeholder.svg');

    const sinFoto = TestBed.createComponent(CatalogoCard);
    sinFoto.componentRef.setInput('hubPart', makeProduct({ id: 4, imgUrl: '' }));
    await sinFoto.whenStable();
    expect(sinFoto.componentInstance.imageSrc()).toBe('assets/icons/part-placeholder.svg');
  });

  describe('con opciones', () => {
    async function montar(over: Parameters<typeof makeProduct>[0] = {}) {
      const fixture = TestBed.createComponent(CatalogoCard);
      fixture.componentRef.setInput(
        'hubPart',
        makeProduct({ id: 8, slug: 'alfombras-8', hasVariants: true, variantLabel: 'Color', stock: 8, ...over }),
      );
      await fixture.whenStable();
      return { fixture, el: fixture.nativeElement as HTMLElement };
    }

    it('dice que hay que elegir ("Elige color") y el botón lo anuncia', async () => {
      const { el } = await montar();

      expect(el.querySelector('.hub-part-card__options')?.textContent?.trim()).toBe('Elige color');
      expect(el.querySelector('.hub-part-card__cart-button')?.getAttribute('aria-label')).toBe('Elegir color de Producto 8');
    });

    it('sin etiqueta dice "Elige opción"', async () => {
      const { el } = await montar({ variantLabel: '' });

      expect(el.querySelector('.hub-part-card__options')?.textContent?.trim()).toBe('Elige opción');
    });

    const chips = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.hub-part-card__chip')];

    it('el botón no agrega nada: abre el selector con las opciones del producto', async () => {
      const { fixture, el } = await montar();
      const cart = TestBed.inject(CartService);

      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();
      fixture.detectChanges();

      expect(cart.items()).toEqual([]);
      expect(el.querySelector('.hub-part-card__chooser-title')?.textContent?.trim()).toBe('Elige color');
      expect(chips(el).map((c) => c.textContent?.trim())).toEqual(['Negro', 'Gris', 'Beige']);
      expect(el.querySelector('.hub-part-card__cart-button')?.getAttribute('aria-expanded')).toBe('true');
    });

    it('elegir una opción la agrega al carrito con esa opción y cierra el selector', async () => {
      const { fixture, el } = await montar();
      const cart = TestBed.inject(CartService);
      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();
      fixture.detectChanges();

      chips(el)[1].click();
      fixture.detectChanges();

      expect(cart.items().map((i) => [i.part.id, i.variant?.name, i.quantity])).toEqual([[8, 'Gris', 1]]);
      expect(el.querySelector('.hub-part-card__chooser')).toBeNull();
    });

    it('"Cancelar" cierra el selector sin agregar nada', async () => {
      const { fixture, el } = await montar();
      const cart = TestBed.inject(CartService);
      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.hub-part-card__chooser-close')!.click();
      fixture.detectChanges();

      expect(el.querySelector('.hub-part-card__chooser')).toBeNull();
      expect(cart.items()).toEqual([]);
    });

    it('una opción agotada no se puede elegir', async () => {
      const { fixture, el } = await montar();
      const cart = TestBed.inject(CartService);
      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();
      fixture.detectChanges();
      fixture.componentInstance.variants.update((list) => list.map((v, i) => (i === 0 ? { ...v, stock: 0 } : v)));
      fixture.detectChanges();

      chips(el)[0].click();
      fixture.detectChanges();

      expect(chips(el)[0].classList.contains('is-out')).toBe(true);
      expect(cart.items()).toEqual([]);
    });

    it('las opciones se piden una sola vez, aunque se abra y se cierre', async () => {
      const { fixture, el } = await montar();
      const products = TestBed.inject(ProductService);
      const spy = vi.spyOn(products, 'getVariants');
      const button = el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!;

      button.click(); fixture.detectChanges();
      button.click(); fixture.detectChanges();
      button.click(); fixture.detectChanges();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('si no se pueden cargar, lo dice y ofrece abrir el producto', async () => {
      const { fixture, el } = await montar();
      vi.spyOn(TestBed.inject(ProductService), 'getVariants').mockReturnValue(throwError(() => new Error('sin red')));

      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();
      fixture.detectChanges();

      expect(el.querySelector('.hub-part-card__chooser-note')?.textContent).toContain('No pudimos cargar');
      expect(el.querySelector('.hub-part-card__chooser-link')?.getAttribute('href')).toBe('/tienda/p/alfombras-8');
    });

    it('un producto sin opciones se agrega directo, como siempre', async () => {
      const { el } = await montar({ hasVariants: false, variantLabel: '' });
      const cart = TestBed.inject(CartService);

      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();

      expect(cart.items().length).toBe(1);
      expect(el.querySelector('.hub-part-card__options')).toBeNull();
    });
  });
});
