import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';
import { HubPartModel } from '../../../shared/models/hub-part.model';
import { HUB_PART_MOCK } from '../../../shared/models/hub-part.mock';

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

export class CatalogoComponent {
  allParts: HubPartModel[] = HUB_PART_MOCK;

  filteredParts: HubPartModel[] = [...this.allParts];
  searchQuery: string = '';
  selectedCategory: string = '';

  //category filter
  readonly categories: CategoryOption[] = [
    { value: 'frenos',       label: 'Frenos' },
    { value: 'suspension',   label: 'Suspensión y Chassis' },
    { value: 'motor',        label: 'Motor' },
    { value: 'escape',       label: 'Escape / Mufflers' },
    { value: 'filtros',      label: 'Filtros' },
    { value: 'luces',        label: 'Luces' },
    { value: 'electrico',    label: 'Eléctrico' },
    { value: 'refrigeracion',label: 'Refrigeración' },
    { value: 'transmision',  label: 'Transmisión' },
    { value: 'llantas',      label: 'Aros y Gomas' },
    { value: 'bateria',      label: 'Batería' },
    { value: 'audio',        label: 'Audio' },
    { value: 'interior',     label: 'Interior' },
    { value: 'exterior',     label: 'Exterior' },
    { value: 'aceites',      label: 'Aceites' },
    { value: 'detailing',    label: 'Detailing' },
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
}
