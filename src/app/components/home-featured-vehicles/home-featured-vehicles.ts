import { Component } from '@angular/core';
import { CarCard } from '../../../shared/components/car-card/car-card';
import { CarCardModel } from '../../../shared/models/car-card.model';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-featured-vehicles',
  standalone: true,
  imports: [CarCard, CommonModule, RouterLink],
  templateUrl: './home-featured-vehicles.html',
  styleUrl: './home-featured-vehicles.scss',
})
export class HomeFeaturedVehicles {
  cars: CarCardModel[] = [
    {
      image: 'assets/imgs/supra-white.jpg',
      brand: 'Toyota',
      model: 'Supra',
      price: '$130,000',
      year: '1994',
      hp: 873,
      zeroTo100: 3.8,
      topSpeed: 350,
      mileage: 180000
    },
    {
      image: 'assets/imgs/vw-golf-mk4.png',
      brand: 'Volkswagen',
      model: 'Golf',
      price: '$8,000',
      year: '2003',
      hp: 325,
      zeroTo100: 10.0,
      topSpeed: 220,
      mileage: 210000
    },
    {
      image: 'assets/imgs/citroen-c3.png',
      brand: 'Citroen',
      model: 'C3',
      price: '$5,000',
      year: '2003',
      hp: 110,
      zeroTo100: 14.9,
      topSpeed: 180,
      mileage: 185000
    },
  ]
}
