import { Component, OnInit } from '@angular/core';
import { GridCatalogCard } from '../../../shared/components/grid-catalog-card/grid-catalog-card';
import { CommonModule } from '@angular/common';
import { CatalogItem } from '../../../shared/models/catalog-item.model';
import { CATALOG_ITEMS_MOCK } from '../../../shared/models/catalog-items.mock';

@Component({
  selector: 'app-home-featured-catalog',
  standalone: true,
  imports: [GridCatalogCard, CommonModule],
  templateUrl: './home-featured-catalog.html',
  styleUrl: './home-featured-catalog.scss',
})
export class HomeFeaturedCatalog {
  items: CatalogItem[] = [];

  ngOnInit(): void {
    //TODO: Implement the this.catalogService.getItems()
    this.items = CATALOG_ITEMS_MOCK;
  }
}
