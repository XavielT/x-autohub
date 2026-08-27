import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EmailSubscriptionService, SubscriptionResult } from '../../services/email-subscription.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-club-channel',
  imports: [FormsModule],
  templateUrl: './club-channel.html',
  styleUrl: './club-channel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClubChannel {
  private readonly emailService = inject(EmailSubscriptionService);

  readonly email = signal('');
  readonly isLoading = signal(false);
  readonly feedbackMessage = signal('');
  readonly feedbackType = signal<'success' | 'error' | ''>('');

  onSubmit(): void {
    const email = this.email();

    if (!email || !this.isValidEmail(email)) {
      this.setFeedback('Por favor ingresa un correo válido.', 'error');
      return;
    }

    this.isLoading.set(true);
    this.feedbackMessage.set('');

    this.emailService.subscribe(email).subscribe({
      next: (result) => {
        this.setFeedback(this.successMessage(result), 'success');
        this.email.set('');
      },
      error: (err) => {
        this.setFeedback('Algo salió mal. Intenta de nuevo.', 'error');
        console.error(err);
      },
      complete: () => {
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Lo que se le dice a alguien que acaba de suscribirse.
   *
   * Solo se promete el correo cuando la función confirma que lo envió. Antes
   * este mensaje decía "Revisa tu correo" siempre, y no había nada en el sistema
   * que mandara un correo: Xaviel se suscribió en el sitio en vivo y no le llegó
   * nada. Si la función no está desplegada o no tiene la clave de Resend, la
   * suscripción sigue siendo un éxito — pero no se promete lo que no va a pasar.
   */
  private successMessage(result: SubscriptionResult): string {
    if (result.alreadySubscribed) {
      return 'Ya estabas en el club.';
    }

    return result.welcomeEmailSent
      ? '¡Bienvenido al club! Revisa tu correo.'
      : '¡Listo! Ya eres parte del club.';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private setFeedback(message: string, type: 'success' | 'error'): void {
    this.feedbackMessage.set(message);
    this.feedbackType.set(type);
    this.isLoading.set(false);
  }
}
