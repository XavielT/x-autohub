import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { forkJoin, of, switchMap } from 'rxjs';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { SeoService } from '../../../shared/services/seo.service';
import { hubMarketSeo } from '../../../shared/utils/community-seo';
import { isLive } from '../../../shared/utils/publication-lifecycle';
import { PublicationNotice } from '../../../shared/ui/publication-notice/publication-notice';
import { hubMarketJsonLd } from '../../../shared/utils/structured-data';
import { HubMarketCard } from '../../../shared/components/hub-market-card/hub-market-card';
import { buildWaLink } from '../../../shared/utils/whatsapp';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';

@Component({
  selector: 'app-hub-market-part-details',
  imports: [PublicationNotice, DecimalPipe, RouterLink, HubMarketCard, TestBadge, ImageGallery],
  templateUrl: './hub-market-part-details.html',
  styleUrl: './hub-market-part-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubMarketPartDetails implements OnInit {
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

  readonly part = signal<HubMarketItemModel | undefined>(undefined);
  readonly relatedParts = signal<HubMarketItemModel[]>([]);
  readonly images = signal<string[]>([]);
  readonly isLoading = signal(true);

  /** Enlace de WhatsApp al vendedor, o cadena vacía si no dejó teléfono. */
  readonly waLink = computed(() => {
    const part = this.part();
    if (!part?.contactPhone || !isLive(part)) return '';
    return buildWaLink(
      part.contactPhone,
      `Hola! Vi tu publicacion "${part.title}" en X AutoHub y me interesa.`,
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);

      this.hubMarketService
        .getById(id)
        .pipe(
          switchMap((part) =>
            forkJoin({
              part: of(part),
              related: this.hubMarketService.getByCategory(part?.category ?? 'piezas'),
            }),
          ),
        )
        .subscribe({
          next: ({ part, related }) => {
            this.part.set(part);
            this.images.set(part?.images ?? []);
            this.applySeo(part);
            this.relatedParts.set(related.filter((item) => item.id !== id).slice(0, 4));
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



}
