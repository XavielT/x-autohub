import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { HubMarketItemModel } from '../../models/hub-market-item.model';
import { VehicleCard, VehicleCardSpec } from '../vehicle-card/vehicle-card';

/** Un vehículo de Hub Market (de la comunidad), con la tarjeta única de vehículos. */
@Component({
  selector: 'app-car-card',
  imports: [VehicleCard],
  templateUrl: './car-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarCard {
  readonly car = input.required<HubMarketItemModel>();
  readonly priority = input(false);

  readonly link = computed(() => this.car().detailRoute || `/car-details/${this.car().id}`);

  readonly title = computed(() => {
    const s = this.car().vehicleSpecs;
    const name = [s?.brand, s?.model].filter(Boolean).join(' ');
    return name || this.car().title;
  });

  readonly meta = computed(() => `${this.car().sellerName} · ${this.car().location}`);

  /** Solo las especificaciones que tienen dato. */
  readonly specs = computed<VehicleCardSpec[]>(() => {
    const s = this.car().vehicleSpecs;
    const out: VehicleCardSpec[] = [];
    if (s?.hp != null) out.push({ label: 'HP', value: `${s.hp} HP` });
    if (s?.zeroTo100 != null) out.push({ label: '0-100', value: `${s.zeroTo100} s` });
    if (s?.topSpeed != null) out.push({ label: 'Vel. máx.', value: `${s.topSpeed} km/h` });
    return out;
  });
}
