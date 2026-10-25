import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { JsonLdService } from '../../../shared/services/json-ld.service';
import { SeoService } from '../../../shared/services/seo.service';
import { autoHubSeo } from '../../../shared/utils/community-seo';
import { autoHubJsonLd } from '../../../shared/utils/structured-data';
import { formatDrPhone } from '../../../shared/utils/phone';
import { buildWaLink } from '../../../shared/utils/whatsapp';
import { ExpandableText } from '../../../shared/ui/expandable-text/expandable-text';
import { ImageGallery } from '../../../shared/ui/image-gallery/image-gallery';
import { TestBadge } from '../../../shared/ui/test-badge/test-badge';

@Component({
  selector: 'app-auto-hub-details',
  imports: [DecimalPipe, TestBadge, ImageGallery, ExpandableText],
  templateUrl: './auto-hub-details.html',
  styleUrl: './auto-hub-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoHubDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly autoHubService = inject(AutoHubService);
  private readonly seo = inject(SeoService);
  private readonly jsonLd = inject(JsonLdService);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.seo.reset();
      this.jsonLd.set('listing', null);
    });
  }

  readonly auto = signal<AutoHubModel | undefined>(undefined);
  readonly images = signal<string[]>([]);
  readonly isLoading = signal(true);

  /**
   * El teléfono como se lee, no como se guarda: `8099539782` → `809-953-9782`.
   *
   * En Auto Hub el `contact` es de la empresa y es obligatorio en el esquema,
   * así que aquí no hay caso de "sin teléfono" — a diferencia de Hub Market,
   * donde lo pone el vendedor y es opcional.
   */
  readonly contactDisplay = computed(() => formatDrPhone(this.auto()?.contact ?? ''));

  /** Enlace de WhatsApp al concesionario. El mensaje nombra el vehículo. */
  readonly waLink = computed(() => {
    const auto = this.auto();
    if (!auto?.contact) return '';
    return buildWaLink(
      auto.contact,
      `Hola! Vi el ${auto.brand} ${auto.model} en X AutoHub y me interesa.`,
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      this.isLoading.set(true);

      this.autoHubService.getById(id).subscribe({
        next: (auto) => {
          this.auto.set(auto);
          this.images.set(auto?.images ?? []);
          this.applySeo(auto);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false),
      });
    });
  }

  /** Título, descripción y vista previa de la ficha. Un vehículo de prueba no se anuncia: se queda con lo genérico. */
  private applySeo(auto: AutoHubModel | undefined): void {
    if (auto && !auto.isTest) {
      this.seo.set(autoHubSeo(auto));
      this.jsonLd.set('listing', autoHubJsonLd(auto));
      return;
    }
    this.seo.reset();
    this.jsonLd.set('listing', null);
    this.seo.set({
      title: 'Vehículo no encontrado | X AutoHub',
      description: 'Ese vehículo ya no está en Auto Hub.',
      path: '/auto-hub',
    });
  }




}
