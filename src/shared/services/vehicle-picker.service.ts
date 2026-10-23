import { Injectable, signal } from '@angular/core';

/**
 * Abre y cierra el selector de vehículo ("Mi vehículo").
 *
 * Existe porque quien lo abre (el chip del navbar, la barra de pestañas del
 * teléfono, el home) y quien lo dibuja (`app-vehicle-picker-modal`, montado una
 * sola vez en el shell) no se conocen. Es solo un interruptor: la elección en sí
 * la guarda `VehicleService`.
 */
@Injectable({ providedIn: 'root' })
export class VehiclePickerService {
  private readonly _isOpen = signal(false);
  readonly isOpen = this._isOpen.asReadonly();

  open(): void {
    this._isOpen.set(true);
  }

  close(): void {
    this._isOpen.set(false);
  }
}
