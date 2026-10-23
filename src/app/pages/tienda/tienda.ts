import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, map } from 'rxjs';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { StoreFiltersPanel } from '../../../shared/components/store-filters/store-filters';
import {
  ProductCategoryModel,
  ProductModel,
  ProductSearchParams,
  ProductSort,
} from '../../../shared/models/product.model';
import { CategoryService } from '../../../shared/services/category.service';
import { OnlineService } from '../../../shared/services/online.service';
import { ProductService } from '../../../shared/services/product.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { LEGACY_CATEGORY_TO_SLUG } from '../../../shared/utils/legacy-categories';
import { fitsVehicle } from '../../../shared/utils/product-search';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  StoreFilters,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
} from '../../../shared/utils/store-filters';
import { storeWhatsAppLink } from '../../../shared/utils/contact';

/** Cuántos productos se piden por página. El botón "Cargar más" pide la siguiente. */
export const PAGE_SIZE = 24;

/**
 * La tienda: `/tienda` y `/tienda/c/:slug` (una categoría).
 *
 * Columna de filtros a la izquierda en escritorio y hoja "Filtros" en el
 * teléfono. Los filtros viven en la URL —se pueden compartir y recargar—, y cada
 * cambio de filtro es una navegación: la página reacciona a la URL, no a un
 * estado propio, que es lo que mantiene los dos sitios (columna y hoja) y el
 * botón de atrás de acuerdo.
 *
 * Con un vehículo elegido, por omisión solo se muestra lo que le sirve (lo
 * universal y lo que declara compatibilidad con él); el filtro se puede apagar y
 * una franja arriba lo avisa. Las tarjetas que le sirven llevan el check verde
 * aunque el filtro esté apagado.
 */
@Component({
  selector: 'app-tienda',
  imports: [CatalogoCard, StoreFiltersPanel, RouterLink, OfflineState],
  templateUrl: './tienda.html',
  styleUrl: './tienda.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tienda {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly pageTitle = inject(Title);
  protected readonly online = inject(OnlineService);

  readonly sortOptions = SORT_OPTIONS;
  readonly helpLink = storeWhatsAppLink('Hola X AutoHub, tengo una duda sobre la compatibilidad de una pieza');

  readonly tree = toSignal(this.categoryService.getTree(), { initialValue: [] });
  readonly facets = toSignal(this.productService.getFacets(), { initialValue: { brands: [], maxPrice: 0 } });

  /** Los filtros que dice la URL, la ruta incluida (`/tienda/c/:slug`). */
  readonly filters = toSignal(
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      map(([path, query]) => parseFilters(path, query)),
    ),
    { initialValue: EMPTY_FILTERS },
  );

  readonly vehicle = this.vehicles.selected;
  readonly vehicleLabel = this.vehicles.selectedLabel;

  /** Hay vehículo y el filtro de compatibilidad no se apagó. */
  readonly useVehicle = computed(() => this.vehicle() !== null && this.filters().compatible !== false);

  readonly items = signal<ProductModel[]>([]);
  readonly total = signal(0);
  readonly isLoading = signal(true);
  readonly isLoadingMore = signal(false);
  readonly hasError = signal(false);
  /** Los productos de la lista que le sirven al vehículo elegido: llevan el check verde. */
  readonly compatibleIds = signal<ReadonlySet<number>>(new Set());

  readonly filtersOpen = signal(false);

  readonly isFiltered = computed(() => hasActiveFilters(this.filters()));

  /** Cuántos filtros hay puestos, para el botón "Filtros (3)" del teléfono. */
  readonly activeCount = computed(() => {
    const f = this.filters();
    return [
      f.categorySlug !== '',
      f.brand !== '',
      f.minPrice !== null || f.maxPrice !== null,
      f.inStockOnly,
      f.compatible === false,
    ].filter(Boolean).length;
  });

  /** La categoría de la URL, para el título de la página. */
  readonly activeCategory = computed<ProductCategoryModel | undefined>(() => {
    const slug = this.filters().categorySlug;
    if (!slug) return undefined;
    for (const root of this.tree()) {
      if (root.slug === slug) return root;
      const child = root.children.find((c) => c.slug === slug);
      if (child) return child;
    }
    return undefined;
  });

  readonly heading = computed(() => this.activeCategory()?.name ?? 'Tienda');

  readonly canLoadMore = computed(() => this.items().length < this.total());

  /** Los parámetros de la búsqueda, sin la paginación. */
  private readonly searchParams = computed<ProductSearchParams>(() => {
    const f = this.filters();
    const v = this.useVehicle() ? this.vehicle() : null;
    return {
      categorySlug: f.categorySlug || undefined,
      brand: f.brand || undefined,
      minPrice: f.minPrice ?? undefined,
      maxPrice: f.maxPrice ?? undefined,
      inStockOnly: f.inStockOnly || undefined,
      sort: f.sort,
      makeId: v?.makeId,
      modelId: v?.modelId,
      year: v?.year,
    };
  });

  /** Cada petición lleva un número; la respuesta de una vieja (otro filtro) se descarta. */
  private requestId = 0;

  constructor() {
    // Cambia un filtro o el vehículo: se vuelve a la primera página.
    effect(() => {
      const params = this.searchParams();
      const vehicle = this.vehicle();
      untracked(() => this.fetch(params, vehicle, 0));
    });

    effect(() => {
      const heading = this.heading();
      this.pageTitle.setTitle(
        heading === 'Tienda' ? 'Tienda — Accesorios y piezas | X AutoHub' : `${heading} — Tienda | X AutoHub`,
      );
    });
  }

  private fetch(
    params: ProductSearchParams,
    vehicle: { makeId: number; modelId: number; year: number } | null,
    offset: number,
  ): void {
    const id = ++this.requestId;
    this.hasError.set(false);
    if (offset === 0) this.isLoading.set(true);
    else this.isLoadingMore.set(true);

    this.productService.searchProducts({ ...params, limit: PAGE_SIZE, offset }).subscribe({
      next: (result) => {
        if (id !== this.requestId) return;
        this.items.update((current) => (offset === 0 ? result.items : [...current, ...result.items]));
        this.total.set(result.total);
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
        this.markCompatible(result.items, vehicle, offset === 0);
      },
      error: () => {
        if (id !== this.requestId) return;
        this.hasError.set(true);
        this.isLoading.set(false);
        this.isLoadingMore.set(false);
      },
    });
  }

  /** Marca las tarjetas que le sirven al vehículo, aunque el filtro esté apagado. */
  private markCompatible(
    items: ProductModel[],
    vehicle: { makeId: number; modelId: number; year: number } | null,
    replace: boolean,
  ): void {
    if (replace) this.compatibleIds.set(new Set());
    if (vehicle === null || items.length === 0) return;

    this.productService.getFitmentsFor(items.map((p) => p.id)).subscribe({
      next: (fitments) => {
        const fits = items.filter((p) => fitsVehicle(p, fitments, vehicle)).map((p) => p.id);
        this.compatibleIds.update((current) => new Set([...current, ...fits]));
      },
      // Sin la compatibilidad solo falta el check verde: la lista sirve igual.
      error: () => undefined,
    });
  }

  loadMore(): void {
    if (this.isLoadingMore() || !this.canLoadMore()) return;
    this.fetch(this.searchParams(), this.vehicle(), this.items().length);
  }

  retry(): void {
    this.fetch(this.searchParams(), this.vehicle(), 0);
  }

  /** Un cambio de filtros es una navegación: la URL manda. */
  applyFilters(next: StoreFilters): void {
    const query = { ...filtersToParams(next), categoria: null };
    const commands = next.categorySlug ? ['/tienda', 'c', next.categorySlug] : ['/tienda'];
    void this.router.navigate(commands, { queryParams: query });
  }

  onSort(event: Event): void {
    this.applyFilters({ ...this.filters(), sort: (event.target as HTMLSelectElement).value as ProductSort });
  }

  clearFilters(): void {
    this.applyFilters({ ...EMPTY_FILTERS, sort: this.filters().sort });
  }

  /** "Ver todo" de la franja del vehículo: apaga el filtro de compatibilidad. */
  showEverything(): void {
    this.applyFilters({ ...this.filters(), compatible: false });
  }

  pickVehicle(): void {
    this.filtersOpen.set(false);
    this.picker.open();
  }

  openFilters(): void {
    this.filtersOpen.set(true);
  }

  closeFilters(): void {
    this.filtersOpen.set(false);
  }
}

/**
 * Los filtros de la URL. La categoría puede venir de tres sitios, por orden:
 *   1. la ruta, `/tienda/c/:slug` (la forma nueva);
 *   2. `?categoria=<slug>` (los enlaces de la fase 2, ya publicados);
 *   3. `?category=<texto>` (los enlaces de antes del pivote, de las 17 categorías
 *      de texto), que se traduce con el mismo mapeo que usó la migración 0017.
 */
export function parseFilters(path: ParamMap, query: ParamMap): StoreFilters {
  const base = filtersFromParams((key) => query.get(key));
  const legacy = query.get('category');
  const categorySlug = path.get('slug') ?? (base.categorySlug || (legacy ? (LEGACY_CATEGORY_TO_SLUG[legacy] ?? '') : ''));
  return { ...base, categorySlug };
}
