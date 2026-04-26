import { Component } from '@angular/core';
import { EmailSubscriptionService } from '../../services/email-subscription.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-club-channel',
  imports: [FormsModule],
  templateUrl: './club-channel.html',
  styleUrl: './club-channel.scss',
})
export class ClubChannel {
  email: string = '';
  isLoading: boolean = false;
  feedbackMessage: string = '';
  feedbackType: 'success' | 'error' | '' = '';

  constructor(private emailService: EmailSubscriptionService) { }

  onSubmit(): void {
    if (!this.email || !this.isValidEmail(this.email)) {
      this.setFeedback('Por favor ingresa un correo válido.', 'error');
      return;
    }

    this.isLoading = true;
    this.feedbackMessage = '';

    this.emailService.subscribe(this.email).subscribe({
      next: () => {
        this.setFeedback('¡Bienvenido al club! Revisa tu correo.', 'success');
        this.email = '';
      },
      error: (err) => {
        this.setFeedback('Algo salió mal. Intenta de nuevo.', 'error');
        console.error(err);
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private setFeedback(message: string, type: 'success' | 'error'): void {
    this.feedbackMessage = message;
    this.feedbackType = type;
    this.isLoading = false;
  }
}
