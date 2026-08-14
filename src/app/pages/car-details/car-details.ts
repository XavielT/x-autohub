import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { CarCard } from '../../../shared/components/car-card/car-card';
import { buildWaLink } from '../../../shared/utils/whatsapp';

@Component({
  selector: 'app-car-details',
  imports: [CarCard, RouterLink, DecimalPipe, SlicePipe],
  templateUrl: './car-details.html',
  styleUrl: './car-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly hubMarketService = inject(HubMarketService);

  readonly car = signal<HubMarketItemModel | undefined>(undefined);
  readonly relatedVehicles = signal<HubMarketItemModel[]>([]);
  readonly images = signal<string[]>([]);
  readonly currentImageIndex = signal(0);
  readonly isLoading = signal(true);

  readonly isDescriptionExpanded = signal(false);
  readonly maxDescriptionLength = 200;

  /**
   * Enlace de WhatsApp al vendedor, o cadena vacía si no dejó teléfono.
   *
   * La plantilla usa la cadena vacía como condición: sin teléfono no hay botón,
   * y el bloque del vendedor queda solo con su nombre.
   */
  readonly waLink = computed(() => {
    const car = this.car();
    if (!car?.contactPhone) return '';
    return buildWaLink(
      car.contactPhone,
      `Hola! Vi tu publicacion "${car.title}" en X AutoHub y me interesa.`,
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);
      this.currentImageIndex.set(0);

      forkJoin({
        car: this.hubMarketService.getById(id),
        related: this.hubMarketService.getByCategory('vehiculos'),
      }).subscribe({
        next: ({ car, related }) => {
          this.car.set(car);
          this.images.set(car?.images ?? []);
          this.relatedVehicles.set(related.filter((v) => v.id !== id).slice(0, 4));
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }

  selectImage(index: number): void {
    this.currentImageIndex.set(index);
  }

  prevImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i - 1 + total) % total);
  }

  nextImage(): void {
    const total = this.images().length;
    if (total <= 1) return;
    this.currentImageIndex.update((i) => (i + 1) % total);
  }

  toggleDescription(): void {
    this.isDescriptionExpanded.update((expanded) => !expanded);
  }
}
