import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CatalogItem } from '../../models/catalog-item.model';

@Component({
  selector: 'app-grid-catalog-card',
  standalone: true,
  imports: [RouterLink, CommonModule, RouterModule,],
  templateUrl: './grid-catalog-card.html',
  styleUrl: './grid-catalog-card.scss',
})
export class GridCatalogCard {
  @Input({required: true}) item!: CatalogItem;

  get catalogLink(): string[] {
    return ['/catalogo'];
  }

  get catalogQueryParams(): { category: string } {
    return { category: this.resolveCatalogCategory() };
  }

  private resolveCatalogCategory(): string {
    const key = `${this.item.category} ${this.item.title}`.toLowerCase();

    if (key.includes('suspension')) return 'suspension';
    if (key.includes('motor') || key.includes('escape')) return 'motor';
    if (key.includes('aros') || key.includes('wheel')) return 'llantas';
    if (key.includes('accesorios') || key.includes('interior') || key.includes('exterior')) return 'exterior';

    return 'motor';
  }
}
