import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { ServiceWorks } from '../../../shared/components/service-works/service-works';
import { SERVICE_CATEGORY_LABELS, ServiceModel, ServiceWorkModel } from '../../../shared/models/service.model';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { storeWhatsAppLink } from '../../../shared/utils/contact';
import { formatDuration } from '../../../shared/utils/format-duration';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/**
 * /servicios/:slug — el detalle de un servicio: qué es, cuánto cuesta, cuánto dura,
 * cómo agendarlo o cotizarlo y los trabajos que el taller ya hizo de ese tipo.
 */
@Component({
  selector: 'app-servicio',
  imports: [DecimalPipe, RouterLink, ImageGallery, ServiceWorks],
  templateUrl: './servicio.html',
  styleUrl: './servicio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Servicio {
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(ServiceCatalogService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<LoadState>('loading');
  readonly service = signal<ServiceModel | undefined>(undefined);
  readonly works = signal<ServiceWorkModel[]>([]);

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
    this.route.paramMap
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap((params) => this.catalog.getBySlug(params.get('slug') ?? '')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (service) => {
          this.service.set(service);
          this.state.set(service ? 'ready' : 'missing');
          this.title.setTitle(service ? `${service.title} — Taller | X AutoHub` : 'Servicio no encontrado | X AutoHub');

          if (service) {
            this.catalog.getWorks(service.id).subscribe({ next: (w) => this.works.set(w), error: () => undefined });
          }
        },
        error: () => this.state.set('error'),
      });
  }
}
