import { Component } from '@angular/core';
import { CarCard } from '../../../shared/components/car-card/car-card';
//import { CarCardModel } from '../../../shared/models/car-card.model';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

@Component({
  selector: 'app-home-featured-vehicles',
  standalone: true,
  imports: [CarCard, CommonModule, RouterLink],
  templateUrl: './home-featured-vehicles.html',
  styleUrl: './home-featured-vehicles.scss',
})
export class HomeFeaturedVehicles {
  cars: HubMarketItemModel[] = [];

  constructor(private hubMarketService: HubMarketService) {
    this.cars = this.hubMarketService.getFeaturedVehicles();
  }
}
