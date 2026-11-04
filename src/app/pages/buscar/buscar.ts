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
import { AiSearchService, ParsedSearch, understoodChips } from '../../../shared/services/ai-search.service';
import { VehicleService } from '../../../shared/services/vehicle.service';

import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
/** Cuántos productos de la tienda se muestran en los resultados. */
const STORE_LIMIT = 24;

interface Results {
  query: string;
  store: ProductModel[];
  storeTotal: number;
  community: HubMarketItemModel[];
  /** Lo que entendió la IA de la frase y con lo que se refinó la búsqueda (migración 0054). `null` = búsqueda normal. */
  understood: ParsedSearch | null;
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
  imports: [Skeleton, CatalogoCard, HubMarketCard, SearchBox, RouterLink],
  templateUrl: './buscar.html',
  styleUrl: './buscar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Buscar {
  private readonly route = inject(ActivatedRoute);
  private readonly products = inject(ProductService);
  private readonly hubMarket = inject(HubMarketService);
  private readonly title = inject(Title);
  private readonly aiSearch = inject(AiSearchService);
  private readonly vehicles = inject(VehicleService);

  readonly isLoading = signal(false);
  readonly hasError = signal(false);

  readonly results = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => ({ query: (params.get('q') ?? '').trim(), skipAi: params.get('ia') === '0' })),
      tap(({ query }) => {
        this.hasError.set(false);
        this.isLoading.set(query !== '');
        this.title.setTitle(query ? `${query} — Buscar | X AutoHub` : 'Buscar | X AutoHub');
      }),
      switchMap(({ query, skipAi }) => (query ? this.search(query, skipAi) : of(this.empty(query)))),
      tap(() => this.isLoading.set(false)),
    ),
    { initialValue: this.empty('') },
  );

  readonly query = computed(() => this.results().query);

  private empty(query: string): Results {
    return { query, store: [], storeTotal: 0, community: [], understood: null };
  }

  /** Los chips "Entendí: Toyota Corolla 2015 · Luces". */
  readonly chips = computed(() => {
    const u = this.results().understood;
    return u ? understoodChips(u) : [];
  });

  /**
   * Las dos búsquedas a la vez. Si falla una, la otra se muestra igual: perder la
   * comunidad por un error de la tienda (o al revés) sería peor que mostrar la
   * mitad.
   */
  private search(query: string, skipAi = false) {
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
      map(({ store, community }): Results => ({
        query,
        store: store.items,
        storeTotal: store.total,
        community,
        understood: null,
      })),
      // Heurística primero, IA después: solo si hace falta, y cualquier fallo deja la búsqueda normal, en silencio.
      switchMap((base) => (skipAi ? of(base) : this.refine(query, base))),
      tap((r) => this.aiSearch.logSearch(query, r.storeTotal, this.vehicles.selected() !== null)),
    );
  }

  private refine(query: string, base: Results) {
    const vehicle = this.vehicles.selected();
    if (!this.aiSearch.shouldAsk(query, base.storeTotal, vehicle !== null)) return of(base);

    return this.aiSearch.parse(query, vehicle).pipe(
      switchMap((parsed) => {
        if (!parsed) return of(base);
        // "Quiero que me cambien el aceite": se sugiere cotizar y la búsqueda se queda como estaba.
        if (parsed.intent === 'servicio') return of({ ...base, understood: parsed });

        const text = parsed.terms.join(' ') || parsed.correctedQuery || undefined;
        return this.products
          .searchProducts({
            query: text,
            makeId: parsed.makeId ?? undefined,
            modelId: parsed.modelId ?? undefined,
            year: parsed.year ?? undefined,
            categorySlug: parsed.categorySlug ?? undefined,
            limit: STORE_LIMIT,
          })
          .pipe(
            // Si lo refinado no trae nada, se queda lo de la búsqueda normal y no se enseñan chips que no ayudaron.
            map((r): Results => (r.total > 0 ? { ...base, store: r.items, storeTotal: r.total, understood: parsed } : base)),
            catchError(() => of(base)),
          );
      }),
      catchError(() => of(base)),
    );
  }
}
