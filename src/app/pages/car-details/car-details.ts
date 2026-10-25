import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { SeoService } from '../../../shared/services/seo.service';
import { hubMarketSeo } from '../../../shared/utils/community-seo';
import { isLive } from '../../../shared/utils/publication-lifecycle';
import { PublicationNotice } from '../../../shared/ui/publication-notice/publication-notice';
import { hubMarketJsonLd } from '../../../shared/utils/structured-data';
import { CarCard } from '../../../shared/components/car-card/car-card';
import { buildWaLink } from '../../../shared/utils/whatsapp';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';

@Component({
  selector: 'app-car-details',
  imports: [PublicationNotice, CarCard, RouterLink, DecimalPipe, SlicePipe, TestBadge, ImageGallery],
  templateUrl: './car-details.html',
  styleUrl: './car-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CarDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly hubMarketService = inject(HubMarketService);
  private readonly seo = inject(SeoService);
  /** Para la plantilla: la ficha avisa cuando la publicación ya no está a la venta. */
  protected readonly isLive = isLive;
  private readonly jsonLd = inject(JsonLdService);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.seo.reset();
      this.jsonLd.set('listing', null);
    });
  }

  readonly car = signal<HubMarketItemModel | undefined>(undefined);
  readonly relatedVehicles = signal<HubMarketItemModel[]>([]);
  readonly images = signal<string[]>([]);
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
    if (!car?.contactPhone || !isLive(car)) return '';
    return buildWaLink(
      car.contactPhone,
      `Hola! Vi tu publicacion "${car.title}" en X AutoHub y me interesa.`,
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);

      forkJoin({
        car: this.hubMarketService.getById(id),
        related: this.hubMarketService.getByCategory('vehiculos'),
      }).subscribe({
        next: ({ car, related }) => {
          this.car.set(car);
          this.images.set(car?.images ?? []);
          this.applySeo(car);
          this.relatedVehicles.set(related.filter((v) => v.id !== id).slice(0, 4));
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }

  /** Título, descripción y vista previa de la ficha. Una publicación de prueba no se anuncia. */
  private applySeo(item: HubMarketItemModel | undefined): void {
    if (item && !item.isTest) {
      // Una vendida o vencida sigue abierta pero no se indexa: ya no está a la venta.
      this.seo.set({ ...hubMarketSeo(item), noindex: !isLive(item) });
      this.jsonLd.set('listing', isLive(item) ? hubMarketJsonLd(item) : null);
      return;
    }
    this.seo.reset();
    this.jsonLd.set('listing', null);
    this.seo.set({
      title: 'Publicación no encontrada | X AutoHub',
      description: 'Esa publicación ya no está en Hub Market.',
      path: '/hub-market',
    });
  }




  toggleDescription(): void {
    this.isDescriptionExpanded.update((expanded) => !expanded);
  }
}
