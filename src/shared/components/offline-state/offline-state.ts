import { ChangeDetectionStrategy, Component, output } from '@angular/core';

/**
 * El estado de una lista que no pudo cargar porque no hay red. El shell y la
 * navegación siguen funcionando: solo los datos (precios, stock, citas) necesitan
 * conexión, y a propósito no se guardan para mostrarlos viejos.
 */
@Component({
  selector: 'app-offline-state',
  templateUrl: './offline-state.html',
  styleUrl: './offline-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfflineState {
  readonly retry = output<void>();
}
