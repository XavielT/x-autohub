import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WhatsNewService } from '../../services/whats-new.service';

/** Cuántos puntos del changelog caben por versión en la modal. */
const CHANGES_SHOWN = 4;

/**
 * La modal "Novedades": las versiones que la persona no ha visto, cada una con su título, su
 * resumen para el usuario (`userSummary`, o `summary` si falta) y unos pocos puntos de cambio.
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

  protected changes(changes: string[]): string[] {
    return changes.slice(0, CHANGES_SHOWN);
  }

  protected close(): void {
    void this.whatsNew.dismiss();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pending()) this.close();
  }
}
