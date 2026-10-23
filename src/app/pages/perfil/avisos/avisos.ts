import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { PushService } from '../../../../shared/services/push.service';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * "Avisos en este dispositivo": activar o quitar las notificaciones push de pedidos y citas.
 *
 * Es por dispositivo, no por cuenta: el teléfono y la computadora se activan cada uno. La
 * sección no se muestra donde no se puede (desarrollo, modo simulado, un navegador sin Web
 * Push); en iPhone sin instalar la app, en cambio, **sí** se muestra y explica qué falta,
 * porque ahí el motivo no es obvio.
 */
@Component({
  selector: 'app-avisos',
  templateUrl: './avisos.html',
  styleUrl: './avisos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Avisos implements OnInit {
  private readonly push = inject(PushService);
  private readonly toast = inject(ToastService);

  readonly state = this.push.state;
  readonly isWorking = signal(false);
  readonly visible = computed(() => this.state() !== 'unsupported');

  ngOnInit(): void {
    void this.push.refresh();
  }

  async toggle(): Promise<void> {
    if (this.isWorking()) return;
    this.isWorking.set(true);

    const turningOn = this.state() === 'off';
    const result = turningOn ? await this.push.enable() : await this.push.disable();

    this.isWorking.set(false);
    if (result.ok) {
      this.toast.show(turningOn ? 'Listo: te avisaremos aquí.' : 'Avisos desactivados en este dispositivo.');
    } else if (result.message) {
      this.toast.show(result.message, 'error');
    }
  }
}
