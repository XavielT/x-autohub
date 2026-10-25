import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Lifecycle, isSold } from '../../utils/publication-lifecycle';

/**
 * El aviso de la ficha de una publicación de Hub Market que ya no está a la venta (migración 0030):
 * vendida, o con el plazo vencido. La ficha sigue abierta a propósito —quien guardó el enlace o lo
 * recibió por WhatsApp merece saber qué pasó, no un "no encontrado"—, pero el aviso va arriba y la ficha
 * pierde el botón de WhatsApp.
 *
 * Quien lo usa decide si hay algo que avisar (`isLive`); aquí solo se elige entre las dos frases.
 */
@Component({
  selector: 'app-publication-notice',
  template: `<p class="notice" role="status">{{ text() }}</p>`,
  styles: `
    .notice {
      margin: 0 0 16px;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 141, 143, 0.5);
      background-color: rgba(229, 72, 77, 0.1);
      color: #ff8d8f;
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicationNotice {
  readonly item = input.required<Lifecycle>();

  readonly text = computed(() =>
    isSold(this.item())
      ? 'Esta publicación ya se vendió.'
      : 'Esta publicación venció y su dueño todavía no la renovó.',
  );
}
