import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ServiceWorkModel } from '../../models/service.model';

/**
 * "Trabajos realizados": la galería de antes y después. Un trabajo sin foto de antes
 * muestra solo el después (y viceversa); sin ninguna foto, solo el texto.
 */
@Component({
  selector: 'app-service-works',
  imports: [DatePipe],
  templateUrl: './service-works.html',
  styleUrl: './service-works.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceWorks {
  readonly works = input.required<readonly ServiceWorkModel[]>();
}
