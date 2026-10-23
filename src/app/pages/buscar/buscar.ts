import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';
import { SearchBox } from '../../../shared/components/search-box/search-box';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { ProductModel } from '../../../shared/models/product.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { ProductService } from '../../../shared/services/product.service';

/** Cuántos productos de la tienda se muestran en los resultados. */
const STORE_LIMIT = 24;

interface Results {
  query: string;
  store: ProductModel[];
  storeTotal: number;
  community: HubMarketItemModel[];
}

/**
 * Resultados de búsqueda, `/buscar?q=`.
 *
 * Arriba, lo de la tienda de X AutoHub; abajo, **separado y con su título**, lo
 * que publica la comunidad en Hub Market. No se mezclan: comprarle a la tienda y
 * comprarle a un particular son dos promesas distintas, y el visitante tiene que
 * saber a cuál está mirando. Si la tienda no tiene nada se dice, y lo de la
 * comunidad se muestra igual.
 */
@Component({
  selector: 'app-buscar',
  imports: [CatalogoCard, HubMarketCard, SearchBox, RouterLink],
  templateUrl: './buscar.html',
  styleUrl: './buscar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Buscar {
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(ProductService);
  private readonly hubMarket = inject(HubMarketService);
  private readonly title = inject(Title);

  readonly isLoading = signal(false);
  readonly hasError = signal(false);

  readonly results = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => (params.get('q') ?? '').trim()),
      tap((query) => {
        this.hasError.set(false);
        this.isLoading.set(query !== '');
        this.title.setTitle(query ? `${query} — Buscar | X AutoHub` : 'Buscar | X AutoHub');
      }),
      switchMap((query) => (query ? this.search(query) : of(this.empty(query)))),
      tap(() => this.isLoading.set(false)),
    ),
    { initialValue: this.empty('') },
  );

  readonly query = computed(() => this.results().query);

  private empty(query: string): Results {
    return { query, store: [], storeTotal: 0, community: [] };
  }

  /**
   * Las dos búsquedas a la vez. Si falla una, la otra se muestra igual: perder la
   * comunidad por un error de la tienda (o al revés) sería peor que mostrar la
   * mitad.
   */
  private search(query: string) {
    return forkJoin({
      store: this.products
        .searchProducts({ query, limit: STORE_LIMIT })
        .pipe(
          catchError(() => {
            this.hasError.set(true);
            return of({ items: [] as ProductModel[], total: 0 });
          }),
        ),
      community: this.hubMarket.search(query).pipe(catchError(() => of([] as HubMarketItemModel[]))),
    }).pipe(
      map(({ store, community }) => ({
        query,
        store: store.items,
        storeTotal: store.total,
        community,
      })),
    );
  }
}
