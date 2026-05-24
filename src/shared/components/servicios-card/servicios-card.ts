import { Component, Input } from '@angular/core';
import { ServiciosCardModel } from '../../models/servicios-card.model';

@Component({
  selector: 'app-servicios-card',
  imports: [],
  templateUrl: './servicios-card.html',
  styleUrl: './servicios-card.scss',
})
export class ServiciosCard {
  @Input() serviciosCard!: ServiciosCardModel;
}
