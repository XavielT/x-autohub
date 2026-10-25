import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { SeoService } from '../../../shared/services/seo.service';
import { hubMarketSeo } from '../../../shared/utils/community-seo';
import { isLive } from '../../../shared/utils/publication-lifecycle';
import { PublicationNotice } from '../../../shared/ui/publication-notice/publication-notice';
import { hubMarketJsonLd } from '../../../shared/utils/structured-data';
import { buildWaLink } from '../../../shared/utils/whatsapp';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';

@Component({
  selector: 'app-accessory-details',
  imports: [PublicationNotice, DecimalPipe, TestBadge, RouterLink, ImageGallery],
  templateUrl: './accessory-details.html',
  styleUrl: './accessory-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoryDetails implements OnInit {
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

  readonly accessory = signal<HubMarketItemModel | undefined>(undefined);
  readonly isLoading = signal(true);

  /** Enlace de WhatsApp al vendedor, o cadena vacía si no dejó teléfono. */
  readonly waLink = computed(() => {
    const accessory = this.accessory();
    if (!accessory?.contactPhone || !isLive(accessory)) return '';
    return buildWaLink(
      accessory.contactPhone,
      `Hola! Vi tu publicacion "${accessory.title}" en X AutoHub y me interesa.`,
    );
  });

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

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);

      this.hubMarketService.getById(id).subscribe({
        next: (accessory) => {
          this.accessory.set(accessory);
          this.applySeo(accessory);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }
}
