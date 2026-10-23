import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-info-badge',
  imports: [],
  templateUrl: './info-badge.html',
  styleUrl: './info-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfoBadge {
  readonly text = input.required<string>();
  /**
   * Versión de etiqueta: más chica y con el texto tal como se escribió (la normal
   * lo pasa a "Capitalize Cada Palabra"). Es para ir encima de una tarjeta.
   */
  readonly compact = input(false);
}
