import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HubMarketCategory, HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';

interface HubMarketCategoryOption {
  value: 'all' | HubMarketCategory;
  label: string;
}

@Component({
  selector: 'app-hub-market',
  imports: [CommonModule, FormsModule, RouterLink, HubMarketCard],
  templateUrl: './hub-market.html',
  styleUrl: './hub-market.scss',
})
export class HubMarketComponent implements OnInit {
  allItems: HubMarketItemModel[] = [];
  filteredItems: HubMarketItemModel[] = [];
  searchQuery = '';
  selectedCategory: HubMarketCategoryOption['value'] = 'all';

  readonly categories: HubMarketCategoryOption[] = [
    { value: 'all', label: 'Todo' },
    { value: 'vehiculos', label: 'Vehiculos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' }
  ];

  constructor(private hubMarketService: HubMarketService) {}

  ngOnInit(): void {
    this.allItems = this.hubMarketService.getAll();
    this.filteredItems = [...this.allItems];
  }

  onSearch(): void {
    this.applyFilters();
  }

  onCategorySelect(category: HubMarketCategoryOption['value']): void {
    this.selectedCategory = category;
    this.applyFilters();
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

  private applyFilters(): void {
    const query = this.searchQuery.toLowerCase().trim();

    this.filteredItems = this.allItems.filter((item) => {
      const matchesCategory = this.selectedCategory === 'all' || item.category === this.selectedCategory;

      const matchesSearch =
        query.length === 0 ||
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.sellerName.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }
}
