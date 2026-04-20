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
}
