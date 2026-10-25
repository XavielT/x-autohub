import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../../../shared/services/auth.service';
import { PushService, PushState } from '../../../../shared/services/push.service';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * "Avísame cuando mi pedido cambie": los avisos push de **un pedido** para quien compró sin cuenta (migración 0034).
 *
 * Quien tiene cuenta recibe los avisos de todos sus pedidos desde /perfil (`app-avisos`), así que aquí no se le ofrece
 * nada. El invitado activa los de este pedido, en este dispositivo; el uuid del pedido es la llave, como para ver la
 * página. Como en `app-avisos`, no se muestra donde no se puede (desarrollo, modo simulado, un navegador sin Web Push);
 * en iPhone sin instalar la app sí, para explicar qué falta.
 */
@Component({
  selector: 'app-pedido-avisos',
  templateUrl: './pedido-avisos.html',
  styleUrl: './pedido-avisos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PedidoAvisos implements OnInit {
  private readonly push = inject(PushService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly orderId = input.required<string>();

  readonly state = signal<PushState>('unsupported');
  readonly isWorking = signal(false);

  /** Solo a quien no tiene sesión, y solo si este dispositivo puede (o puede explicar por qué no). */
  readonly visible = computed(() => !this.auth.user() && this.state() !== 'unsupported');

  async ngOnInit(): Promise<void> {
    this.state.set(await this.push.orderState(this.orderId()));
  }

  async toggle(): Promise<void> {
    if (this.isWorking()) return;
    this.isWorking.set(true);

    const turningOn = this.state() === 'off';
    const result = turningOn ? await this.push.enableForOrder(this.orderId()) : await this.push.disableForOrder(this.orderId());
    this.state.set(await this.push.orderState(this.orderId()));

    this.isWorking.set(false);
    if (result.ok) {
      this.toast.show(turningOn ? 'Listo: te avisaremos aquí cuando tu pedido cambie.' : 'Avisos desactivados para este pedido.');
    } else if (result.message) {
      this.toast.show(result.message, 'error');
    }
  }
}
