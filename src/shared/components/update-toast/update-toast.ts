import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PwaUpdateService } from '../../services/pwa-update.service';

/**
 * "Hay una versión nueva · Actualizar". No es el `ToastService` de siempre: ese se
 * apaga a los 3 segundos y este tiene que esperar a que alguien decida.
 */
@Component({
  selector: 'app-update-toast',
  templateUrl: './update-toast.html',
  styleUrl: './update-toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateToast {
  readonly updates = inject(PwaUpdateService);
}
