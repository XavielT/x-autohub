import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HubMarketCategory, HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { OnlineService } from '../../../shared/services/online.service';
import { SeoService } from '../../../shared/services/seo.service';
import {
  HUB_MARKET_PARAM_KEYS, HubMarketFilters, activeHubMarketFilters, filterHubMarket, hubMarketFiltersFromParams, hubMarketFiltersToParams,
} from '../../../shared/utils/hub-market-filters';

import { SearchableSelect, SelectOption } from '../../../shared/ui/searchable-select/searchable-select';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
interface HubMarketCategoryOption {
  value: 'all' | HubMarketCategory;
  label: string;
}

@Component({
  selector: 'app-hub-market',
  imports: [Skeleton, FormsModule, RouterLink, HubMarketCard, OfflineState, SearchableSelect],
  templateUrl: './hub-market.html',
  styleUrl: './hub-market.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubMarket implements OnInit {
  private readonly hubMarketService = inject(HubMarketService);
  private readonly seo = inject(SeoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Lo que trae la URL (un enlace compartido): `?cat=vehiculos&marca=Toyota`. Sin parámetros, sin filtros. */
  private readonly initial = hubMarketFiltersFromParams((key) => this.route.snapshot.queryParamMap.get(key));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.reset());

    // La búsqueda queda en la URL para poder compartirla y para que "atrás" no la pierda. Solo en el navegador: el
    // prerenderizado no tiene filtros y no debe navegar. `merge` con nulos quita los filtros que ya no están sin pisar utm_…
    effect(() => {
      const params = hubMarketFiltersToParams(this.filters());
      if (!this.isBrowser) return;
      const queryParams: Record<string, string | null> = Object.fromEntries(HUB_MARKET_PARAM_KEYS.map((k) => [k, null]));
      Object.assign(queryParams, params);
      void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
    });
  }

  private readonly allItems = signal<HubMarketItemModel[]>([]);

  protected readonly online = inject(OnlineService);

  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  readonly searchQuery = signal(this.initial.query);
  readonly selectedCategory = signal<HubMarketCategoryOption['value']>(this.initial.category);

  /**
   * Las tarjetas cuya foto carga con prioridad (LCP): las primeras tres al llegar los datos. Se fijan **una vez**, por id:
   * `NgOptimizedImage` no admite que `priority` cambie después (NG02953), y con filtros u orden las primeras cambian.
   */
  protected readonly priorityIds = signal<ReadonlySet<number>>(new Set());

  readonly categories: readonly HubMarketCategoryOption[] = [
    { value: 'all', label: 'Todo' },
    { value: 'vehiculos', label: 'Vehículos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' },
  ];

  readonly location = signal(this.initial.location);
  readonly brand = signal(this.initial.brand);
  readonly sort = signal<HubMarketFilters['sort']>(this.initial.sort);

  private readonly filters = computed<HubMarketFilters>(() => ({
    query: this.searchQuery(),
    category: this.selectedCategory(),
    location: this.location(),
    brand: this.brand(),
    sort: this.sort(),
  }));

  readonly sortOptions: readonly SelectOption[] = [
    { value: 'recientes', label: 'Más recientes' },
    { value: 'precio-asc', label: 'Precio: menor a mayor' },
    { value: 'precio-desc', label: 'Precio: mayor a menor' },
  ];

  /** Solo las ubicaciones que tienen publicaciones: filtrar por una vacía no lleva a nada. */
  readonly locationOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todo el país' },
    ...[...new Set(this.allItems().map((i) => i.location).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((value) => ({ value, label: value })),
  ]);

  readonly brandOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todas las marcas' },
    ...[
      ...new Set(
        this.allItems()
          .filter((i) => i.category === 'vehiculos')
          .map((i) => i.vehicleSpecs?.brand)
          .filter((b): b is string => !!b),
      ),
    ]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((value) => ({ value, label: value })),
  ]);

  readonly hasFilters = computed(() => activeHubMarketFilters(this.filters()) > 0);

  /** Se recalcula solo cuando cambian las publicaciones o cualquier filtro. */
  readonly filteredItems = computed(() => filterHubMarket(this.allItems(), this.filters()));

  ngOnInit(): void {
    // El mismo título que la ruta; lo que aporta es la descripción y la vista previa al compartir el enlace.
    this.seo.set({
      title: 'Hub Market — Compra y vende | X AutoHub',
      description:
        'Hub Market: compra y vende vehículos, piezas y accesorios entre la comunidad automotriz de República Dominicana.',
      path: '/hub-market',
    });
    this.load();
  }

  /** También es el "Reintentar" del estado sin conexión. */
  load(): void {
    this.hasError.set(false);
    this.isLoading.set(true);

    this.hubMarketService.getAll().subscribe({
      next: (items) => {
        this.priorityIds.set(new Set(filterHubMarket(items, this.filters()).slice(0, 3).map((i) => i.id)));
        this.allItems.set(items);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  onCategorySelect(category: HubMarketCategoryOption['value']): void {
    this.selectedCategory.set(category);
    // La marca solo existe en Vehículos: al salir de ahí no puede quedar filtrando a escondidas.
    if (category !== 'vehiculos') this.brand.set('');
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('all');
    this.location.set('');
    this.brand.set('');
    this.sort.set('recientes');
  }
}
