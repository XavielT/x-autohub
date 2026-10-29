import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HubMarketCategory, HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';
import { OfflineState } from '../../../shared/components/offline-state/offline-state';
import { OnlineService } from '../../../shared/services/online.service';
import { SeoService } from '../../../shared/services/seo.service';

import { SearchableSelect, SelectOption, normalizeSearch } from '../../../shared/ui/searchable-select/searchable-select';
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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }

  private readonly allItems = signal<HubMarketItemModel[]>([]);

  protected readonly online = inject(OnlineService);

  readonly isLoading = signal(true);
  readonly hasError = signal(false);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<HubMarketCategoryOption['value']>('all');

  readonly categories: readonly HubMarketCategoryOption[] = [
    { value: 'all', label: 'Todo' },
    { value: 'vehiculos', label: 'Vehículos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' },
  ];

  readonly location = signal('');
  readonly brand = signal('');
  readonly sort = signal<'recientes' | 'precio-asc' | 'precio-desc'>('recientes');

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

  readonly hasFilters = computed(
    () =>
      this.searchQuery().trim() !== '' ||
      this.selectedCategory() !== 'all' ||
      this.location() !== '' ||
      this.brand() !== '',
  );

  /** Se recalcula solo cuando cambian las publicaciones o cualquier filtro. */
  readonly filteredItems = computed(() => {
    const query = normalizeSearch(this.searchQuery());
    const category = this.selectedCategory();
    const location = this.location();
    const brand = this.brand();

    const items = this.allItems().filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;
      const matchesLocation = location === '' || item.location === location;
      const matchesBrand = brand === '' || item.vehicleSpecs?.brand === brand;

      const matchesSearch =
        query.length === 0 ||
        normalizeSearch(item.title).includes(query) ||
        normalizeSearch(item.description).includes(query) ||
        normalizeSearch(item.sellerName).includes(query);

      return matchesCategory && matchesLocation && matchesBrand && matchesSearch;
    });

    const sort = this.sort();
    if (sort === 'precio-asc') return [...items].sort((a, b) => a.price - b.price);
    if (sort === 'precio-desc') return [...items].sort((a, b) => b.price - a.price);
    return items;
  });

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
