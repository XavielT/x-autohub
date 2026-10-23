import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-logo-hub',
  imports: [],
  templateUrl: './logo-hub.html',
  styleUrl: './logo-hub.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogoHub {
  /** Versión chica, para la barra de arriba del teléfono, donde el logo comparte fila con el buscador y el carrito. */
  readonly compact = input(false);
}
