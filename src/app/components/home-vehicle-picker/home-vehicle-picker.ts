import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VehicleForm } from '../../../shared/components/vehicle-form/vehicle-form';
import { SelectedVehicle } from '../../../shared/models/product.model';
import { VehicleService } from '../../../shared/services/vehicle.service';

/**
 * "Elige tu vehículo": marca → modelo → año, dentro del home. Al elegir, el
 * vehículo queda guardado (en el navegador, o en el garaje si hay sesión) y el
 * chip del navbar lo muestra.
 *
 * Provisional: filtrar la tienda por compatibilidad llega en la fase 3. Mientras
 * tanto la sección guarda la elección y lleva a la tienda.
 */
@Component({
  selector: 'app-home-vehicle-picker',
  imports: [VehicleForm, RouterLink],
  templateUrl: './home-vehicle-picker.html',
  styleUrl: './home-vehicle-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeVehiclePicker {
  private readonly vehicles = inject(VehicleService);

  readonly label = this.vehicles.selectedLabel;

  choose(vehicle: SelectedVehicle): void {
    this.vehicles.select(vehicle);
  }

  clear(): void {
    this.vehicles.clear();
  }
}
