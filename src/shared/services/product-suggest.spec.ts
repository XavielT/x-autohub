import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { AuthService } from './auth.service';
import { ProductService } from './product.service';

/**
 * `suggestProducts()` contra una base "real" de mentira: lo que importa es que use
 * `suggest_products()`, que traduzca el alias y que, si la función aún no existe (frontend
 * desplegado antes que la migración 0042), caiga a `search_products()` y no deje al buscador mudo.
 */
describe('ProductService.suggestProducts', () => {
  function montar(rpc: (name: string) => unknown) {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => null } },
        {
          provide: SupabaseService,
          useValue: { shouldUseMockData: () => false, db: { rpc: vi.fn((name: string) => Promise.resolve(rpc(name))) } },
        },
      ],
    });
    return TestBed.inject(ProductService);
  }

  const FILA = {
    id: 7,
    slug: 'parachoques-gtr',
    name: 'Parachoques GTR',
    brand: 'Nismo',
    img_url: 'assets/x.jpg',
    price: 5000,
    stock: 3,
    fulfillment: 'stock',
    matched_alias: 'bumper',
    score: 0.6,
  };

  it('traduce la fila y conserva el alias que coincidió', async () => {
    const service = montar(() => ({ data: [FILA], error: null }));

    const [s] = await firstValueFrom(service.suggestProducts('bump', 6));

    expect(s).toEqual({
      id: 7,
      slug: 'parachoques-gtr',
      name: 'Parachoques GTR',
      brand: 'Nismo',
      imgUrl: 'assets/x.jpg',
      price: 5000,
      matchedAlias: 'bumper',
    });
  });

  it('sin alias, la sugerencia no trae la propiedad', async () => {
    const service = montar(() => ({ data: [{ ...FILA, matched_alias: null }], error: null }));

    const [s] = await firstValueFrom(service.suggestProducts('par', 6));

    expect('matchedAlias' in s).toBe(false);
  });

  it('si suggest_products no existe todavía, cae a search_products', async () => {
    const llamadas: string[] = [];
    const service = montar((name) => {
      llamadas.push(name);
      return name === 'suggest_products'
        ? { data: null, error: { code: 'PGRST202', message: 'function not found' } }
        : { data: [], error: null };
    });

    const result = await firstValueFrom(service.suggestProducts('par', 6));

    expect(llamadas).toEqual(['suggest_products', 'search_products']);
    expect(result).toEqual([]);
  });
});
