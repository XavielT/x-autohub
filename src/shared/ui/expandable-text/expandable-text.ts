import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * Un texto largo recortado a `maxLength` caracteres, con "Ver más" / "Ver menos".
 *
 * Sustituye al `toggleDescription()` que car-details y auto-hub-details traían copiado. Si el
 * texto cabe, no pinta el botón. El texto se recorta en el HTML prerenderizado igual que en el
 * navegador (el JSON-LD y la meta descripción llevan el texto completo, no esto).
 */
@Component({
  selector: 'app-expandable-text',
  templateUrl: './expandable-text.html',
  styleUrl: './expandable-text.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpandableText {
  readonly text = input.required<string>();
  readonly maxLength = input(200);

  protected readonly expanded = signal(false);

  protected readonly isLong = computed(() => this.text().length > this.maxLength());
  protected readonly shown = computed(() =>
    this.expanded() || !this.isLong() ? this.text() : this.text().slice(0, this.maxLength()) + '...',
  );

  protected toggle(): void {
    this.expanded.update((value) => !value);
  }
}
