import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HubMarketItemModel } from '../../models/hub-market-item.model';
import { CarCard } from '../car-card/car-card';
import { VehicleCard } from '../vehicle-card/vehicle-card';

/**
 * Una publicación de Hub Market. Un vehículo usa la tarjeta con especificaciones
 * (`app-car-card`); una pieza o un accesorio, la misma tarjeta en su variante cuadrada
 * y sin especificaciones.
 */
@Component({
  selector: 'app-hub-market-card',
  imports: [CarCard, VehicleCard],
  templateUrl: './hub-market-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubMarketCard {
  readonly item = input.required<HubMarketItemModel>();
  /** Marca la imagen como LCP (carga con prioridad); solo para las primeras tarjetas de la lista. */
  readonly priority = input(false);

  readonly isVehicle = computed(() => this.item().category === 'vehiculos');

  readonly itemLink = computed<string>(() => {
    const item = this.item();
    switch (item.category) {
      case 'vehiculos':
        return `/car-details/${item.id}`;
      case 'piezas':
      case 'accesorios':
        return `/hub-market-part-details/${item.id}`;
      default:
        return '/hub-market';
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
        return 'Artículo';
    }
  });

  readonly meta = computed(() => `Por ${this.item().sellerName} · ${this.item().location}`);
}
