import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { VehicleForm } from '../vehicle-form/vehicle-form';
import { SelectedVehicle } from '../../models/product.model';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { VehicleService } from '../../services/vehicle.service';
import { ToastService } from '../../services/toast.service';

/**
 * El selector "Mi vehículo" como ventana flotante. Se monta una sola vez en el
 * shell (`app.html`) y lo abren el chip del navbar y la barra del teléfono por
 * medio de `VehiclePickerService`.
 */
@Component({
  selector: 'app-vehicle-picker-modal',
  imports: [VehicleForm],
  templateUrl: './vehicle-picker-modal.html',
  styleUrl: './vehicle-picker-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
})
export class VehiclePickerModal {
  private readonly picker = inject(VehiclePickerService);
  private readonly vehicles = inject(VehicleService);
  private readonly toast = inject(ToastService);

  readonly isOpen = this.picker.isOpen;
  readonly label = this.vehicles.selectedLabel;
  readonly hasVehicle = () => this.vehicles.selected() !== null;

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    // Al abrir, el foco pasa al diálogo: sin esto el teclado sigue en el botón de
    // atrás y un lector de pantalla no se entera de que apareció algo.
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (el) el.focus();
    });
  }

  close(): void {
    if (this.isOpen()) this.picker.close();
  }

  choose(vehicle: SelectedVehicle): void {
    this.vehicles.select(vehicle);
    this.picker.close();
    this.toast.show('Listo, vamos a mostrarte lo que le sirve a tu carro.');
  }

  clear(): void {
    this.vehicles.clear();
    this.picker.close();
    this.toast.show('Quitamos tu vehiculo.');
  }
}
