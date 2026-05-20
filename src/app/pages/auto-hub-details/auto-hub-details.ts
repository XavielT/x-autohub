import { Component, OnInit } from '@angular/core';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { ActivatedRoute } from '@angular/router';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auto-hub-details',
  imports: [CommonModule],
  templateUrl: './auto-hub-details.html',
  styleUrl: './auto-hub-details.scss',
})
export class AutoHubDetails implements OnInit{

  auto: AutoHubModel | undefined;
  //relatedVehicles: AutoHubModel[] = [];
  images: string[] = [];
  currentImageIndex = 0;
  isDescriptionExpanded = false;
  maxDescriptionLength = 200;

  constructor(
    private route: ActivatedRoute,
    private autoHubService: AutoHubService
  ){}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.loadAuto(id);
    });
  }
  
  private loadAuto(id: number): void {
    this.auto = this.autoHubService.getById(id);
    //this.images = this.auto.images?.length ? this.auto.images : [this.auto.imgUrl];
    if (!this.auto) {
      this.images = [];
      return;
    }

    this.images = this.auto.images?.length ? this.auto.images : [];
    this.currentImageIndex = 0;
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

  toggleDescription(): void {
    this.isDescriptionExpanded = !this.isDescriptionExpanded;
  }
}
