import { Component, Input } from '@angular/core';
import { CarCardModel } from '../../models/car-card.model';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-car-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './car-card.html',
  styleUrl: './car-card.scss',
})
export class CarCard {

  @Input() car!: CarCardModel;
}
