import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EmailSubscriptionService } from '../../services/email-subscription.service';
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
      next: () => {
        this.setFeedback('¡Bienvenido al club! Revisa tu correo.', 'success');
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

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private setFeedback(message: string, type: 'success' | 'error'): void {
    this.feedbackMessage.set(message);
    this.feedbackType.set(type);
    this.isLoading.set(false);
  }
}
