import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { Producto } from './producto';
import { ProductService } from '../../../shared/services/product.service';
import { makeProduct } from '../../../shared/testing/product.fixture';
import { ProductModel, ProductVariantModel } from '../../../shared/models/product.model';
import { CartService } from '../../../shared/services/cart.service';
import { ToastService } from '../../../shared/services/toast.service';

/**
 * La ficha: el bloque de reseñas y el JSON-LD `Product` para los buscadores. Lo demás de
 * la ficha (precio, compatibilidad, instalación) se prueba donde vive su lógica.
 */
describe('Producto (/tienda/p/:slug)', () => {
  const ld = (): Record<string, unknown> | null => {
    const script = document.head.querySelector('script[data-ld="product"]');
    return script ? JSON.parse(script.textContent ?? '{}') : null;
  };

  afterEach(() => document.head.querySelectorAll('script[data-ld]').forEach((el) => el.remove()));

  const toast = { show: vi.fn() };

  async function montar(product: ProductModel | undefined, variants: ProductVariantModel[] = []) {
    toast.show.mockClear();
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug: product?.slug ?? 'no-existe' })) } },
        { provide: ToastService, useValue: toast },
        {
          provide: ProductService,
          useValue: {
            getBySlug: () => of(product),
            getFitments: () => of([]),
            getRelated: () => of([]),
            getVariants: () => of(variants),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Producto);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra el bloque de reseñas del producto, con las de verdad', async () => {
    const { el } = await montar(makeProduct({ id: 1 }));

    expect(el.querySelector('app-reviews')).not.toBeNull();
    expect(el.querySelector('.rv__count')?.textContent?.trim()).toBe('3 reseñas');
    // Ya no queda el aviso provisional de antes de la fase 7.
    expect(el.textContent).not.toContain('TODO');
  });

  it('un producto sin reseñas las invita, y ya no dice "fase 7"', async () => {
    const { el } = await montar(makeProduct({ id: 2 }));

    expect(el.textContent).toContain('Aún no hay reseñas');
  });

  describe('opciones (color, talla…)', () => {
    const alfombra = () =>
      makeProduct({ id: 8, name: 'Alfombras', slug: 'alfombras-8', hasVariants: true, variantLabel: 'Color', stock: 8 });
    const opcion = (id: number, name: string, stock: number): ProductVariantModel => ({
      id, productId: 8, name, sku: null, stock, sortOrder: id, isActive: true,
    });
    const todas = () => [opcion(1, 'Negro', 5), opcion(2, 'Gris', 3), opcion(3, 'Beige', 0)];
    const chips = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('.prod__variant')];

    it('un producto sin opciones no muestra el selector', async () => {
      const { el } = await montar(makeProduct({ id: 2 }));

      expect(el.querySelector('.prod__variants')).toBeNull();
    });

    it('ofrece cada opción con el nombre de lo que se elige, y la agotada se marca', async () => {
      const { el } = await montar(alfombra(), todas());

      expect(el.querySelector('.prod__variants-title')?.textContent?.trim()).toBe('Color');
      expect(chips(el).map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Negro', 'Gris', 'Beige · Agotado']);
      expect(chips(el)[2].classList.contains('is-out')).toBe(true);
    });

    it('sin elegir, "Agregar" no mete nada al carrito y pide elegir', async () => {
      const { el } = await montar(alfombra(), todas());
      const cart = TestBed.inject(CartService);

      el.querySelector<HTMLButtonElement>('.prod__add')!.click();

      expect(cart.items()).toEqual([]);
      expect(toast.show).toHaveBeenCalledWith('Elige color antes de agregarlo al carrito', 'error');
    });

    it('elegir una opción la marca, la dice en el título y cambia la disponibilidad a la suya', async () => {
      const { fixture, el } = await montar(alfombra(), todas());

      chips(el)[1].click();
      fixture.detectChanges();

      expect(chips(el)[1].getAttribute('aria-checked')).toBe('true');
      expect(el.querySelector('.prod__variants-title')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Color: Gris');
      expect(el.querySelector('.prod__avail')?.textContent?.trim()).toBe('En stock: 3');
    });

    it('con la opción elegida se agrega al carrito con esa opción', async () => {
      const { fixture, el } = await montar(alfombra(), todas());
      const cart = TestBed.inject(CartService);

      chips(el)[0].click();
      fixture.detectChanges();
      el.querySelector<HTMLButtonElement>('.prod__add')!.click();

      expect(cart.items().map((i) => [i.part.id, i.variant?.name, i.quantity])).toEqual([[8, 'Negro', 1]]);
      expect(toast.show).toHaveBeenCalledWith('Alfombras (Negro) agregado al carrito');
    });

    it('una opción agotada no se puede elegir', async () => {
      const { fixture, el } = await montar(alfombra(), todas());

      chips(el)[2].click();
      fixture.detectChanges();

      expect(chips(el)[2].getAttribute('aria-checked')).toBe('false');
      expect(el.querySelector('.prod__variants-title')?.textContent?.trim()).toBe('Color');
    });

    it('al elegir una opción con foto, la galería salta a esa foto', async () => {
      const fotos = ['assets/imgs/a.jpg', 'assets/imgs/b.jpg', 'assets/imgs/c.jpg'];
      const { fixture, el } = await montar(
        { ...alfombra(), images: fotos, imgUrl: fotos[0] },
        [{ ...opcion(1, 'Negro', 5), imageUrl: fotos[2] }, opcion(2, 'Gris', 3)],
      );
      expect(el.querySelector('.gal__img')?.getAttribute('src')).toBe(fotos[0]);

      chips(el)[0].click();
      fixture.detectChanges();
      expect(el.querySelector('.gal__img')?.getAttribute('src')).toBe(fotos[2]);

      // Una opción sin foto propia deja la galería donde estaba.
      chips(el)[1].click();
      fixture.detectChanges();
      expect(el.querySelector('.gal__img')?.getAttribute('src')).toBe(fotos[2]);
    });

    it('el WhatsApp nombra la opción elegida', async () => {
      const { fixture, el } = await montar(alfombra(), todas());

      chips(el)[0].click();
      fixture.detectChanges();

      const href = decodeURIComponent(el.querySelector<HTMLAnchorElement>('.prod__ask')!.href);
      expect(href).toContain('Alfombras en Negro');
    });
  });

  describe('JSON-LD Product', () => {
    it('declara nombre, sku, marca, la oferta en DOP y la disponibilidad', async () => {
      await montar(makeProduct({ id: 2, name: 'Disco GTR', sku: 'XAH-000002', brand: 'Brembo', price: 12950, slug: 'disco-gtr-2' }));

      expect(ld()).toMatchObject({
        '@type': 'Product',
        name: 'Disco GTR',
        sku: 'XAH-000002',
        brand: { name: 'Brembo' },
        url: 'https://xautohubrd.com/tienda/p/disco-gtr-2',
        offers: { priceCurrency: 'DOP', price: '12950.00', availability: 'https://schema.org/InStock' },
      });
    });

    it('sin reseñas reales no declara aggregateRating, aunque la pieza traiga estrellas sembradas', async () => {
      await montar(makeProduct({ id: 2, starsRating: 4.9 }));

      expect(ld()).not.toHaveProperty('aggregateRating');
    });

    it('con reseñas reales, aggregateRating sale del bloque de reseñas', async () => {
      await montar(makeProduct({ id: 1 }));

      expect(ld()?.['aggregateRating']).toMatchObject({ ratingValue: 4, reviewCount: 3 });
    });

    it('un producto agotado lo dice, y uno bajo pedido también', async () => {
      await montar(makeProduct({ id: 2, stock: 0 }));
      expect((ld()?.['offers'] as { availability: string }).availability).toBe('https://schema.org/OutOfStock');
    });

    it('un producto de prueba no se anuncia a los buscadores', async () => {
      await montar(makeProduct({ id: 2, isTest: true }));

      expect(ld()).toBeNull();
    });

    it('un producto que no existe no deja JSON-LD', async () => {
      await montar(undefined);

      expect(ld()).toBeNull();
    });

    it('al salir de la ficha se quita el bloque', async () => {
      const { fixture } = await montar(makeProduct({ id: 2 }));
      expect(ld()).not.toBeNull();

      fixture.destroy();

      expect(ld()).toBeNull();
    });
  });
});
