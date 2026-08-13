import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { GridCatalogCard } from '../../../shared/components/grid-catalog-card/grid-catalog-card';
import { CatalogItem } from '../../../shared/models/catalog-item.model';
import { CatalogSectionsService } from '../../../shared/services/catalog-sections.service';

@Component({
  selector: 'app-home-featured-catalog',
  standalone: true,
  imports: [GridCatalogCard],
  templateUrl: './home-featured-catalog.html',
  styleUrl: './home-featured-catalog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFeaturedCatalog implements OnInit {
  private readonly catalogSections = inject(CatalogSectionsService);

  readonly items = signal<CatalogItem[]>([]);

  ngOnInit(): void {
    this.catalogSections.getSections().subscribe((items) => this.items.set(items));
  }
}
