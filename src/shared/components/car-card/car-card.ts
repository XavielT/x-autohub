import { Component, Input } from '@angular/core';
//import { CarCardModel } from '../../models/car-card.model';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HubMarketItemModel } from '../../models/hub-market-item.model';

@Component({
  selector: 'app-car-card',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './car-card.html',
  styleUrl: './car-card.scss',
})
export class CarCard {

  @Input() car!: HubMarketItemModel;
}
