import { Component, OnInit } from '@angular/core';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { RouterLink } from '@angular/router';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';

@Component({
  selector: 'app-hub-market-part-details',
  imports: [CommonModule, RouterLink, HubMarketCard],
  templateUrl: './hub-market-part-details.html',
  styleUrl: './hub-market-part-details.scss',
})
export class HubMarketPartDetails implements OnInit {
  part: HubMarketItemModel | undefined;
  relatedParts: HubMarketItemModel[] = [];

  images: string[] = [];
  currentImageIndex: number = 0;

  constructor(
    private route: ActivatedRoute,
    private hubMarketService: HubMarketService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.loadPart(id);
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

  private loadPart(id: number): void {
    this.part = this.hubMarketService.getById(id);
    this.currentImageIndex = 0;

    if (!this.part) {
      this.images = [];
      this.relatedParts = this.hubMarketService.getByCategory('piezas').slice(0, 4);
      return;
    }

    //this.images = this.part.images?.length ? this.part.images : [this.part.images];
    this.images = this.part.images;
    this.relatedParts = this.hubMarketService
      .getByCategory(this.part.category)
      .filter((item) => item.id !== this.part?.id)
      .slice(0, 4);
  }
}