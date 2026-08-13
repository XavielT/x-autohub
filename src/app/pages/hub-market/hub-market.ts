import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HubMarketCategory, HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';

interface HubMarketCategoryOption {
  value: 'all' | HubMarketCategory;
  label: string;
}

@Component({
  selector: 'app-hub-market',
  imports: [FormsModule, HubMarketCard],
  templateUrl: './hub-market.html',
  styleUrl: './hub-market.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubMarket implements OnInit {
  private readonly hubMarketService = inject(HubMarketService);

  private readonly allItems = signal<HubMarketItemModel[]>([]);

  readonly isLoading = signal(true);
  readonly searchQuery = signal('');
  readonly selectedCategory = signal<HubMarketCategoryOption['value']>('all');

  readonly categories: readonly HubMarketCategoryOption[] = [
    { value: 'all', label: 'Todo' },
    { value: 'vehiculos', label: 'Vehiculos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' },
  ];

  /** Se recalcula solo cuando cambian las publicaciones, la búsqueda o la categoría. */
  readonly filteredItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const category = this.selectedCategory();

    return this.allItems().filter((item) => {
      const matchesCategory = category === 'all' || item.category === category;

      const matchesSearch =
        query.length === 0 ||
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.sellerName.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  });

  ngOnInit(): void {
    this.hubMarketService.getAll().subscribe({
      next: (items) => {
        this.allItems.set(items);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  onCategorySelect(category: HubMarketCategoryOption['value']): void {
    this.selectedCategory.set(category);
  }

  getItemMeta(item: HubMarketItemModel): string {
    if (item.category === 'vehiculos' && item.vehicleSpecs) {
      return `${item.vehicleSpecs.year} • ${item.vehicleSpecs.mileage} KM`;
    }

    return `${item.location} • ${this.formatCategory(item.category)}`;
  }

  formatCategory(category: HubMarketCategory): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }
}
