import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AutoHubModel } from '../../models/auto-hub.model';
import { CHASIS_LABELS, FUEL_LABELS } from '../../utils/auto-hub-filters';
import { VehicleCard, VehicleCardSpec } from '../vehicle-card/vehicle-card';

/** Un vehículo oficial de Auto Hub, con la tarjeta única de vehículos. */
@Component({
  selector: 'app-autohub-card',
  imports: [VehicleCard],
  templateUrl: './autohub-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutohubCard {
  readonly autoHub = input.required<AutoHubModel>();
  /** Marca la imagen como LCP; solo para la primera tarjeta de la lista. */
  readonly priority = input(false);

  readonly specs = computed<VehicleCardSpec[]>(() => {
    const a = this.autoHub();
    return [
      { label: 'Carrocería', value: CHASIS_LABELS[a.chasisType] },
      { label: 'Tracción', value: a.traction.toUpperCase() },
      { label: 'Combustible', value: FUEL_LABELS[a.fuel] },
    ];
  });
}
