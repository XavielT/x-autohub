import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { Producto } from './producto';
import { ProductService } from '../../../shared/services/product.service';
import { makeProduct } from '../../../shared/testing/product.fixture';
import { ProductModel } from '../../../shared/models/product.model';

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

  async function montar(product: ProductModel | undefined) {
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ slug: product?.slug ?? 'no-existe' })) } },
        {
          provide: ProductService,
          useValue: {
            getBySlug: () => of(product),
            getFitments: () => of([]),
            getRelated: () => of([]),
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
