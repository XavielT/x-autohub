import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WhatsNewService } from '../../services/whats-new.service';

/**
 * La modal "Novedades": las versiones que la persona no ha visto, cada una con su título y su
 * resumen para el usuario (`userSummary`). Nunca el changelog técnico (`summary`, `changes`): ese
 * es del panel de admin, y a quien usa el sitio no le sirve ni conviene contárselo (0062).
 * Se cierra con "Entendido", con Escape o tocando fuera.
 */
@Component({
  selector: 'app-whats-new-modal',
  imports: [DatePipe, RouterLink],
  templateUrl: './whats-new-modal.html',
  styleUrl: './whats-new-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsNewModal {
  private readonly whatsNew = inject(WhatsNewService);

  protected readonly pending = this.whatsNew.pending;

  protected close(): void {
    void this.whatsNew.dismiss();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pending()) this.close();
  }
}
