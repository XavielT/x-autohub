import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { HubPartModel } from '../../../shared/models/hub-part.model';
//import { HUB_PART_MOCK } from '../../../shared/models/hub-part.mock';
import { CartService } from '../../../shared/services/cart';
import { HubPartService } from '../../../shared/services/hub-part.service';
import { ActivatedRoute } from '@angular/router';

interface CategoryOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, CatalogoCard],
  templateUrl: './catalogo.html',
  styleUrl: './catalogo.scss',
})

export class CatalogoComponent implements OnInit{
  allParts: HubPartModel[] = [];

  filteredParts: HubPartModel[] = [];
  searchQuery: string = '';
  selectedCategory: string = '';

  //category filter
  readonly categories: CategoryOption[] = [
    { value: 'frenos', label: 'Frenos' },
    { value: 'suspension', label: 'Suspensión y Chassis' },
    { value: 'motor', label: 'Motor' },
    { value: 'escape', label: 'Escape / Mufflers' },
    { value: 'filtros', label: 'Filtros' },
    { value: 'luces', label: 'Luces' },
    { value: 'electrico', label: 'Eléctrico' },
    { value: 'refrigeracion', label: 'Refrigeración' },
    { value: 'transmision', label: 'Transmisión' },
    { value: 'llantas', label: 'Aros y Gomas' },
    { value: 'bateria', label: 'Batería' },
    { value: 'audio', label: 'Audio' },
    { value: 'interior', label: 'Interior' },
    { value: 'exterior', label: 'Exterior' },
    { value: 'aceites', label: 'Aceites' },
    { value: 'detailing', label: 'Detailing' },
    { value: 'herramientas', label: 'Herramientas' },
  ];

  onSearch(): void {
    this.applyFilters();
  }

  onCategorySelect(category: string): void {
    this.selectedCategory = this.selectedCategory === category ? '' : category;
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredParts = this.allParts.filter((part: HubPartModel) => {
      const matchesSearch = part.name.toLowerCase()
        .includes(this.searchQuery.toLowerCase()) ||
        part.brand.toLowerCase().includes(this.searchQuery.toLowerCase());

      const matchesCategory = this.selectedCategory
        ? part.category === this.selectedCategory
        : true;

      return matchesSearch && matchesCategory;
    });
  }

  constructor(
    private cartService: CartService,
    private hubPartService: HubPartService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.allParts = this.hubPartService.getAll();
    this.filteredParts = [...this.allParts];

    const categoryFromUrl = this.route.snapshot.queryParamMap.get('category');
    if (categoryFromUrl && this.categories.some((category) => category.value === categoryFromUrl)) {
      this.selectedCategory = categoryFromUrl;
      this.applyFilters();
    }
  }

  openCart(): void {
    this.cartService.toggleCart();
  }
}
