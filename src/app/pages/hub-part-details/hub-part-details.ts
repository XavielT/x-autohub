import { Component, OnInit } from '@angular/core';
import { HubPartModel } from '../../../shared/models/hub-part.model';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HubPartService } from '../../../shared/services/hub-part.service';
import { RouterLink } from '@angular/router';
import { CartService } from '../../../shared/services/cart';
import { ToastService } from '../../../shared/services/toast.service';
import { CatalogoCard } from '../../../shared/components/catalogo-card/catalogo-card';

@Component({
  selector: 'app-hub-part-details',
  imports: [CommonModule, RouterLink, CatalogoCard],
  templateUrl: './hub-part-details.html',
  styleUrl: './hub-part-details.scss',
})
export class HubPartDetails implements OnInit {
  part: HubPartModel | undefined;
  relatedParts: HubPartModel[] = [];

  images: string[] = [];
  currentImageIndex: number = 0;

  constructor(
    private route: ActivatedRoute,
    private hubPartService: HubPartService,
    private cartService: CartService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.loadPart(id);
    });
  }

  addToCart(): void {
    if (!this.part) return;

    try {
      this.cartService.addToCart(this.part);
      this.toastService.show(`${this.part.name} agregado al carrito`);
    } catch {
      this.toastService.show('No se pudo agregar el articulo', 'error');
    }
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
    this.part = this.hubPartService.getById(id);
    this.currentImageIndex = 0;

    if (!this.part) {
      this.images = [];
      this.relatedParts = this.hubPartService.getAll().slice(0, 4);
      return;
    }

    this.images = this.part.images?.length ? this.part.images : [this.part.imgUrl];
    this.relatedParts = this.hubPartService
      .getByCategory(this.part.category)
      .filter((item) => item.id !== this.part?.id)
      .slice(0, 4);
  }
}
