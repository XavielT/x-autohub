import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { HubMarketItemModel } from '../../models/hub-market-item.model';

@Component({
  selector: 'app-hub-market-card',
  imports: [RouterLink, CommonModule, NgOptimizedImage],
  templateUrl: './hub-market-card.html',
  styleUrls: ['./hub-market-card.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubMarketCard {
  readonly item = input.required<HubMarketItemModel>();

  readonly itemLink = computed<string[]>(() => {
    const item = this.item();

    switch (item.category) {
      case 'vehiculos':
        return ['/car-details', item.id.toString()];
      case 'piezas':
      case 'accesorios':
        return ['/hub-market-part-details', item.id.toString()];
      default:
        return ['/hub-market'];
    }
  });

  readonly displayCategory = computed(() => {
    switch (this.item().category) {
      case 'vehiculos':
        return 'Vehículo';
      case 'piezas':
        return 'Pieza';
      case 'accesorios':
        return 'Accesorio';
      default:
        return 'Item';
    }
  });
}
