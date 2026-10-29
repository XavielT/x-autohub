import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { Reviews } from '../../../shared/components/reviews/reviews';
import { ServiceWorks } from '../../../shared/components/service-works/service-works';
import { SERVICE_CATEGORY_LABELS, ServiceModel, ServiceWorkModel } from '../../../shared/models/service.model';
import { ReviewStats } from '../../../shared/models/review.model';
import { SeoService } from '../../../shared/services/seo.service';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { storeWhatsAppLink } from '../../../shared/utils/contact';
import { formatDuration } from '../../../shared/utils/format-duration';
import { serviceJsonLd } from '../../../shared/utils/structured-data';

import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/**
 * /servicios/:slug — el detalle de un servicio: qué es, cuánto cuesta, cuánto dura,
 * cómo agendarlo o cotizarlo y los trabajos que el taller ya hizo de ese tipo.
 */
@Component({
  selector: 'app-servicio',
  imports: [Skeleton, DecimalPipe, RouterLink, ImageGallery, ServiceWorks, Reviews],
  templateUrl: './servicio.html',
  styleUrl: './servicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Servicio {
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(ServiceCatalogService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly jsonLd = inject(JsonLdService);
  private readonly seo = inject(SeoService);

  readonly state = signal<LoadState>('loading');
  readonly service = signal<ServiceModel | undefined>(undefined);
  readonly works = signal<ServiceWorkModel[]>([]);
  /** Las estadísticas de las reseñas reales; el bloque de reseñas las avisa al cargarlas. */
  readonly reviewStats = signal<ReviewStats | null>(null);

  readonly categoryLabel = computed(() => {
    const s = this.service();
    return s ? SERVICE_CATEGORY_LABELS[s.category] : '';
  });

  readonly duration = computed(() => formatDuration(this.service()?.durationMinutes ?? 0));

  readonly quoteLink = computed(() => {
    const s = this.service();
    return storeWhatsAppLink(s ? `Hola X AutoHub, quiero cotizar: ${s.title}` : undefined);
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.jsonLd.set('service', null);
      this.seo.reset();
    });

    // JSON-LD Service. Sin precio ("a cotizar") no declara oferta.
    effect(() => {
      const service = this.service();
      const stats = this.reviewStats();
      untracked(() => this.jsonLd.set('service', service ? serviceJsonLd(service, { stats }) : null));
    });

    this.route.paramMap
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap((params) => this.catalog.getBySlug(params.get('slug') ?? '')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (service) => {
          this.service.set(service);
          // Las del servicio anterior no valen para este: el bloque de reseñas las vuelve a avisar.
          this.reviewStats.set(null);
          this.state.set(service ? 'ready' : 'missing');
          if (service) {
            const text = (service.description || service.longDescription).trim();
            this.seo.set({
              title: `${service.title} — Taller | X AutoHub`,
              description: text.length > 155 ? `${text.slice(0, 152).trimEnd()}…` : text,
              path: `/servicios/${service.slug}`,
              image: service.images[0],
            });
          } else {
            this.title.setTitle('Servicio no encontrado | X AutoHub');
          }

          if (service) {
            this.catalog.getWorks(service.id).subscribe({ next: (w) => this.works.set(w), error: () => undefined });
          }
        },
        error: () => this.state.set('error'),
      });
  }
}
