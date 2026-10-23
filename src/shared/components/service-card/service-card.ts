import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ServiceModel } from '../../models/service.model';
import { formatDuration } from '../../utils/format-duration';

/**
 * La tarjeta de un servicio en /servicios: qué es, cuánto cuesta ("Desde RD$ X" o "A
 * cotizar"), cuánto dura, y el botón que toca — **Agendar** si se agenda, **Cotizar**
 * si no. El título lleva al detalle.
 */
@Component({
  selector: 'app-service-card',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './service-card.html',
  styleUrl: './service-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceCard {
  readonly service = input.required<ServiceModel>();

  readonly duration = computed(() => formatDuration(this.service().durationMinutes));
}
