import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceCard } from '../../../shared/components/service-card/service-card';
import { ServiceWorks } from '../../../shared/components/service-works/service-works';
import {
  AvailabilityRule,
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LABELS,
  ServiceCategory,
  ServiceModel,
  ServiceWorkModel,
} from '../../../shared/models/service.model';
import { PickupAddress } from '../../../shared/models/order.model';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { STORE_PHONE_DISPLAY, storeWhatsAppLink } from '../../../shared/utils/contact';
import { summarizeHours } from '../../../shared/utils/hours';

interface CategoryGroup {
  category: ServiceCategory;
  label: string;
  services: ServiceModel[];
}

/**
 * /servicios — lo que vende el taller, cómo se cotiza y cómo se agenda.
 *
 * De arriba abajo: dos botones grandes (cotizar por WhatsApp, agendar), el catálogo
 * agrupado por categoría, los trabajos realizados (solo si el taller ya publicó
 * alguno), una línea honesta de lo que **no** se hace, y dónde y cuándo se atiende.
 */
@Component({
  selector: 'app-servicios',
  imports: [RouterLink, ServiceCard, ServiceWorks],
  templateUrl: './servicios.html',
  styleUrl: './servicios.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Servicios implements OnInit {
  private readonly catalog = inject(ServiceCatalogService);
  private readonly settings = inject(SiteSettingsService);

  readonly services = signal<ServiceModel[]>([]);
  readonly works = signal<ServiceWorkModel[]>([]);
  readonly rules = signal<AvailabilityRule[]>([]);
  readonly pickup = signal<PickupAddress | null>(null);
  readonly isLoading = signal(true);
  readonly hasError = signal(false);

  readonly phone = STORE_PHONE_DISPLAY;
  readonly quoteLink = storeWhatsAppLink('Hola X AutoHub, quiero cotizar un servicio');

  /** El catálogo por categoría, en el orden fijo de `SERVICE_CATEGORIES`; una categoría vacía no sale. */
  readonly groups = computed<CategoryGroup[]>(() =>
    SERVICE_CATEGORIES.map((category) => ({
      category,
      label: SERVICE_CATEGORY_LABELS[category],
      services: this.services().filter((s) => s.category === category),
    })).filter((g) => g.services.length > 0),
  );

  readonly hours = computed(() => summarizeHours(this.rules()));

  ngOnInit(): void {
    this.catalog.getServices().subscribe({
      next: (services) => {
        this.services.set(services);
        this.isLoading.set(false);
      },
      error: () => {
        this.hasError.set(true);
        this.isLoading.set(false);
      },
    });

    // Lo demás es complemento: si falla, la página sigue con lo que tiene.
    this.catalog.getWorks().subscribe({ next: (w) => this.works.set(w), error: () => undefined });
    this.catalog.getAvailability().subscribe({ next: (r) => this.rules.set(r), error: () => undefined });
    this.settings.getPickupAddress().subscribe({
      // Una dirección de ejemplo no se le enseña a nadie como si fuera la real.
      next: (a) => this.pickup.set(a && !a.isExample ? a : null),
      error: () => undefined,
    });
  }
}
