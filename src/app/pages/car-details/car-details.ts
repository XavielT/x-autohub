import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { CommonModule } from '@angular/common';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';

@Component({
  selector: 'app-car-details',
  imports: [CommonModule, HubMarketCard],
  templateUrl: './car-details.html',
  styleUrl: './car-details.scss',
})
export class CarDetails implements OnInit {
  car: HubMarketItemModel | undefined;
  relatedVehicles: HubMarketItemModel[] = [];
  images: string[] = [];
  currentImageIndex = 0;

  constructor(
    private route: ActivatedRoute,
    private hubMarketService: HubMarketService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.car = this.hubMarketService.getById(id);
      this.currentImageIndex = 0;

      if (this.car) {
        this.images = this.car.images?.length ? this.car.images : [this.car.image];
        this.relatedVehicles = this.hubMarketService.getByCategory('vehiculos')
          .filter(vehicle => vehicle.id !== this.car?.id)
          .slice(0, 4);
      }
    });
  }

  selectImage(index: number): void {
    this.currentImageIndex = index;
  }

  prevImage(): void {
    if (this.images.length <= 1) return;
    this.currentImageIndex = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
  }

  nextImage(): void {
    if (this.images.length <= 1) return;
    this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
  }
}
