import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { VehicleForm } from '../vehicle-form/vehicle-form';
import { SelectedVehicle } from '../../models/product.model';
import { VehiclePickerService } from '../../services/vehicle-picker.service';
import { VehicleService } from '../../services/vehicle.service';
import { ToastService } from '../../services/toast.service';
import { trackKeyboard } from '../../utils/keyboard-inset';

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

  /**
   * Solo en el teléfono (el modal sale como hoja inferior): cuánto sube para quedar justo encima
   * del teclado y cuánto puede medir. Sin esto el teclado tapa la parte de abajo, y con ella el
   * botón "Usar este vehículo". Fuera del teléfono valen `null` y manda el SCSS.
   */
  protected readonly sheetInset = signal(0);
  protected readonly sheetMax = signal<number | null>(null);

  constructor() {
    // Al abrir, el foco pasa al diálogo: sin esto el teclado sigue en el botón de
    // atrás y un lector de pantalla no se entera de que apareció algo.
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (el) el.focus();
    });

    // Mientras el modal está abierto, sigue al teclado.
    effect((onCleanup) => {
      if (!this.isOpen()) return;
      const stop = trackKeyboard(900, ({ inset, free }) => {
        this.sheetInset.set(inset);
        this.sheetMax.set(Math.floor(Math.min(window.innerHeight * 0.9, free - 16)));
      });
      onCleanup(() => {
        stop?.();
        this.sheetInset.set(0);
        this.sheetMax.set(null);
      });
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
    this.toast.show('Quitamos tu vehículo.');
  }
}
