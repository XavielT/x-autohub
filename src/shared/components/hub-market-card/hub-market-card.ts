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

  /**
   * true cuando la imagen es una data URL.
   *
   * `NgOptimizedImage` las rechaza y **lanza** (NG02952), lo que abortaba el
   * render de la tarjeta completa: quedaba una caja vacía sin título ni precio.
   * Pasa en modo simulado, donde `StorageService` devuelve data URLs en vez de
   * subir a Storage, así que cualquier publicación recién hecha se veía en blanco
   * tanto aquí como en Hub Market.
   */
  readonly isDataUrl = computed(() => this.item().images[0]?.startsWith('data:') ?? false);

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
