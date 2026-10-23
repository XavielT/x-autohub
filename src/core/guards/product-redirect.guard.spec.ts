import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { productIdRedirectGuard } from './product-redirect.guard';
import { ProductService } from '../../shared/services/product.service';
import { makeProduct } from '../../shared/testing/product.fixture';

/** `/hub-part-details/:id` ya no es una pagina: solo manda a la ficha por slug. */
describe('productIdRedirectGuard', () => {
  const getById = vi.fn();

  function run(id: string) {
    TestBed.configureTestingModule({ providers: [{ provide: ProductService, useValue: { getById } }] });
    const route = { paramMap: convertToParamMap({ id }) } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => productIdRedirectGuard(route, {} as RouterStateSnapshot));
  }

  beforeEach(() => getById.mockReset());

  it('un id que existe va a la ficha por slug', async () => {
    getById.mockReturnValue(of(makeProduct({ id: 2, slug: 'filtro-de-aire' })));

    const result = (await run('2')) as UrlTree;

    expect(result.toString()).toBe('/tienda/p/filtro-de-aire');
    expect(getById).toHaveBeenCalledWith(2);
  });

  it('un id que ya no existe va a la tienda, no a un error', async () => {
    getById.mockReturnValue(of(undefined));

    expect(((await run('999')) as UrlTree).toString()).toBe('/tienda');
  });

  it('un id que no es un numero ni consulta el servicio', async () => {
    expect(((await run('abc')) as UrlTree).toString()).toBe('/tienda');
    expect(getById).not.toHaveBeenCalled();
  });

  it('si el servicio falla tambien va a la tienda', async () => {
    getById.mockReturnValue(throwError(() => new Error('caido')));

    expect(((await run('2')) as UrlTree).toString()).toBe('/tienda');
  });
});
