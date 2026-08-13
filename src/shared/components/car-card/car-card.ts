import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HubMarketItemModel } from '../../models/hub-market-item.model';

@Component({
  selector: 'app-car-card',
  standalone: true,
  imports: [RouterLink, CommonModule, NgOptimizedImage],
  templateUrl: './car-card.html',
  styleUrl: './car-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarCard {
  readonly car = input.required<HubMarketItemModel>();
}
