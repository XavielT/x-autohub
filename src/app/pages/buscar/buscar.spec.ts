import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { Buscar } from './buscar';
import { ProductService } from '../../../shared/services/product.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { makeProduct } from '../../../shared/testing/product.fixture';

describe('Buscar', () => {
  const searchProducts = vi.fn();
  const searchCommunity = vi.fn();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const community: HubMarketItemModel[] = [
    { id: 7, category: 'accesorios', title: 'Rines 17', description: 'Rines', images: ['assets/imgs/hub-parts/disco-brembo-gtr.jpg'], price: 9000, location: 'Santo Domingo', sellerName: 'Vendedor' },
  ];

  async function montar(q: string | null) {
    params = new BehaviorSubject(convertToParamMap(q === null ? {} : { q }));
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        { provide: ProductService, useValue: { searchProducts, searchSuggestions: vi.fn() } },
        { provide: HubMarketService, useValue: { search: searchCommunity } },
      ],
    });
    const fixture = TestBed.createComponent(Buscar);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    searchProducts.mockReset();
    searchCommunity.mockReset();
    searchProducts.mockReturnValue(of({ items: [makeProduct({ id: 1 }), makeProduct({ id: 2 })], total: 2 }));
    searchCommunity.mockReturnValue(of([]));
  });

  it('sin consulta pide que escriban algo y no busca', async () => {
    const { el } = await montar(null);

    expect(el.textContent).toContain('Escribe el nombre de una pieza');
    expect(searchProducts).not.toHaveBeenCalled();
    expect(searchCommunity).not.toHaveBeenCalled();
  });

  it('con consulta busca en la tienda y en la comunidad, y pone el título de la pestana', async () => {
    const { el } = await montar('disco');

    expect(searchProducts).toHaveBeenCalledWith({ query: 'disco', limit: 24 });
    expect(searchCommunity).toHaveBeenCalledWith('disco');
    expect(el.querySelector('h1')?.textContent).toContain('disco');
    expect(TestBed.inject(Title).getTitle()).toBe('disco — Buscar | X AutoHub');
    expect(el.querySelectorAll('#bus-store ~ ul app-catalogo-card, .bus__section:not(.bus__section--community) app-catalogo-card').length).toBe(2);
  });

  it('lo de la comunidad va en su propia sección, con su aviso, separado de la tienda', async () => {
    searchCommunity.mockReturnValue(of(community));
    const { el } = await montar('rines');

    const section = el.querySelector('.bus__section--community')!;
    expect(section.querySelector('.bus__h2')?.textContent).toContain('De la comunidad');
    expect(section.textContent).toContain('no X AutoHub');
    expect(section.querySelectorAll('app-hub-market-card').length).toBe(1);
    expect(el.querySelector('.bus__section:not(.bus__section--community) app-hub-market-card')).toBeNull();
  });

  it('si la tienda no tiene nada lo dice, y la comunidad se muestra igual', async () => {
    searchProducts.mockReturnValue(of({ items: [], total: 0 }));
    searchCommunity.mockReturnValue(of(community));
    const { el } = await montar('rines');

    expect(el.textContent).toContain('No encontramos nada en la tienda');
    expect(el.querySelectorAll('.bus__section--community app-hub-market-card').length).toBe(1);
  });

  it('si falla la tienda avisa, y la comunidad se muestra igual', async () => {
    searchProducts.mockReturnValue(throwError(() => new Error('caido')));
    searchCommunity.mockReturnValue(of(community));
    const { el } = await montar('rines');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('No pudimos buscar en la tienda');
    expect(el.querySelectorAll('.bus__section--community app-hub-market-card').length).toBe(1);
  });

  it('si falla la comunidad, la tienda se muestra igual', async () => {
    searchCommunity.mockReturnValue(throwError(() => new Error('caido')));
    const { el } = await montar('disco');

    expect(el.querySelectorAll('.bus__section:not(.bus__section--community) app-catalogo-card').length).toBe(2);
    expect(el.textContent).toContain('Nada de la comunidad');
  });

  it('si hay más resultados que los que se muestran, lo dice', async () => {
    searchProducts.mockReturnValue(of({ items: [makeProduct({ id: 1 })], total: 40 }));
    const { el } = await montar('filtro');

    expect(el.querySelector('.bus__more')?.textContent).toContain('1 de 40');
  });
});
