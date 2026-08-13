import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ServiciosCardModel } from '../../models/servicios-card.model';

@Component({
  selector: 'app-servicios-card',
  imports: [],
  templateUrl: './servicios-card.html',
  styleUrl: './servicios-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiciosCard {
  readonly serviciosCard = input.required<ServiciosCardModel>();
}
