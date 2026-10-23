import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { HighlightBadge } from '../../../shared/ui/highlight-badge/highlight-badge';

/**
 * El hero con video. Con el pivote dejó de abrir el home y se mudó al inicio de
 * `/social-hub` (la Comunidad), con el texto cambiado a la comunidad.
 *
 * Los dos botones no navegan: avisan, y la página decide qué pestaña mostrar y
 * a dónde bajar. Son anclas dentro de la misma página.
 */
@Component({
  selector: 'app-home-welcome',
  imports: [HighlightBadge],
  templateUrl: './home-welcome.html',
  styleUrl: './home-welcome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeWelcome {
  readonly viewClubs = output<void>();
  readonly viewEvents = output<void>();
}
