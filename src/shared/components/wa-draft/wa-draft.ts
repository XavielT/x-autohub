import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ReplyDraftService, ReplyKind } from '../../services/reply-draft.service';
import { waLinkFor } from '../../utils/reply-templates';

/**
 * "Responder por WhatsApp" con un borrador (bloque 10). Al abrirlo pide un borrador a la IA (`ai-draft-reply`) y, si no se puede, usa la plantilla sin IA que le pasa
 * quien lo usa (`fallback`): siempre hay un texto. El texto es SIEMPRE editable, "Otra versión" pide otro (hasta 3 distintos) y **nada se manda solo**: el botón abre
 * `wa.me` con el texto puesto y quien atiende toca "enviar". No hay bot.
 */
@Component({
  selector: 'app-wa-draft',
  templateUrl: './wa-draft.html',
  styleUrl: './wa-draft.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaDraft {
  private readonly drafts = inject(ReplyDraftService);

  /** Qué se atiende y su id (uuid): de ahí la edge saca el estado y el escenario. */
  readonly kind = input.required<ReplyKind>();
  readonly targetId = input.required<string>();
  /** El teléfono del cliente, con o sin formato. Nunca se le manda a la IA. */
  readonly phone = input.required<string>();
  /** La plantilla sin IA: el respaldo y el texto con el que arranca mientras la IA piensa. */
  readonly fallback = input.required<string>();
  readonly label = input('Responder por WhatsApp');

  /** Avisa cuando se abre WhatsApp (por ejemplo, para marcar la solicitud como respondida). */
  readonly opened = output<void>();

  readonly isOpen = signal(false);
  readonly isThinking = signal(false);
  readonly text = signal('');
  readonly fromAi = signal(false);
  private variant = 0;

  readonly href = computed(() => waLinkFor(this.phone(), this.text() || this.fallback()));

  toggle(): void {
    const open = !this.isOpen();
    this.isOpen.set(open);
    if (open && this.text() === '') this.request();
  }

  /** "Otra versión": la IA da otra redacción (hasta 3 distintas; después vuelve a empezar). Sin IA, vuelve a la plantilla. */
  another(): void {
    this.request();
  }

  private request(): void {
    if (this.isThinking()) return;
    this.variant = (this.variant % 3) + 1;
    this.text.set(this.fallback());
    this.fromAi.set(false);
    this.isThinking.set(true);
    this.drafts.draft(this.kind(), this.targetId(), this.variant).subscribe({
      next: (message) => {
        this.isThinking.set(false);
        if (message) {
          this.text.set(message);
          this.fromAi.set(true);
        }
      },
      error: () => this.isThinking.set(false),
    });
  }

  edit(event: Event): void {
    this.text.set((event.target as HTMLTextAreaElement).value);
  }
}
