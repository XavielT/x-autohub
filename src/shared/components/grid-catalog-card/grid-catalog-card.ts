import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CatalogItem } from '../../models/catalog-item.model';

@Component({
  selector: 'app-grid-catalog-card',
  standalone: true,
  imports: [RouterLink, CommonModule, RouterModule, NgOptimizedImage],
  templateUrl: './grid-catalog-card.html',
  styleUrl: './grid-catalog-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GridCatalogCard {
  readonly item = input.required<CatalogItem>();

  readonly catalogLink: readonly string[] = ['/catalogo'];

  readonly catalogQueryParams = computed<{ category: string }>(() => ({
    category: this.resolveCatalogCategory(),
  }));

  private resolveCatalogCategory(): string {
    const item = this.item();
    const key = `${item.category} ${item.title}`.toLowerCase();

    if (key.includes('suspension')) return 'suspension';
    if (key.includes('motor') || key.includes('escape')) return 'motor';
    if (key.includes('aros') || key.includes('wheel')) return 'llantas';
    if (key.includes('accesorios') || key.includes('interior') || key.includes('exterior')) return 'exterior';

    return 'motor';
  }
}
