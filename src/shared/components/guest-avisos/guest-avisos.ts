import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { GuestPushKind, PushService, PushState } from '../../services/push.service';
import { ToastService } from '../../services/toast.service';

/** Lo que cambia entre un pedido y una cita: los textos. El mecanismo es el mismo. */
const COPY: Record<GuestPushKind, { heading: string; off: string; on: string; enabled: string; disabled: string }> = {
  order: {
    heading: 'Avísame cuando mi pedido cambie',
    off: 'Recibe una notificación cuando confirmemos tu pago, salga tu pedido o esté listo para retirar. No necesitas cuenta.',
    on: 'Activados. Te avisamos en este dispositivo cuando tu pedido avance, aunque no tengas esta página abierta.',
    enabled: 'Listo: te avisaremos aquí cuando tu pedido cambie.',
    disabled: 'Avisos desactivados para este pedido.',
  },
  appointment: {
    heading: 'Avísame cuando mi cita cambie',
    off: 'Recibe una notificación cuando confirmemos tu cita, empecemos a trabajar en tu vehículo o quede lista. No necesitas cuenta.',
    on: 'Activados. Te avisamos en este dispositivo cuando tu cita avance, aunque no tengas esta página abierta.',
    enabled: 'Listo: te avisaremos aquí cuando tu cita cambie.',
    disabled: 'Avisos desactivados para esta cita.',
  },
};

/**
 * "Avísame cuando cambie": los avisos push de **un pedido o de una cita** para quien no tiene cuenta (migraciones 0034 y 0035).
 *
 * Quien tiene cuenta recibe los avisos de todos sus pedidos y citas desde /perfil (`app-avisos`), así que aquí no se le ofrece
 * nada. El invitado activa los de este pedido o esta cita, en este dispositivo; el uuid es la llave, como para ver la página
 * o recibir la confirmación. Como en `app-avisos`, no se muestra donde no se puede (desarrollo, modo simulado, un navegador
 * sin Web Push); en iPhone sin instalar la app sí, para explicar qué falta.
 */
@Component({
  selector: 'app-guest-avisos',
  templateUrl: './guest-avisos.html',
  styleUrl: './guest-avisos.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestAvisos implements OnInit {
  private readonly push = inject(PushService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly kind = input.required<GuestPushKind>();
  /** El uuid del pedido o de la cita. */
  readonly targetId = input.required<string>();

  readonly state = signal<PushState>('unsupported');
  readonly isWorking = signal(false);

  readonly copy = computed(() => COPY[this.kind()]);

  /** Solo a quien no tiene sesión, y solo si este dispositivo puede (o puede explicar por qué no). */
  readonly visible = computed(() => !this.auth.user() && this.state() !== 'unsupported');

  private target() {
    return { kind: this.kind(), id: this.targetId() };
  }

  async ngOnInit(): Promise<void> {
    this.state.set(await this.push.guestState(this.target()));
  }

  async toggle(): Promise<void> {
    if (this.isWorking()) return;
    this.isWorking.set(true);

    const turningOn = this.state() === 'off';
    const result = turningOn ? await this.push.enableForGuest(this.target()) : await this.push.disableForGuest(this.target());
    this.state.set(await this.push.guestState(this.target()));

    this.isWorking.set(false);
    if (result.ok) {
      this.toast.show(turningOn ? this.copy().enabled : this.copy().disabled);
    } else if (result.message) {
      this.toast.show(result.message, 'error');
    }
  }
}
