import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { CatalogoCard } from './catalogo-card';
import { CartService } from '../../services/cart.service';
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

    it('el botón no agrega nada al carrito: lleva a la ficha, donde se elige', async () => {
      const { el } = await montar();
      const cart = TestBed.inject(CartService);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      el.querySelector<HTMLButtonElement>('.hub-part-card__cart-button')!.click();

      expect(cart.items()).toEqual([]);
      expect(navigate).toHaveBeenCalledWith(['/tienda', 'p', 'alfombras-8']);
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
