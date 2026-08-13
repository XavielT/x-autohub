import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CarCard } from '../../../shared/components/car-card/car-card';
import { RouterLink } from '@angular/router';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';

@Component({
  selector: 'app-home-featured-vehicles',
  standalone: true,
  imports: [CarCard, RouterLink],
  templateUrl: './home-featured-vehicles.html',
  styleUrl: './home-featured-vehicles.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFeaturedVehicles implements OnInit {
  private readonly hubMarketService = inject(HubMarketService);

  readonly cars = signal<HubMarketItemModel[]>([]);

  ngOnInit(): void {
    this.hubMarketService.getFeaturedVehicles().subscribe((cars) => this.cars.set(cars));
  }
}
